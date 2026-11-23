/* ============================================================
   02-providers.js - OpenAI-compatible / Anthropic / Gemini adapters
   - SSE streaming, reasoning separation, tool calls, retry with backoff
   - Remote model lists, title generation, image generation
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI;

  /* ---------------- Generic HTTP helpers ---------------- */
  function mergeHeaders(...objs) {
    const out = {};
    objs.forEach(o => {
      if (o && typeof o === 'object')
        Object.keys(o).forEach(k => {
          if (o[k] != null && o[k] !== '') out[k] = String(o[k]);
        });
    });
    return out;
  }
  function deepMerge(a, b) {
    const out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(k => {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object')
        out[k] = deepMerge(out[k], b[k]);
      else if (b[k] !== undefined) out[k] = b[k];
    });
    return out;
  }
  AI.fetchWithRetry = async function (url, init, signal, tries) {
    const st = AI.state.settings;
    tries = tries || (st.retry ? Math.max(1, Math.min(8, st.retryCount | 0 || 3)) : 1);
    const baseMs = Math.max(100, st.retryBaseMs | 0 || 600);
    let lastErr;
    for (let i = 0; i < tries; i++) {
      if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
      try {
        const r = await fetch(url, Object.assign({}, init, { signal }));
        if (!r.ok) {
          let detail = '';
          try {
            const t = await r.clone().text();
            detail = t.slice(0, 400);
          } catch (e) {}
          const err = new Error(
            `HTTP ${r.status} ${r.statusText}${detail ? ' · ' + detail.replace(/\s+/g, ' ').slice(0, 220) : ''}`
          );
          err.status = r.status;
          if (r.status === 429 || r.status >= 500) {
            const ra = parseInt(r.headers.get('retry-after') || '0', 10);
            const wait = ra > 0 ? ra * 1000 : Math.min(12000, baseMs * Math.pow(2, i) + Math.random() * 300);
            if (AI.onStatus) AI.onStatus(AI.t('retrying') + ` (${i + 1}/${tries})`);
            await AI.sleep(wait);
            lastErr = err;
            continue;
          }
          throw err;
        }
        return r;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (e.status) throw e;
        lastErr = e;
        if (i < tries - 1) {
          await AI.sleep(Math.min(12000, baseMs * Math.pow(2, i) + Math.random() * 250));
          continue;
        }
      }
    }
    throw lastErr || new Error('Network error');
  };

  /* ---------------- Token accounting: prefer the API usage object ----------------
   Field names vary across gateways: OpenAI uses prompt_tokens /
   completion_tokens, Anthropic uses input_tokens / output_tokens, Gemini uses
   usageMetadata, and OpenRouter plus common relays place usage inside
   choices[0], x_usage or data. Normalise everything to
   { in, out, total, cached, reasoning, source:'api' }.
   Local estimation is used only when the API returns no usage at all, and is
   flagged accordingly in 06-main.js. */
  function usageNum(v) {
    if (v == null || v === '' || typeof v === 'object') return null;
    const n = Number(String(v).replace(/[, _]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function usagePick() {
    for (let i = 0; i < arguments.length; i++) {
      const n = usageNum(arguments[i]);
      if (n != null) return n;
    }
    return null;
  }
  function usageFrom(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const u = obj.usage || obj.usageMetadata || obj.token_usage || obj.tokenUsage || obj;
    const d = u.prompt_tokens_details || u.input_tokens_details || {};
    const od = u.completion_tokens_details || u.output_tokens_details || {};
    const inTok = usagePick(
      u.prompt_tokens,
      u.input_tokens,
      u.promptTokens,
      u.inputTokenCount,
      u.prompt_token_count,
      u.promptTokenCount,
      obj.input_tokens,
      obj.prompt_tokens
    );
    const outTok = usagePick(
      u.completion_tokens,
      u.output_tokens,
      u.completionTokens,
      u.outputTokenCount,
      u.candidatesTokenCount,
      u.completion_token_count,
      obj.output_tokens,
      obj.completion_tokens
    );
    if (inTok == null && outTok == null) return null;
    const total = usagePick(u.total_tokens, u.totalTokens, u.totalTokenCount, obj.total_tokens);
    const cached = usagePick(
      d.cached_tokens,
      u.cached_tokens,
      u.cache_read_input_tokens,
      u.cachedContentTokenCount,
      u.cache_creation_input_tokens
    );
    const reasoning = usagePick(od.reasoning_tokens, u.reasoning_tokens, u.thoughtsTokenCount);
    return {
      in: inTok || 0,
      out: outTok || 0,
      /* totalFromApi: only an explicit total_* field from the server is trusted.
   Anthropic message_start supplies input only and message_delta supplies
   output only; including a derived total in the max merge would yield 321
   instead of 339. */
      total: total != null ? total : (inTok || 0) + (outTok || 0),
      totalFromApi: total != null,
      cached: cached || 0,
      reasoning: reasoning || 0,
      source: 'api'
    };
  }
  /* All locations where usage may appear in an SSE event or response body. */
  function findUsage(j) {
    if (!j || typeof j !== 'object') return null;
    const c0 = (j.choices || [])[0];
    const places = [
      j,
      j.message,
      j.message && j.message.usage,
      j.response,
      j.data,
      c0,
      c0 && c0.usage,
      j.usage,
      j.usageMetadata,
      j.x_usage
    ];
    for (const x of places) {
      const u = usageFrom(x);
      if (u) return u;
    }
    return null;
  }
  /* Merging multiple usage chunks from one request:
   - in, out, cached and reasoning take the maximum of each field, which
     converges for both cumulative and partial chunks.
   - total is taken from the server only when explicitly provided; otherwise
     it is recomputed from the converged in+out values, so a partial computed
     total is never mistaken for the final figure. */
  function mergeUsage(a, b) {
    if (!b) return a;
    if (!a) return b;
    const inTok = Math.max(a.in || 0, b.in || 0),
      outTok = Math.max(a.out || 0, b.out || 0);
    const fromApi = !!(a.totalFromApi || b.totalFromApi);
    return {
      in: inTok,
      out: outTok,
      total: fromApi ? Math.max(a.total || 0, b.total || 0) : inTok + outTok,
      totalFromApi: fromApi,
      cached: Math.max(a.cached || 0, b.cached || 0),
      reasoning: Math.max(a.reasoning || 0, b.reasoning || 0),
      source: 'api'
    };
  }
  /* Errors embedded in SSE data or the response body are surfaced instead of becoming an empty reply. */
  function throwApiError(j) {
    if (!j || typeof j !== 'object') return;
    const e = j.error || (j.type === 'error' && j) || j.error_message;
    if (!e) return;
    const msg = typeof e === 'string' ? e : e.message || e.msg || e.error || JSON.stringify(e);
    throw new Error('API 返回错误：' + String(msg).slice(0, 400));
  }

  /* ---------------- SSE parsing ---------------- */
  async function* sseEvents(resp) {
    if (!resp.body) return;
    const reader = resp.body.getReader(),
      dec = new TextDecoder();
    let buf = '',
      data = [],
      ev = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line === '') {
          if (data.length) {
            yield { event: ev, data: data.join('\n') };
            data = [];
            ev = '';
          }
          continue;
        }
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
        else if (line.startsWith(':')) {
          /* keep-alive comment */
        }
      }
    }
    if (data.length) yield { event: ev, data: data.join('\n') };
  }

  /* ---------------- <think> tag splitting (stream-safe) ---------------- */
  function ThinkSplit() {
    this.raw = '';
    this.pos = 0;
    this.inThink = false;
    this.emittedThink = false;
  }
  /* finish(): called at end of stream. If still inside <think>, settle the
   remaining text as reasoning; otherwise return any retained partial tag
   prefix to the body so trailing characters are not lost. */
  ThinkSplit.prototype.finish = function () {
    let content = '',
      reasoning = '';
    if (this.inThink) {
      reasoning = this.raw.slice(this.pos);
      this.inThink = false;
    } else content = this.raw.slice(this.pos);
    this.pos = this.raw.length;
    return { content, reasoning };
  };
  ThinkSplit.prototype.feed = function (s) {
    if (!s) return { content: '', reasoning: '' };
    this.raw += s;
    let out = '',
      think = '',
      guard = 0;
    while (guard++ < 1000) {
      if (this.inThink) {
        const end = this.raw.indexOf('</think>', this.pos);
        if (end < 0) {
          think += this.raw.slice(this.pos);
          this.pos = this.raw.length;
          break;
        }
        think += this.raw.slice(this.pos, end);
        this.pos = end + 8;
        this.inThink = false;
      } else {
        const start = this.raw.indexOf('<think>', this.pos);
        if (start < 0) {
          const cut = Math.max(this.pos, this.raw.length - 7);
          const tail = this.raw.slice(cut);
          if (/<(\/)?t(h(i(n(k(>)?)?)?)?)?$/i.test(tail)) {
            out += this.raw.slice(this.pos, cut);
            this.pos = cut;
          } else {
            out += this.raw.slice(this.pos);
            this.pos = this.raw.length;
          }
          break;
        }
        out += this.raw.slice(this.pos, start);
        this.pos = start + 7;
        this.inThink = true;
      }
    }
    return { content: out, reasoning: think };
  };

  /* ---------------- Message format conversion ---------------- */
  function toText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(p => p.text || (p.type === 'text' && p.text) || '').join('\n');
    return String(content || '');
  }
  function toAnthropicContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content || '');
    return content.map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text || '' };
      if (p.type === 'image_url') {
        const url = (p.image_url && p.image_url.url) || '';
        const m = /^data:([^;]+);base64,(.*)$/.exec(url);
        if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
        return { type: 'text', text: '[image] ' + url };
      }
      return { type: 'text', text: '' };
    });
  }
  function toGeminiParts(content) {
    if (typeof content === 'string') return [{ text: content }];
    if (!Array.isArray(content)) return [{ text: String(content || '') }];
    return content.map(p => {
      if (p.type === 'text') return { text: p.text || '' };
      if (p.type === 'image_url') {
        const url = (p.image_url && p.image_url.url) || '';
        const m = /^data:([^;]+);base64,(.*)$/.exec(url);
        if (m) return { inline_data: { mime_type: m[1], data: m[2] } };
        return { text: '[image] ' + url };
      }
      return { text: '' };
    });
  }
  function toolsToOpenAI(tools) {
    return (tools || []).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} }
      }
    }));
  }
  function toolsToAnthropic(tools) {
    return (tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.parameters || { type: 'object', properties: {} }
    }));
  }
  function toolsToGemini(tools) {
    if (!tools || !tools.length) return undefined;
    return [
      {
        function_declarations: tools.map(t => ({
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} }
        }))
      }
    ];
  }

  /* ============================================================
   AI.chat - unified entry point
   Returns { content, reasoning, toolCalls, usage }
   ============================================================ */
  AI.chat = async function (opts) {
    const p = opts.provider,
      m = opts.model || {};
    const type = p.type || 'openai';
    const base = (m.baseUrl || p.baseUrl || '').replace(/\/+$/, '');
    const key = m.apiKey || p.apiKey || '';
    if (!base) throw new Error('API Base URL 未配置');
    if (!key && !/localhost|127\.0\.0\.1/.test(base)) throw new Error(AI.t('needKey'));

    const modelId = m.id || opts.modelId;
    const st = AI.state.settings;
    const P = Object.assign(AI.resolveParams(opts.conv, { model: m, provider: p }), opts.params || {});
    /* When "allow model reasoning" is disabled, no thinking budget or reasoning
   effort is requested, reducing token use. "Show reasoning process" controls
   rendering only; the two settings are independent. */
    if (AI.state.settings.reasoningOn === false) {
      delete P.thinkingBudget;
      delete P.reasoningEffort;
    }
    const common = {
      temperature: P.temperature,
      maxTokens: P.maxTokens,
      topP: P.topP,
      stream: opts.stream !== false && P.stream !== false && st.stream !== false
    };
    /* Only non-empty strings reach callbacks. Compatible endpoints frequently
   return null, false, objects or missing fields; earlier direct concatenation
   appended "undefined", "null" or "[object Object]" to the answer and
   reasoning panes. */
    const asText = v =>
      typeof v === 'string' && v.length
        ? v
        : v == null || v === false
          ? ''
          : typeof v === 'number' || typeof v === 'boolean'
            ? String(v)
            : '';
    const emit = (kind, v) => {
      const s = asText(v);
      if (!s) return;
      if (kind === 'delta' && opts.onDelta) opts.onDelta(s);
      else if (kind === 'reason' && opts.onReasoning) opts.onReasoning(s);
      else if (kind === 'status' && opts.onStatus) opts.onStatus(s);
    };

    /* Request timeout shares a single AbortSignal with the user-initiated stop action. */
    const timeoutMs = Math.max(0, (st.requestTimeout | 0) * 1000);
    const ctrl = new AbortController();
    let timer = null,
      onOuterAbort = null;
    if (timeoutMs)
      timer = setTimeout(() => {
        try {
          ctrl.abort(new DOMException('请求超时', 'TimeoutError'));
        } catch (e) {
          ctrl.abort();
        }
      }, timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else {
        onOuterAbort = () => ctrl.abort();
        opts.signal.addEventListener('abort', onOuterAbort, { once: true });
      }
    }
    const requestSignal = ctrl.signal;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (onOuterAbort && opts.signal) opts.signal.removeEventListener('abort', onOuterAbort);
    };

    const started = Date.now();
    const log = ok => extra => {
      try {
        AI.logRequest(
          Object.assign(
            {
              ok,
              provider: p.name || '',
              model: modelId,
              type,
              duration: Date.now() - started,
              stream: common.stream,
              in: (extra && extra.in) || 0,
              out: (extra && extra.out) || 0,
              cost: AI.estimateCost((extra && extra.in) || 0, (extra && extra.out) || 0, m),
              error: (extra && extra.error) || ''
            },
            {}
          )
        );
      } catch (e) {}
    };
    const logOk = log(true),
      logFail = log(false);

    let task;
    if (type === 'anthropic') task = chatAnthropic();
    else if (type === 'gemini') task = chatGemini();
    else task = chatOpenAI();
    return task
      .then(r => {
        logOk((r && r.usage) || {});
        cleanup();
        return r;
      })
      .catch(e => {
        logFail({ error: e.message });
        cleanup();
        throw e;
      });

    /* ---------- OpenAI-compatible ---------- */
    async function chatOpenAI() {
      const headers = mergeHeaders(
        { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        p.headers,
        m.headers
      );
      let body = {
        model: modelId,
        messages: opts.messages,
        stream: common.stream,
        temperature: common.temperature,
        max_tokens: common.maxTokens,
        top_p: common.topP,
        frequency_penalty: P.freqPenalty,
        presence_penalty: P.presPenalty
      };
      /* o-series, GPT-5 and reasoning models reject max_tokens and sampling parameters with HTTP 400. */
      if (/^o[1-9]|gpt-5|reasoning/i.test(modelId)) {
        delete body.temperature;
        delete body.top_p;
        delete body.frequency_penalty;
        delete body.presence_penalty;
        delete body.max_tokens;
        if (!p.body) body.max_completion_tokens = common.maxTokens;
      }
      if (P.seed !== '' && P.seed != null) body.seed = Number(P.seed);
      const stop = AI.parseStop(P);
      if (stop) body.stop = stop;
      if (Number(P.n) > 1) body.n = Number(P.n);
      if (P.responseFormat === 'json_object') body.response_format = { type: 'json_object' };
      else if (P.responseFormat === 'json_schema') {
        const schema = AI.safeJson(String(P.jsonSchema || ''), null);
        body.response_format = schema
          ? { type: 'json_schema', json_schema: Object.assign({ name: 'output', strict: false }, schema) }
          : { type: 'json_object' };
      }
      if (P.reasoningEffort) body.reasoning_effort = P.reasoningEffort;
      if (Number(P.thinkingBudget) > 0) body.thinking = { type: 'enabled', budget_tokens: Number(P.thinkingBudget) };
      if (Number(P.topK) > 0) body.top_k = Number(P.topK);
      if (Number(P.minP) > 0) body.min_p = Number(P.minP);
      if (Number(P.repeatPenalty) > 0) body.repeat_penalty = Number(P.repeatPenalty);
      if (Number(P.numCtx) > 0) body.num_ctx = Number(P.numCtx);
      if (P.keepAlive) body.keep_alive = P.keepAlive;
      if (P.logprobs) {
        body.logprobs = true;
        if (Number(P.topLogprobs) > 0) body.top_logprobs = Number(P.topLogprobs);
      }
      if (P.serviceTier) body.service_tier = P.serviceTier;
      if (P.requestUser) body.user = P.requestUser;
      if (common.stream && P.includeUsage !== false) body.stream_options = { include_usage: true };
      if (opts.tools && opts.tools.length) {
        body.tools = toolsToOpenAI(opts.tools);
        body.tool_choice =
          P.toolChoice === 'auto'
            ? 'auto'
            : P.toolChoice === 'none'
              ? 'none'
              : P.toolChoice === 'required'
                ? 'required'
                : { type: 'function', function: { name: P.toolChoice } };
        body.parallel_tool_calls = P.parallelToolCalls !== false;
      }
      body = deepMerge(body, p.body || {});
      body = deepMerge(body, m.body || {});
      const extra = AI.safeJson(String(P.extraBodyText || ''), null);
      if (extra) body = deepMerge(body, extra);
      const url = base + (p.path || '/chat/completions');
      const resp = await AI.fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, requestSignal);
      const result = { content: '', reasoning: '', toolCalls: [], usage: null, truncated: false };
      const splitter = new ThinkSplit();
      if (!common.stream) {
        const j = await resp.json(),
          ch = (j.choices || [])[0] || {},
          msg = ch.message || {};
        throwApiError(j);
        const contentText = asText(msg.content),
          reasonText = asText(msg.reasoning_content || msg.reasoning);
        const parts = splitter.feed(contentText);
        const tail = splitter.finish();
        result.content = parts.content + tail.content;
        result.reasoning = reasonText + parts.reasoning + tail.reasoning;
        result.toolCalls = (msg.tool_calls || []).map(tc => ({
          id: tc.id,
          name: (tc.function && tc.function.name) || '',
          args: AI.safeJson(tc.function && tc.function.arguments, {})
        }));
        result.usage = findUsage(j);
        emit('delta', result.content);
        emit('reason', result.reasoning);
        return result;
      }
      if (!resp.body) throw new Error('响应体为空：SSE 流未建立（请检查网关是否返回 text/event-stream）');
      let tcs = [],
        terminated = false,
        received = false;
      for await (const ev of sseEvents(resp)) {
        if (ev.data === '[DONE]') {
          terminated = true;
          break;
        }
        const j = AI.safeJson(ev.data, null);
        if (!j) continue;
        received = true;
        throwApiError(j);
        const u = findUsage(j);
        if (u) result.usage = mergeUsage(result.usage, u);
        const ch0 = (j.choices || [])[0] || {};
        if (ch0.finish_reason) terminated = true;
        const d = ch0.delta || {};
        const ct = asText(d.content);
        if (ct) {
          const x = splitter.feed(ct);
          if (x.content) {
            result.content += x.content;
            emit('delta', x.content);
          }
          if (x.reasoning) {
            result.reasoning += x.reasoning;
            emit('reason', x.reasoning);
          }
        }
        // Avoid `a || b` for optional text: empty strings, false or null would be concatenated as "undefined" / "null" into the reasoning block.
        const rt = asText(d.reasoning_content != null ? d.reasoning_content : d.reasoning);
        if (rt) {
          result.reasoning += rt;
          emit('reason', rt);
        }
        if (Array.isArray(d.tool_calls))
          d.tool_calls.forEach(tc => {
            const i = tc.index || 0;
            if (!tcs[i]) tcs[i] = { id: tc.id || AI.uid(), name: '', argsStr: '' };
            if (tc.function && tc.function.name) tcs[i].name += String(tc.function.name);
            if (tc.function && tc.function.arguments != null) tcs[i].argsStr += String(tc.function.arguments);
          });
      }
      // Settle unclosed <think> tags and any retained partial tag prefix at the end of the stream.
      const tail = splitter.finish();
      if (tail.content) {
        result.content += tail.content;
        emit('delta', tail.content);
      }
      if (tail.reasoning) {
        result.reasoning += tail.reasoning;
        emit('reason', tail.reasoning);
      }
      result.toolCalls = tcs.filter(Boolean).map(t => ({ id: t.id, name: t.name, args: AI.safeJson(t.argsStr, {}) }));
      /* Some gateways omit [DONE] but provide a usage settlement with out>0; treat this as a normal finish, not a truncation. */
      const settled = terminated || (result.usage && result.usage.out > 0);
      result.truncated = !settled && (received || result.content.length > 0);
      if (!received && !result.content && !result.reasoning && !result.toolCalls.length)
        throw new Error('连接提前关闭：未收到任何响应数据（可能被网关或代理截断）');
      return result;
    }

    /* ---------- Anthropic ---------- */
    async function chatAnthropic() {
      const headers = mergeHeaders(
        {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        p.headers,
        m.headers
      );
      const sys = opts.messages
        .filter(x => x.role === 'system')
        .map(x => toText(x.content))
        .join('\n\n');
      const messages = opts.messages
        .filter(x => x.role !== 'system')
        .map(x => ({ role: x.role === 'assistant' ? 'assistant' : 'user', content: toAnthropicContent(x.content) }));
      let body = {
        model: modelId,
        messages,
        max_tokens: common.maxTokens,
        temperature: common.temperature,
        top_p: common.topP,
        stream: common.stream
      };
      if (sys) body.system = sys;
      const stop = AI.parseStop(P);
      if (stop) body.stop_sequences = stop;
      if (Number(P.topK) > 0) body.top_k = Number(P.topK);
      if (Number(P.thinkingBudget) > 0) {
        body.thinking = { type: 'enabled', budget_tokens: Number(P.thinkingBudget) };
        delete body.temperature;
        delete body.top_p; // Anthropic requires temperature to be omitted when thinking is enabled.
      }
      if (P.requestUser) body.metadata = { user_id: String(P.requestUser).slice(0, 64) };
      if (opts.tools && opts.tools.length) {
        body.tools = toolsToAnthropic(opts.tools);
        if (P.toolChoice === 'required') body.tool_choice = { type: 'any' };
        else if (P.toolChoice === 'none') body.tool_choice = { type: 'none' };
        else if (P.toolChoice !== 'auto') body.tool_choice = { type: 'tool', name: P.toolChoice };
        else body.tool_choice = { type: 'auto' };
      }
      body = deepMerge(body, p.body || {});
      body = deepMerge(body, m.body || {});
      const extra = AI.safeJson(String(P.extraBodyText || ''), null);
      if (extra) body = deepMerge(body, extra);
      const url = base + (p.path || '/v1/messages');
      const resp = await AI.fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, requestSignal);
      const result = { content: '', reasoning: '', toolCalls: [], usage: null, truncated: false },
        splitter = new ThinkSplit();
      if (!common.stream) {
        const j = await resp.json();
        throwApiError(j);
        (j.content || []).forEach(b => {
          if (b.type === 'text') {
            const x = splitter.feed(asText(b.text));
            result.content += x.content;
            result.reasoning += x.reasoning;
          }
          if (b.type === 'thinking') result.reasoning += asText(b.thinking) + asText(b.text);
          if (b.type === 'tool_use') result.toolCalls.push({ id: b.id, name: b.name, args: b.input || {} });
        });
        const tail = splitter.finish();
        result.content += tail.content;
        result.reasoning += tail.reasoning;
        result.usage = findUsage(j);
        emit('delta', result.content);
        emit('reason', result.reasoning);
        return result;
      }
      if (!resp.body) throw new Error('响应体为空：SSE 流未建立（请检查网关是否返回 text/event-stream）');
      let blocks = {},
        textAcc = '',
        reasonAcc = '',
        terminated = false,
        received = false;
      for await (const ev of sseEvents(resp)) {
        if (ev.data === '[DONE]') {
          terminated = true;
          break;
        }
        const j = AI.safeJson(ev.data, null);
        if (!j) continue;
        received = true;
        if (j.type === 'error') throwApiError(j);
        const u = findUsage(j);
        if (u) result.usage = mergeUsage(result.usage, u);
        if (j.type === 'message_stop') terminated = true;
        if (j.type === 'message_start' && j.message && j.message.usage)
          result.usage = mergeUsage(result.usage, {
            in: j.message.usage.input_tokens || 0,
            out: 0,
            total: 0,
            cached: 0,
            reasoning: 0,
            source: 'api'
          });
        if (j.type === 'content_block_start' && j.content_block) {
          const b = j.content_block;
          blocks[j.index] = { type: b.type, name: b.name, id: b.id, argsStr: '' };
        }
        if (j.type === 'content_block_delta' && j.delta) {
          const d = j.delta;
          if (d.type === 'text_delta') {
            const x = splitter.feed(asText(d.text));
            if (x.content) {
              textAcc += x.content;
              emit('delta', x.content);
            }
            if (x.reasoning) {
              reasonAcc += x.reasoning;
              emit('reason', x.reasoning);
            }
          } else if (d.type === 'thinking_delta') {
            const s = asText(d.thinking != null ? d.thinking : d.text);
            if (s) {
              reasonAcc += s;
              emit('reason', s);
            }
          } else if (d.type === 'input_json_delta' && blocks[j.index])
            blocks[j.index].argsStr += asText(d.partial_json);
        }
        if (j.type === 'message_delta' && j.usage)
          result.usage = mergeUsage(result.usage, {
            in: 0,
            out: j.usage.output_tokens || 0,
            total: 0,
            cached: 0,
            reasoning: 0,
            source: 'api'
          });
      }
      const tail = splitter.finish();
      if (tail.content) {
        textAcc += tail.content;
        emit('delta', tail.content);
      }
      if (tail.reasoning) {
        reasonAcc += tail.reasoning;
        emit('reason', tail.reasoning);
      }
      result.content = textAcc;
      result.reasoning = reasonAcc;
      result.toolCalls = Object.values(blocks)
        .filter(b => b.type === 'tool_use')
        .map(b => ({ id: b.id, name: b.name, args: AI.safeJson(b.argsStr, {}) }));
      const settled = terminated || (result.usage && result.usage.out > 0);
      result.truncated = !settled && (received || !!textAcc || !!reasonAcc);
      if (!received && !textAcc && !reasonAcc) throw new Error('连接提前关闭：未收到任何响应数据');
      return result;
    }

    /* ---------- Google Gemini ---------- */
    async function chatGemini() {
      const sep = base.includes('?') ? '&' : '?';
      const action = common.stream ? 'streamGenerateContent' : 'generateContent';
      // The API key is sent in a header rather than the URL, so browser history, proxies and logs cannot capture it.
      let url = `${base}/v1beta/models/${encodeURIComponent(modelId)}:${action}`;
      if (common.stream) url += `${sep}alt=sse`;
      const sys = opts.messages
        .filter(x => x.role === 'system')
        .map(x => toText(x.content))
        .join('\n\n');
      const contents = [];
      opts.messages
        .filter(x => x.role !== 'system')
        .forEach(x => {
          const role = x.role === 'assistant' || x.role === 'model' ? 'model' : 'user';
          const last = contents[contents.length - 1];
          const parts = toGeminiParts(x.content);
          if (last && last.role === role) last.parts = last.parts.concat(parts);
          else contents.push({ role, parts });
        });
      const gc = { temperature: common.temperature, maxOutputTokens: common.maxTokens, topP: common.topP };
      if (Number(P.topK) > 0) gc.topK = Number(P.topK);
      if (P.seed !== '' && P.seed != null) gc.seed = Number(P.seed);
      const stop = AI.parseStop(P);
      if (stop) gc.stopSequences = stop;
      if (Number(P.n) > 1) gc.candidateCount = Math.min(8, Number(P.n));
      if (P.responseFormat === 'json_object') gc.responseMimeType = 'application/json';
      else if (P.responseFormat === 'json_schema') {
        const schema = AI.safeJson(String(P.jsonSchema || ''), null);
        if (schema) {
          gc.responseMimeType = 'application/json';
          gc.responseSchema = schema.schema || schema;
        } else gc.responseMimeType = 'application/json';
      }
      if (Number(P.thinkingBudget) > 0) gc.thinkingConfig = { thinkingBudget: Number(P.thinkingBudget) };
      else if (P.reasoningEffort === 'low') gc.thinkingConfig = { thinkingBudget: 1024 };
      else if (P.reasoningEffort === 'high') gc.thinkingConfig = { thinkingBudget: 24576 };
      let body = { contents, generationConfig: gc };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
      let safety = null;
      if (
        String(P.geminiSafety || '')
          .trim()
          .startsWith('[')
      )
        safety = AI.safeJson(P.geminiSafety, null);
      else if (P.geminiSafety)
        safety = String(P.geminiSafety)
          .split(',')
          .map(x => {
            const [c, t] = x.split(':').map(v => (v || '').trim());
            return c
              ? {
                  category: 'HARM_CATEGORY_' + c.toUpperCase(),
                  threshold: 'BLOCK_' + (t || 'MEDIUM_AND_ABOVE').toUpperCase()
                }
              : null;
          })
          .filter(Boolean);
      if (safety && safety.length) body.safetySettings = safety;
      const gt = toolsToGemini(opts.tools);
      if (gt) {
        body.tools = gt;
        const mode = P.toolChoice === 'none' ? 'NONE' : P.toolChoice === 'required' ? 'ANY' : 'AUTO';
        body.toolConfig = { functionCallingConfig: { mode } };
      }
      body = deepMerge(body, p.body || {});
      body = deepMerge(body, m.body || {});
      const extra = AI.safeJson(String(P.extraBodyText || ''), null);
      if (extra) body = deepMerge(body, extra);
      const headers = mergeHeaders({ 'Content-Type': 'application/json', 'x-goog-api-key': key }, p.headers, m.headers);
      const resp = await AI.fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, requestSignal);
      const result = { content: '', reasoning: '', toolCalls: [], usage: null, truncated: false },
        splitter = new ThinkSplit();
      let terminated = false,
        received = false;
      const handle = j => {
        if (!j) return;
        received = true;
        throwApiError(j);
        const u = findUsage(j);
        if (u) result.usage = mergeUsage(result.usage, u);
        const c0 = (j.candidates || [])[0] || {};
        if (c0.finishReason) terminated = true;
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        parts.forEach(pt => {
          const txt = asText(pt.text);
          if (pt.thought === true) {
            if (txt) {
              result.reasoning += txt;
              emit('reason', txt);
            }
          } else if (txt) {
            const x = splitter.feed(txt);
            if (x.content) {
              result.content += x.content;
              emit('delta', x.content);
            }
            if (x.reasoning) {
              result.reasoning += x.reasoning;
              emit('reason', x.reasoning);
            }
          }
          if (pt.functionCall)
            result.toolCalls.push({ id: AI.uid(), name: pt.functionCall.name, args: pt.functionCall.args || {} });
        });
      };
      if (!common.stream) {
        handle(await resp.json());
        terminated = true;
      } else {
        if (!resp.body) throw new Error('响应体为空：SSE 流未建立（请检查网关是否返回 text/event-stream）');
        for await (const ev of sseEvents(resp)) {
          if (ev.data === '[DONE]') {
            terminated = true;
            break;
          }
          handle(AI.safeJson(ev.data, null));
        }
      }
      const tail = splitter.finish();
      if (tail.content) {
        result.content += tail.content;
        emit('delta', tail.content);
      }
      if (tail.reasoning) {
        result.reasoning += tail.reasoning;
        emit('reason', tail.reasoning);
      }
      const settled = terminated || (result.usage && result.usage.out > 0);
      result.truncated = !settled && (received || !!result.content || !!result.reasoning);
      if (!received && !result.content && !result.reasoning) throw new Error('连接提前关闭：未收到任何响应数据');
      return result;
    }
  };

  /* ---------------- Fetch remote model lists ---------------- */
  AI.fetchModels = async function (p) {
    const base = (p.baseUrl || '').replace(/\/+$/, ''),
      key = p.apiKey || '';
    let url,
      headers = {};
    if (p.type === 'gemini') {
      url = `${base}/v1beta/models?pageSize=200`;
      headers = { 'x-goog-api-key': key };
    } else if (p.type === 'anthropic') {
      url = `${base}/v1/models?limit=100`;
      headers = {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    } else {
      url = `${base}/models`;
      headers = { Authorization: `Bearer ${key}` };
    }
    headers = mergeHeaders(headers, p.headers || {});
    const r = await AI.fetchWithRetry(url, { method: 'GET', headers }, null, 1);
    const j = await r.json();
    if (p.type === 'gemini')
      return (j.models || [])
        .filter(m => /generateContent/.test((m.supportedGenerationMethods || []).join(',')))
        .map(m => m.name.replace(/^models\//, ''));
    if (p.type === 'anthropic') return (j.data || []).map(m => m.id);
    return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
  };

  /* ---------------- Image generation ---------------- */
  AI.generateImage = async function (prompt, opts) {
    opts = opts || {};
    const cfg = AI.state.imageGen;
    const provider =
      cfg.provider === 'custom' ? { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey } : AI.currentProvider() || {};
    const base = (opts.baseUrl || cfg.baseUrl || provider.baseUrl || '').replace(/\/+$/, '');
    const key = opts.apiKey || cfg.apiKey || provider.apiKey || '';
    if (!base) throw new Error('请先配置图像接口地址');
    let url = base + '/images/generations',
      body = {
        model: opts.model || cfg.model || 'gpt-image-1',
        prompt,
        n: 1,
        size: opts.size || cfg.size || '1024x1024'
      };
    if (/generativelanguage|gemini/i.test(base)) {
      url = `${base}/v1beta/models/${encodeURIComponent(body.model)}:predict?key=${encodeURIComponent(key)}`;
      body = { instances: [{ prompt }], parameters: { sampleCount: 1 } };
    } else body.response_format = 'b64_json';
    const r = await AI.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: mergeHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
        body: JSON.stringify(body)
      },
      opts.signal,
      1
    );
    const j = await r.json();
    const out = [];
    if (j.data)
      j.data.forEach(d => {
        if (d.b64_json) out.push('data:image/png;base64,' + d.b64_json);
        else if (d.url) out.push(d.url);
      });
    if (j.predictions)
      j.predictions.forEach(d => {
        const b = d.bytesBase64Encoded || (d.image && d.image.bytesBase64Encoded);
        if (b) out.push('data:image/png;base64,' + b);
      });
    if (!out.length) throw new Error('接口未返回图片：' + JSON.stringify(j).slice(0, 200));
    return out;
  };

  /* ---------------- Automatic conversation title generation ---------------- */
  AI.generateTitle = async function (text, signal) {
    const p = AI.currentProvider(),
      m = AI.currentModel();
    if (!p || !m) return null;
    try {
      const r = await AI.chat({
        provider: p,
        model: m,
        stream: false,
        signal,
        messages: [
          {
            role: 'system',
            content: AI.langPrompt(
              '根据给定对话内容生成一个不超过 12 个字的标题，仅输出标题本身：不加标点、引号、前缀或解释；严格依据文本，不推测意图。',
              'Generate a conversation title of at most 12 words. Output only the title: no punctuation, quotes, prefixes or explanation. Base it strictly on the provided text; do not infer intent.'
            )
          },
          { role: 'user', content: String(text).slice(0, 500) }
        ]
      });
      const firstLine = (r.content || '').split(/[\n。！？!?]/)[0];
      const t = firstLine
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/[*_~#>|]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s"'「『:：\-—]+|[\s"'」』。！？.!?·,，]+$/g, '')
        .trim()
        .slice(0, 18);
      return t || null;
    } catch (e) {
      return null;
    }
  };

  /* ---------------- One-shot completions (compression, translation, etc.) ---------------- */
  AI.complete = async function (system, user, signal) {
    const p = AI.currentProvider(),
      m = AI.currentModel();
    if (!p || !m) throw new Error(AI.t('noModel'));
    const r = await AI.chat({
      provider: p,
      model: m,
      stream: false,
      signal,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    return r.content;
  };
})();
