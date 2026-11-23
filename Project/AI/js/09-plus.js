/* ============================================================
   09-plus.js - Enhancement layer
   Single branding source, model metadata inference, balance lookup, usage
   aggregation, editable combo boxes, charts, multi-select model fetching and
   settings extensions. Depends on 01-08 with no external dependencies. New
   strings use L() and do not rely on post-render DOM translation.
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI,
    U = AI.UI;
  const L = function (zh, en) {
    return AI.state.settings.lang === 'en' ? en : zh;
  };
  const tfmt = function (zh, en) {
    const t = L(zh, en);
    return function () {
      const a = arguments;
      return t.replace(/\{(\d+)\}/g, (m, i) => String(a[+i] == null ? '' : a[+i]));
    };
  };

  /* ------------------------------------------------------------
   1. Single branding source
   Replacing the logo or name only requires changes here and to the #i-logo
   symbol in index.html. No user-facing setting is provided by design.
   ------------------------------------------------------------ */
  /* AI.BRAND and AI.VERSION are read from window.PLXT_BRAND by 01-core.js and
   are not redefined here, otherwise 08-i18n would observe undefined before
   09-plus.js loads. */

  /* Token statistics follow the active conversation; the production() renderMessages wrapper at the end of this file handles them. */
  /* Populate branding on first paint to avoid a 300 ms placeholder flash; static HTML keeps an empty slot. */
  (function fillBrand() {
    const set = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    set('brandTitle', AI.BRAND.name);
    const fc = document.querySelector('.foot-copy');
    if (fc) fc.textContent = 'Copyright © ' + new Date().getFullYear() + ' ' + "PlayLimitXT / 𝙋𝙇𝙓𝙏"//AI.BRAND.name;
    document.title = AI.state.settings.lang === 'en' ? AI.BRAND.titleEn : AI.BRAND.titleZh;
  })();

  /* After a language switch, redraw dynamic regions: strings from 09 are fixed
   by L() at render time, and post-render MutationObserver replacement cannot
   convert those Chinese fragments to English. */
  const updatePlaceholder = function () {
    const el = U.dom.input || document.getElementById('input');
    if (!el) return;
    const touch = window.matchMedia && matchMedia('(hover:none) and (pointer:coarse)').matches;
    el.placeholder = L(
      touch ? '输入消息…（Enter 换行 · Ctrl+Enter 发送）' : '输入消息…（Enter 发送 · Shift+Enter 换行）',
      touch ? 'Message… (Enter for newline · Ctrl+Enter to send)' : 'Message… (Enter to send · Shift+Enter for newline)'
    );
  };
  const origToggleLang = U.toggleLang;
  U.toggleLang = function () {
    origToggleLang.call(U);
    try {
      if (U.dom.toasts) U.dom.toasts.innerHTML = '';
      if (!U.dom.drawerRoot.hidden) U.renderDrawer();
      else if (U.dom.drawerBody) U.dom.drawerBody.innerHTML = ''; // Clear on hide so stale language attributes cannot persist.
      if (U.dom.inspector && !U.dom.inspector.hidden) U.renderInspector();
      U.renderAttachments();
      U.renderStarters();
      updatePlaceholder();
    } catch (e) {}
    if (AI.localizeAll) AI.localizeAll();
  };
  updatePlaceholder();
  /* #input was removed from static i18n, but a language switch may still rebuild the composer; reapply placeholders afterwards. */
  const origApplyStatic = AI.applyStaticI18n;
  AI.applyStaticI18n = function () {
    origApplyStatic.call(AI);
    updatePlaceholder();
  };

  const origRenderDrawer = U.renderDrawer;
  U.renderDrawer = function () {
    origRenderDrawer.call(U);
    const b = U.dom.drawerBody;
    if (b) {
      b.classList.remove('drawer-enter');
      void b.offsetWidth;
      b.classList.add('drawer-enter');
    }
  };

  let lastLang = AI.state.settings.lang;
  const origRenderAll = U.renderAll;
  U.renderAll = function () {
    origRenderAll.call(U);
    const l = AI.state.settings.lang;
    if (l !== lastLang) {
      lastLang = l;
      if (U.dom.drawerRoot && U.dom.drawerRoot.hidden && U.dom.drawerBody) U.dom.drawerBody.innerHTML = '';
    }
  };

  const origUpdateLabels = U.updateLabels;
  U.updateLabels = function () {
    origUpdateLabels.call(U);
    if (U.dom.brandTitle) U.dom.brandTitle.textContent = AI.BRAND.name;
  };

  /* ------------------------------------------------------------
   2. Design languages: add Neon gradient and migrate defaults once
   ------------------------------------------------------------ */
  if (!AI.DESIGNS.some(d => d[0] === 'neon')) AI.DESIGNS.unshift(['neon', '霓虹 · 渐变', 'Neon · Gradient']);

  const origLoad = AI.load;
  AI.load = function () {
    const r = origLoad.call(AI);
    const s = AI.state.settings;
    // Existing Light Ink profiles migrate to Neon once; users who chose an appearance explicitly are left unchanged.
    if (!s._designMigrated && s.design === 'ink' && s.mode === 'light' && !s.accentCustom) {
      s.design = 'neon';
      s.mode = 'dark';
      s._designMigrated = true;
      try {
        AI.save(true);
      } catch (e) {}
    }
    return r;
  };

  const origApplyTheme = U.applyTheme;
  U.applyTheme = function () {
    origApplyTheme.call(U);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta && document.body.dataset.design === 'neon')
      meta.content = document.body.classList.contains('light') ? '#f6f4ff' : '#080a16';
    document.title = AI.state.settings.lang === 'en' ? AI.BRAND.titleEn : AI.BRAND.titleZh;
  };

  /* ------------------------------------------------------------
   3. Model capability metadata: local rules plus authoritative remote values
   ------------------------------------------------------------ */
  const MODEL_HINTS = [
    { re: /(^|\/)(o1|o3|o4|gpt-5)([-.:]|$)/i, ctx: 200000, vision: true, tools: true, reasoning: true },
    { re: /(^|\/)(gpt-4o|gpt-4\.1|chatgpt-4o|gpt-4-turbo)/i, ctx: 128000, vision: true, tools: true },
    { re: /claude[-_.]?(3|4|opus|sonnet|haiku)/i, ctx: 200000, vision: true, tools: true },
    { re: /gemini[-_.]?(1\.5|2|3)/i, ctx: 1048576, vision: true, tools: true },
    { re: /deepseek[-_.]?(r1|reasoner)/i, ctx: 64000, reasoning: true },
    { re: /deepseek/i, ctx: 64000, tools: true },
    { re: /qwen3|qwen2\.5/i, ctx: 131072, tools: true },
    { re: /qwen/i, ctx: 32768 },
    { re: /llama[-_.]?3|llama[-_.]?4/i, ctx: 131072, tools: true },
    { re: /glm[-_.]?4v|glm[-_.]?4\.5v/i, ctx: 128000, vision: true },
    { re: /glm[-_.]?4/i, ctx: 128000, tools: true },
    { re: /(dall-e|gpt-image|imagen|flux|stable-diffusion|seedream|kolors)/i, image: true },
    { re: /(embedding|bge-|m3e|text-embedding)/i, embedding: true },
    { re: /(whisper|tts|audio|speech)/i, audio: true },
    { re: /(grok|kimi|moonshot|yi-|mistral|mixtral|command-r)/i, ctx: 128000, tools: true }
  ];

  AI.inferModelMeta = function (id) {
    const s = String(id || '');
    const meta = {
      id: s,
      name: s,
      contextWindow: null,
      maxOutput: null,
      vision: false,
      tools: false,
      reasoning: false,
      json: false,
      input: ['text'],
      output: ['text'],
      source: 'unknown'
    };
    for (const h of MODEL_HINTS) {
      if (!h.re.test(s)) continue;
      meta.source = 'inferred';
      if (h.ctx) {
        meta.contextWindow = h.ctx;
        meta.json = true;
      }
      if (h.vision) {
        meta.vision = true;
        meta.input = ['text', 'image'];
      }
      if (h.tools) meta.tools = true;
      if (h.reasoning) meta.reasoning = true;
      if (h.image) {
        meta.output = ['image'];
        meta.image = true;
      }
      if (h.embedding) {
        meta.output = ['vector'];
        meta.embedding = true;
      }
      if (h.audio) {
        meta.input = ['audio'];
        meta.output = ['text'];
      }
      break;
    }
    return meta;
  };

  /* ---- Generic value extraction: gateway field names vary widely, so candidates are tried in priority order. ---- */
  const numOf = function () {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v === null || v === undefined || v === '' || typeof v === 'object') continue;
      const n = Number(String(v).replace(/[, _]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };
  const strOf = function () {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  const at = function (o) {
    let c = o;
    for (let i = 1; i < arguments.length; i++) {
      if (!c || typeof c !== 'object') return null;
      c = c[arguments[i]];
    }
    return c == null ? null : c;
  };

  /* Normalise one /models record or model-detail response into unified metadata.
   Covers OpenAI-compatible endpoints, OpenRouter, Gemini, Anthropic, common
   relays and local inference servers. */
  AI.modelMetaFromRow = function (x, protocol, forceId) {
    if (!x || typeof x !== 'object') return null;
    const rawId = forceId || strOf(x.id, x.model, x.model_id, x.slug, x.name);
    if (!rawId) return null;
    const id = protocol === 'gemini' ? String(rawId).replace(/^models\//, '') : String(rawId);
    const meta = AI.inferModelMeta(id);
    const tp = x.top_provider || x.topProvider || {};
    const arch = x.architecture || {};
    const mi = x.model_info || x.modelInfo || {};
    const pr = x.pricing || {};
    const got = [];

    const ctx = numOf(
      x.context_length,
      x.context_window,
      x.max_context,
      x.contextWindow,
      x.max_input_tokens,
      x.maxInputTokens,
      x.max_prompt_tokens,
      x.input_token_limit,
      x.inputTokenLimit,
      tp.context_length,
      arch.context_length,
      mi['general.context_length'],
      mi.context_length,
      at(x, 'details', 'context_length'),
      at(x, 'limits', 'context')
    );
    if (ctx) {
      meta.contextWindow = ctx;
      got.push('context');
    }

    const maxOut = numOf(
      x.max_completion_tokens,
      x.max_output_tokens,
      x.max_output,
      x.maxOutputTokens,
      x.output_token_limit,
      x.outputTokenLimit,
      tp.max_completion_tokens,
      arch.max_output_tokens,
      mi['general.max_output_tokens'],
      at(x, 'limits', 'output')
    );
    if (maxOut) {
      meta.maxOutput = maxOut;
      got.push('maxOutput');
    }

    const disp = strOf(
      x.displayName,
      x.display_name,
      x.label,
      x.title,
      x.friendly_name,
      x.name && String(x.name) !== id ? x.name : ''
    );
    if (disp && disp !== id) {
      meta.name = disp;
      got.push('name');
    }

    // OpenRouter reports pricing in USD per token; convert it to the project convention of USD per 1M tokens.
    const pin = numOf(pr.prompt, pr.input, x.priceIn, x.input_price, x.prompt_price);
    const pout = numOf(pr.completion, pr.output, x.priceOut, x.output_price, x.completion_price);
    if (pin != null) {
      meta.priceIn = pin < 0.1 ? pin * 1e6 : pin;
      got.push('priceIn');
    }
    if (pout != null) {
      meta.priceOut = pout < 0.1 ? pout * 1e6 : pout;
      got.push('priceOut');
    }

    const im = x.input_modalities || arch.input_modalities || x.inputModalities;
    const om = x.output_modalities || arch.output_modalities || x.outputModalities;
    if (Array.isArray(im) && im.length) {
      meta.input = im.map(String);
      got.push('input');
    }
    if (Array.isArray(om) && om.length) {
      meta.output = om.map(String);
      got.push('output');
    }
    if (protocol === 'gemini' && Array.isArray(x.supportedGenerationMethods)) {
      const gm = x.supportedGenerationMethods.join(',');
      if (/embedContent/.test(gm)) meta.output = ['vector'];
      else if (/generateImage/.test(gm)) meta.output = ['image'];
      if (/generateContent/.test(gm) && meta.input.indexOf('image') < 0) meta.input = ['text', 'image'];
      got.push('modalities');
    }
    if (x.supports_vision === true || x.vision === true) {
      meta.vision = true;
      if (meta.input.indexOf('image') < 0) meta.input.push('image');
    }
    meta.vision = meta.input.indexOf('image') >= 0;
    meta.embedding = meta.output.indexOf('vector') >= 0;
    meta.image = meta.output.indexOf('image') >= 0;
    meta.audio = meta.input.indexOf('audio') >= 0 || meta.output.indexOf('audio') >= 0;

    const sp = x.supported_parameters || x.supportedParameters || [];
    if (Array.isArray(sp) && sp.length) {
      if (sp.includes('tools') || sp.includes('tool_choice')) meta.tools = true;
      if (sp.includes('reasoning') || sp.includes('include_reasoning')) meta.reasoning = true;
      if (sp.includes('response_format')) meta.json = true;
      got.push('capabilities');
    }
    if (x.supports_tools === true || x.tool_calling === true) meta.tools = true;

    if (got.length) meta.source = 'api';
    meta.apiFields = got;
    return meta;
  };

  AI.modelRequestHeaders = function (p) {
    const key = p.apiKey || '';
    let h;
    if (p.type === 'gemini') h = { 'x-goog-api-key': key };
    else if (p.type === 'anthropic')
      h = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    else h = { Authorization: 'Bearer ' + key };
    return Object.assign(h, p.headers || {});
  };
  AI.modelEndpointUrl = function (p, endpoint) {
    const base = (p.baseUrl || '').replace(/\/+$/, '');
    const raw = String(endpoint || '').trim();
    return /^https?:\/\//i.test(raw) ? raw : base + '/' + raw.replace(/^\//, '');
  };

  AI.fetchModelsDetailed = async function (p) {
    const ep =
      String(p.modelsEndpoint || '').trim() ||
      (p.type === 'gemini'
        ? '/v1beta/models?pageSize=200'
        : p.type === 'anthropic'
          ? '/v1/models?limit=200'
          : '/models');
    const url = AI.modelEndpointUrl(p, ep);
    const r = await AI.fetchWithRetry(url, { method: 'GET', headers: AI.modelRequestHeaders(p) }, null, 1);
    const j = await r.json();
    let rows = j.data || j.models || j.items || j.results || (Array.isArray(j) ? j : []);
    if (!Array.isArray(rows)) rows = [];
    const out = [];
    rows.forEach(x => {
      const meta = AI.modelMetaFromRow(typeof x === 'string' ? { id: x } : x, p.type);
      if (meta) out.push(meta);
    });
    const seen = new Set();
    return out.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  };

  /* Single-model detail probe: many /models endpoints return only an id, while
   context length requires /models/{id}. A {id} URL template can be configured
   in the provider editor. */
  AI.probeModelDetail = async function (p, id) {
    const tpl =
      String(p.modelDetailEndpoint || '').trim() || (p.type === 'gemini' ? '/v1beta/models/{id}' : '/models/{id}');
    const url = AI.modelEndpointUrl(p, tpl.replace('{id}', encodeURIComponent(id)));
    const r = await AI.fetchWithRetry(url, { method: 'GET', headers: AI.modelRequestHeaders(p) }, null, 1);
    const j = await r.json();
    const row = j.data || j.model || j;
    return AI.modelMetaFromRow(row, p.type, id);
  };

  /* Write remote metadata back into configured models: refresh existing entries without a full overwrite. */
  AI.refreshModelMeta = async function (p, opts) {
    opts = opts || {};
    const list = await AI.fetchModelsDetailed(p);
    const byId = {};
    list.forEach(m => {
      byId[m.id] = m;
    });
    const models = p.models || [];
    let updated = 0;
    models.forEach(m => {
      if (typeof m !== 'object' || !m.id || m.metaSource === 'manual') return;
      const api = byId[m.id];
      if (!api || api.source !== 'api') return;
      const before = [m.context, m.maxOutput, m.priceIn, m.priceOut, m.name, JSON.stringify(m.modalities)].join('|');
      if (api.contextWindow) m.context = api.contextWindow;
      if (api.maxOutput) m.maxOutput = api.maxOutput;
      if (api.priceIn != null) m.priceIn = api.priceIn;
      if (api.priceOut != null) m.priceOut = api.priceOut;
      if (api.vision) m.vision = true;
      if (api.tools) m.tools = true;
      if (api.reasoning) m.reasoning = true;
      if (api.input && api.output) m.modalities = { input: api.input, output: api.output };
      if (api.name && api.name !== m.id && (!m.name || m.name === m.id)) m.name = api.name;
      m.metaSource = 'api';
      m.metaFields = api.apiFields;
      if ([m.context, m.maxOutput, m.priceIn, m.priceOut, m.name, JSON.stringify(m.modalities)].join('|') !== before)
        updated++;
    });
    // Optional: probe detail endpoints for models whose context length is absent from the list (bounded concurrency, 20 by default).
    let probed = 0;
    if (opts.probe) {
      const targets = models
        .filter(m => typeof m === 'object' && m.id && !m.context && m.metaSource !== 'manual')
        .slice(0, 20);
      let i = 0;
      const worker = async function () {
        while (i < targets.length) {
          const m = targets[i++];
          try {
            const d = await AI.probeModelDetail(p, m.id);
            if (d && d.source === 'api' && (d.contextWindow || d.maxOutput)) {
              if (d.contextWindow) m.context = d.contextWindow;
              if (d.maxOutput) m.maxOutput = d.maxOutput;
              if (d.input && d.output) m.modalities = { input: d.input, output: d.output };
              m.metaSource = 'api';
              m.metaFields = d.apiFields;
              probed++;
              updated++;
            }
          } catch (e) {}
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));
    }
    AI.save(true);
    return { updated, probed, total: models.length, apiModels: list.filter(x => x.source === 'api').length };
  };

  /* Batch-fill inferred metadata for existing models without overwriting manual values. */
  AI.inferAllModels = function () {
    let n = 0;
    (AI.state.providers || []).forEach(p =>
      (p.models || []).forEach(m => {
        if (typeof m !== 'object' || !m.id) return;
        const g = AI.inferModelMeta(m.id);
        if (g.source === 'unknown') return;
        if (!m.context && g.contextWindow) {
          m.context = g.contextWindow;
          n++;
        }
        if (!m.maxOutput && g.maxOutput) {
          m.maxOutput = g.maxOutput;
          n++;
        }
        if (m.vision === undefined && g.vision) {
          m.vision = true;
          n++;
        }
        if (m.tools === undefined && g.tools) {
          m.tools = true;
          n++;
        }
        if (m.reasoning === undefined && g.reasoning) {
          m.reasoning = true;
          n++;
        }
        if (!m.modalities && g.source !== 'unknown') m.modalities = { input: g.input, output: g.output };
        if (!m.metaSource) m.metaSource = g.source === 'unknown' ? 'none' : 'inferred';
      })
    );
    AI.save(true);
    return n;
  };

  /* ------------------------------------------------------------
   4. Balance lookup: configurable endpoint with no vendor-specific billing
   assumptions
   ------------------------------------------------------------ */
  AI.jsonPath = function (obj, path) {
    if (!path) return null;
    let cur = obj;
    for (const raw of String(path).split('.')) {
      const m = /^([^\[\]]+)((?:\[\d+\])*)$/.exec(raw.trim());
      if (!m) return null;
      cur = cur == null ? null : cur[m[1]];
      const idxs = m[2].match(/\[(\d+)\]/g) || [];
      for (const t of idxs) cur = Array.isArray(cur) ? cur[+t.slice(1, -1)] : null;
      if (cur === undefined || cur === null) return null;
    }
    return cur;
  };

  const BALANCE_KEYS = [
    'balance',
    'available_balance',
    'total_balance',
    'remaining',
    'remaining_quota',
    'credit',
    'credits',
    'quota',
    'amount',
    'available',
    'balance_usd',
    'total_available',
    'remain'
  ];

  AI.pickBalance = function (j, path) {
    if (path) {
      const v = AI.jsonPath(j, path);
      if (v == null) return null;
      return typeof v === 'object'
        ? { value: v.amount != null ? v.amount : v.balance, currency: v.currency || v.unit || '' }
        : { value: v, currency: '' };
    }
    const scan = (o, depth) => {
      if (!o || depth > 4 || typeof o !== 'object') return null;
      for (const k of BALANCE_KEYS) {
        if (o[k] != null && (typeof o[k] === 'number' || typeof o[k] === 'string'))
          return { value: o[k], currency: o.currency || o.unit || '', path: k };
      }
      for (const k of Object.keys(o)) {
        const r = scan(o[k], depth + 1);
        if (r) return r;
      }
      return null;
    };
    return scan(j, 0);
  };

  AI.fetchBalance = async function (p) {
    if (!p || !p.balanceUrl) throw new Error(L('未配置余额查询地址', 'Balance endpoint not configured'));
    const raw = String(p.balanceUrl).trim();
    const url = /^https?:\/\//i.test(raw) ? raw : (p.baseUrl || '').replace(/\/+$/, '') + '/' + raw.replace(/^\//, '');
    let extra = p.balanceHeaders || {};
    if (typeof extra === 'string') {
      try {
        extra = JSON.parse(extra || '{}');
      } catch (e) {
        extra = {};
      }
    }
    const headers = Object.assign({}, p.headers || {}, extra);
    const hasAuth = Object.keys(headers).some(k => /^(authorization|x-api-key|x-goog-api-key)$/i.test(k));
    if (!hasAuth && p.apiKey) headers.Authorization = 'Bearer ' + p.apiKey;
    const init = { method: String(p.balanceMethod || 'GET').toUpperCase(), headers };
    if (init.method !== 'GET' && p.balanceBody) init.body = p.balanceBody;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    init.signal = ac.signal;
    let j;
    try {
      const r = await fetch(url, init);
      if (!r.ok) {
        let detail = '';
        try {
          detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 140);
        } catch (e) {}
        throw new Error('HTTP ' + r.status + (detail ? ' · ' + detail : ''));
      }
      const t = await r.text();
      try {
        j = JSON.parse(t);
      } catch (e) {
        j = t.trim();
      }
    } finally {
      clearTimeout(timer);
    }

    const picked = typeof j === 'object' && j !== null ? AI.pickBalance(j, p.balancePath) : { value: j, currency: '' };
    if (!picked || picked.value == null)
      throw new Error(
        L(
          '未找到余额字段，请在「取值路径」指定（如 data.balance）',
          'No balance field found; set a JSON path such as data.balance'
        )
      );
    const num = Number(String(picked.value).replace(/[^\d.\-]/g, ''));
    const res = {
      providerId: p.id,
      provider: p.name || '',
      value: isNaN(num) ? String(picked.value) : num,
      raw: picked.value,
      currency: picked.currency || p.balanceCurrency || '',
      path: p.balancePath || picked.path || '',
      at: Date.now()
    };
    AI.state.balanceCache = AI.state.balanceCache || {};
    AI.state.balanceCache[p.id] = res;
    AI.save();
    return res;
  };

  /* ------------------------------------------------------------
   5. Usage aggregation: one record per reply turn; token counts come from
   API usage when available and local estimates otherwise
   ------------------------------------------------------------ */
  AI.logRequest = function (rec) {
    const entry = Object.assign({ id: AI.uid(), at: AI.now(), ok: true }, rec || {});
    AI.state.requestLog = (AI.state.requestLog || []).concat([entry]).slice(-300);
    AI.save();
  };

  AI.recordUsage = function (model, tin, tout, cost) {
    tin = Math.max(0, +tin || 0);
    tout = Math.max(0, +tout || 0);
    cost = +cost || 0;
    const logs = AI.state.logs || (AI.state.logs = {});
    const k = AI.dayKey();
    const l = logs[k] || (logs[k] = { in: 0, out: 0, requests: 0, models: {}, cost: 0 });
    l.in += tin;
    l.out += tout;
    l.requests += 1;
    l.cost = (l.cost || 0) + cost;
    const m = model || 'unknown';
    const e = l.models[m] || (l.models[m] = { requests: 0, in: 0, out: 0, cost: 0 });
    e.requests += 1;
    e.in += tin;
    e.out += tout;
    e.cost = (e.cost || 0) + cost;
    const last = (AI.state.requestLog || []).slice(-1)[0];
    if (last && (last.model === m || (!last.in && !last.out))) {
      last.in = tin;
      last.out = tout;
    }
    AI.save();
  };

  /* ------------------------------------------------------------
   6. Editable combo boxes: presets plus arbitrary custom values
   ------------------------------------------------------------ */
  /* F.combo in 05-ui.js provides the editable combo box (custom placeholder and
   hint) and is not redefined here. The new string for custom values is in LEX
   and is translated by the post-render pass in English mode. */

  /* ------------------------------------------------------------
   7. Statistics: token trend, model distribution and balance
   ------------------------------------------------------------ */
  U.tab_stats = function () {
    const F = U.F,
      logs = AI.state.logs || {};
    let ti = 0,
      to = 0,
      rq = 0,
      cost = 0;
    const models = {};
    Object.keys(logs).forEach(k => {
      const l = logs[k];
      ti += l.in || 0;
      to += l.out || 0;
      rq += l.requests || 0;
      cost += l.cost || 0;
      Object.keys(l.models || {}).forEach(m => {
        const e = l.models[m];
        const x = models[m] || (models[m] = { requests: 0, in: 0, out: 0, cost: 0 });
        if (typeof e === 'number') x.requests += e;
        else {
          x.requests += e.requests || 0;
          x.in += e.in || 0;
          x.out += e.out || 0;
          x.cost += e.cost || 0;
        }
      });
    });

    const days = [],
      today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = AI.dayKey(d.getTime()),
        l = logs[k];
      days.push({ k, n: l ? (l.in || 0) + (l.out || 0) : 0, rq: l ? l.requests || 0 : 0 });
    }
    const dmax = Math.max(1, ...days.map(x => x.n));
    const trend = days
      .map(x => {
        const title = tfmt('{0}：{1} tokens / {2} 回合', '{0}: {1} tokens / {2} replies')(x.k, AI.fmtNum(x.n), x.rq);
        return (
          '<div class="trend-col" title="' +
          title +
          '"><i style="height:' +
          Math.max(2, Math.round((x.n / dmax) * 100)) +
          '%"></i><span>' +
          x.k.slice(5) +
          '</span></div>'
        );
      })
      .join('');

    const cells = [],
      start = new Date(today);
    start.setDate(start.getDate() - 83); // The last of the 84 days is today; week-aligned bucketing previously excluded it.
    const allN = [];
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const l = logs[AI.dayKey(d.getTime())];
      allN.push(l ? (l.in || 0) + (l.out || 0) : 0);
    }
    const nz = allN.filter(x => x > 0).sort((a, b) => a - b);
    const q = p => (nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * p))] : 1);
    const mx = nz.length ? nz[nz.length - 1] : 1;
    const th = [Math.max(1, q(0.25)), Math.max(2, q(0.55)), Math.max(3, q(0.82))];
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = AI.dayKey(d.getTime()),
        n = allN[i];
      const lv = n === 0 ? 0 : n >= mx ? 4 : n <= th[0] ? 1 : n <= th[1] ? 2 : n <= th[2] ? 3 : 4;
      const title = tfmt('{0}：{1} tokens', '{0}: {1} tokens')(k, AI.fmtNum(n));
      cells.push('<div class="heat-cell lv' + lv + '" title="' + title + '"></div>');
    }

    const ents = Object.keys(models)
      .map(m => [m, models[m]])
      .sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
    const tmax = Math.max(1, ...ents.map(e => e[1].in + e[1].out));
    const dist = ents.length
      ? ents
          .map(function (e) {
            const m = e[0],
              x = e[1],
              total = x.in + x.out;
            return (
              '<div class="dist-row"><div class="dist-head"><b>' +
              AI.esc(m) +
              '</b><span>' +
              tfmt('{0} tokens · {1} 回合', '{0} tokens · {1} replies')(AI.fmtNum(total), x.requests) +
              '</span></div>' +
              '<div class="dist-bar"><i style="width:' +
              Math.max(2, Math.round((total / tmax) * 100)) +
              '%"></i></div>' +
              '<div class="tiny">↑ ' +
              AI.fmtNum(x.in) +
              '　↓ ' +
              AI.fmtNum(x.out) +
              (x.cost ? '　' + AI.money(x.cost) : '') +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="tiny">' + L('暂无数据', 'No data yet') + '</div>';

    const cache = AI.state.balanceCache || {};
    const balKeys = Object.keys(cache);
    const bal = balKeys.length
      ? balKeys
          .map(id => {
            const r = cache[id];
            return (
              '<div class="list-row"><span class="grow">' +
              AI.esc(r.provider || id) +
              '<small>' +
              new Date(r.at).toLocaleString() +
              (r.path ? ' · ' + AI.esc(r.path) : '') +
              '</small></span>' +
              '<b>' +
              AI.esc(String(r.value)) +
              (r.currency ? ' ' + AI.esc(r.currency) : '') +
              '</b></div>'
            );
          })
          .join('')
      : '<div class="tiny">' +
        L(
          '未查询。在「常用 → 供应商」里为供应商配置余额端点后，点击「查询余额」即可。',
          'Not checked yet. Configure a balance endpoint under Common → Providers, then click Check balance.'
        ) +
        '</div>';

    let h = F.section(L('使用概览', 'Overview'));
    h +=
      '<div class="stat-grid"><div class="stat-box"><b>' +
      AI.fmtNum(rq) +
      '</b><span>' +
      L('回复回合', 'Replies') +
      '</span></div>' +
      '<div class="stat-box"><b>' +
      AI.fmtNum(ti) +
      '</b><span>' +
      L('输入 tokens', 'Input tokens') +
      '</span></div>' +
      '<div class="stat-box"><b>' +
      AI.fmtNum(to) +
      '</b><span>' +
      L('输出 tokens', 'Output tokens') +
      '</span></div>' +
      '<div class="stat-box"><b>' +
      AI.money(cost) +
      '</b><span>' +
      L('估算费用', 'Estimated cost') +
      '</span></div></div>';
    h +=
      '<div class="tiny" style="margin:-2px 0 12px;line-height:1.7">' +
      L(
        'token 数优先采用 API 返回的实际计数（服务商未返回时才用本地估算）；单价由你手动填写且可能过时。精确计费与余额请以服务商账单 / 余额接口为准，此处仅供趋势参考。',
        'Token counts come from the API whenever available (local estimates are used only when usage is missing); unit prices are entered by you and may be outdated. Use your provider invoice or balance endpoint for exact billing. This view is for trends only.'
      ) +
      '</div>';
    h += F.section(L('账户余额（自定义端点）', 'Account balance (custom endpoint)')) + bal;
    h +=
      F.section(L('近 14 天 token 趋势', 'Token trend (last 14 days)')) +
      '<div class="trend-chart">' +
      trend +
      '</div>';
    h +=
      F.section(L('每日活动（近 12 周）', 'Daily activity (last 12 weeks)')) +
      '<div class="heatmap">' +
      cells.join('') +
      '</div>';
    h += F.section(L('模型用量分布', 'Usage by model')) + dist;
    h +=
      F.section(L('会话', 'Conversations')) +
      '<div class="tiny">' +
      tfmt('共 {0} 个会话 · {1} 条消息 · {2} 条记忆', '{0} conversations · {1} messages · {2} memories')(
        AI.state.conversations.length,
        AI.state.conversations.reduce((a, c) => a + Object.keys(c.nodes).length - 1, 0),
        (AI.state.memories || []).length
      ) +
      '</div>';
    return h;
  };

  /* ------------------------------------------------------------
   8. Model fetching: multi-select with search and merge; never overwrite
   existing entries or require a full refresh
   ------------------------------------------------------------ */
  function mergePickedModels(p, chosen) {
    const map = {};
    (p.models || []).forEach(m => {
      const id = m.id || m;
      map[id] = typeof m === 'object' ? Object.assign({}, m) : { id, name: id };
    });
    chosen.forEach(m => {
      const prev = map[m.id] || {};
      const next = Object.assign({}, prev, {
        id: m.id,
        name: prev.name && prev.name !== m.id ? prev.name : m.name || m.id
      });
      const fromApi = m.source === 'api';
      if (m.contextWindow && (fromApi || !next.context)) next.context = m.contextWindow;
      if (m.maxOutput && (fromApi || !next.maxOutput)) next.maxOutput = m.maxOutput;
      if (m.priceIn != null && (fromApi || next.priceIn == null)) next.priceIn = m.priceIn;
      if (m.priceOut != null && (fromApi || next.priceOut == null)) next.priceOut = m.priceOut;
      if (m.vision && next.vision === undefined) next.vision = true;
      if (m.tools && next.tools === undefined) next.tools = true;
      if (m.reasoning && next.reasoning === undefined) next.reasoning = true;
      if (m.input && m.output) next.modalities = { input: m.input, output: m.output };
      next.metaSource = m.source === 'unknown' ? 'none' : m.source;
      if (m.apiFields) next.metaFields = m.apiFields;
      map[m.id] = next;
    });
    p.models = Object.keys(map).map(k => map[k]);
    if (p.modelsRaw !== undefined) p.modelsRaw = p.models.map(m => m.id).join('\n');
    AI.save(true);
    try {
      U.renderDrawer();
      U.updateLabels();
    } catch (e) {}
    U.toast(
      tfmt('已合并 {0} 个模型，当前共 {1} 个', 'Merged {0} models; {1} total')(chosen.length, p.models.length),
      'ok'
    );
  }

  function openModelPicker(pid) {
    const p = (AI.state.providers || []).find(x => x.id === pid);
    if (!p) return;
    U.toast(L('正在拉取模型列表…', 'Fetching model list…'));
    AI.fetchModelsDetailed(p)
      .then(list => {
        if (!list.length) {
          U.toast(L('未发现可用模型', 'No models found'), 'warn');
          return;
        }
        const existing = {};
        (p.models || []).forEach(m => {
          existing[m.id || m] = true;
        });
        const rows = list
          .map(function (m, i) {
            const tags = [];
            if (m.contextWindow) tags.push(Math.round(m.contextWindow / 1000) + 'K ' + L('上下文', 'ctx'));
            if (m.maxOutput) tags.push(L('输出上限', 'max out') + ' ' + AI.fmtNum(m.maxOutput));
            if (m.priceIn != null || m.priceOut != null) tags.push(L('含单价', 'priced'));
            if (m.vision) tags.push(L('视觉', 'Vision'));
            if (m.reasoning) tags.push(L('推理', 'Reasoning'));
            if (m.tools) tags.push(L('工具', 'Tools'));
            if (m.input && m.input.indexOf('image') >= 0) tags.push(L('图像输入', 'Image in'));
            if (m.output.indexOf('image') >= 0) tags.push(L('图像输出', 'Image out'));
            if (m.embedding) tags.push(L('向量', 'Embedding'));
            if (m.source === 'api')
              tags.push(
                L('接口提供', 'From API') + (m.apiFields && m.apiFields.length ? ' · ' + m.apiFields.join('/') : '')
              );
            else if (m.source === 'inferred') tags.push(L('本地推断', 'Inferred'));
            return (
              '<label class="pick-row"><input type="checkbox" data-pick="' +
              i +
              '" ' +
              (existing[m.id] ? '' : 'checked') +
              '><span class="grow"><b>' +
              AI.esc(m.id) +
              '</b>' +
              '<small>' +
              (existing[m.id] ? L('已存在', 'Already added') : L('新增', 'New')) +
              (tags.length ? ' · ' + AI.esc(tags.join(' · ')) : '') +
              '</small></span></label>'
            );
          })
          .join('');
        U.modal({
          title: L('选择要添加的模型', 'Select models to add'),
          wide: true,
          width: 'min(640px,94vw)',
          body:
            '<p class="tiny">' +
            tfmt(
              '共发现 {0} 个模型，其中 {1} 个已存在。可搜索、仅选新增；只合并勾选的模型，不会覆盖未选中的已有配置。',
              'Found {0} models, {1} already configured. Search or pick new ones only; selected models are merged without overwriting existing ones.'
            )(list.length, Object.keys(existing).length) +
            '</p>' +
            '<input class="input" id="pickSearch" placeholder="' +
            L('搜索模型 ID…', 'Search model ID…') +
            '" autocomplete="off">' +
            '<label class="pick-probe"><input type="checkbox" id="pickProbe"> ' +
            L(
              '探测选中模型详情（较慢，可补齐列表没返回的上下文窗口 / 输出上限）',
              'Probe details for selected models (slower; fills in context / output limits missing from the list)'
            ) +
            '</label>' +
            '<div class="form-actions"><button class="mini-btn" id="pickAll">' +
            L('全选', 'Select all') +
            '</button>' +
            '<button class="mini-btn" id="pickNew">' +
            L('仅新增', 'New only') +
            '</button>' +
            '<button class="mini-btn" id="pickNone">' +
            L('全不选', 'Select none') +
            '</button>' +
            '<span class="tiny" id="pickCount"></span></div>' +
            '<div class="pick-list" id="pickList">' +
            rows +
            '</div>',
          actions: [
            { label: L('取消', 'Cancel'), cls: 'ghost' },
            {
              label: L('添加选中模型', 'Add selected'),
              cls: 'primary',
              onClick: function (root) {
                const chosen = [];
                root.querySelectorAll('[data-pick]:checked').forEach(function (cb) {
                  chosen.push(list[+cb.dataset.pick]);
                });
                if (!chosen.length) {
                  U.toast(L('未选择任何模型', 'No model selected'), 'warn');
                  return false;
                }
                const probe = !!root.querySelector('#pickProbe:checked');
                if (probe) {
                  U.toast(L('正在探测模型详情…', 'Probing model details…'));
                  let i = 0,
                    done = 0;
                  const worker = async function () {
                    while (i < chosen.length) {
                      const k = i++;
                      try {
                        const d = await AI.probeModelDetail(p, chosen[k].id);
                        if (d && d.source === 'api') {
                          const cur = chosen[k];
                          if (d.contextWindow) cur.contextWindow = d.contextWindow;
                          if (d.maxOutput) cur.maxOutput = d.maxOutput;
                          if (d.priceIn != null) cur.priceIn = d.priceIn;
                          if (d.priceOut != null) cur.priceOut = d.priceOut;
                          if (d.input && d.output) {
                            cur.input = d.input;
                            cur.output = d.output;
                          }
                          cur.source = 'api';
                          cur.apiFields = (cur.apiFields || []).concat(d.apiFields || []);
                        }
                      } catch (e) {}
                      done++;
                    }
                  };
                  Promise.all(Array.from({ length: Math.min(4, chosen.length) }, worker)).then(function () {
                    mergePickedModels(p, chosen);
                    U.toast(L('详情探测完成，已合并', 'Details merged'), 'ok');
                  });
                  return true; // Merge asynchronously after closing the dialog first.
                }
                mergePickedModels(p, chosen);
              }
            }
          ],
          onOpen: function (root) {
            const listEl = root.querySelector('#pickList');
            const cnt = root.querySelector('#pickCount');
            const boxes = function () {
              return Array.prototype.slice.call(listEl.querySelectorAll('[data-pick]'));
            };
            const refresh = function () {
              if (cnt)
                cnt.textContent = tfmt('已选 {0} / {1}', 'Selected {0} / {1}')(
                  boxes().filter(function (b) {
                    return b.checked;
                  }).length,
                  boxes().length
                );
            };
            const search = root.querySelector('#pickSearch');
            if (search)
              search.addEventListener('input', function () {
                const q = this.value.trim().toLowerCase();
                boxes().forEach(function (b) {
                  b.closest('.pick-row').hidden = !b.closest('.pick-row').textContent.toLowerCase().includes(q);
                });
              });
            const all = root.querySelector('#pickAll');
            if (all)
              all.onclick = function () {
                boxes().forEach(function (b) {
                  b.checked = true;
                });
                refresh();
              };
            const none = root.querySelector('#pickNone');
            if (none)
              none.onclick = function () {
                boxes().forEach(function (b) {
                  b.checked = false;
                });
                refresh();
              };
            const onlyNew = root.querySelector('#pickNew');
            if (onlyNew)
              onlyNew.onclick = function () {
                boxes().forEach(function (b) {
                  b.checked = !existing[list[+b.dataset.pick].id];
                });
                refresh();
              };
            listEl.addEventListener('change', refresh);
            refresh();
          }
        });
      })
      .catch(e => U.toast(L('拉取失败：', 'Fetch failed: ') + e.message, 'err'));
  }

  /* ------------------------------------------------------------
   9. Drawer action extensions
   ------------------------------------------------------------ */
  /* While editing, synchronise current form values into state (data-bind via
   setBound) so Base URL, API key and balance endpoint changes take effect for
   fetch or lookup requests without an explicit save. */
  function flushEditingForm() {
    const body = U.dom.drawerBody;
    if (!body) return;
    body.querySelectorAll('[data-bind]').forEach(inp => {
      try {
        const path = inp.dataset.bind,
          type = inp.dataset.type || 'text';
        let v = inp.value;
        if (type === 'json') {
          try {
            v = JSON.parse(v || '{}');
          } catch (e) {
            return;
          }
        }
        U.setBound(path, v, type);
      } catch (e) {}
    });
  }

  const origAction = U.drawerAction;
  U.drawerAction = function (name, ds, el) {
    const p = (AI.state.providers || []).find(x => x.id === ds.v);
    if (name === 'p-fetch') {
      flushEditingForm();
      openModelPicker(ds.v);
      return;
    }
    if (name === 'p-test') {
      flushEditingForm();
      return origAction.call(U, name, ds, el);
    }
    if (name === 'p-balance') {
      flushEditingForm();
      if (!p) return;
      if (!p.balanceUrl) {
        U.toast(
          L('先在供应商编辑里填写「余额查询地址」', 'Set the balance endpoint in the provider editor first'),
          'warn'
        );
        return;
      }
      U.toast(L('正在查询余额…', 'Checking balance…'));
      AI.fetchBalance(p)
        .then(function (r) {
          U.toast(
            tfmt('{0} 余额：{1}{2}', '{0} balance: {1}{2}')(
              r.provider || '',
              r.value,
              r.currency ? ' ' + r.currency : ''
            ),
            'ok'
          );
          try {
            U.renderDrawer();
          } catch (e) {}
        })
        .catch(function (e) {
          U.toast(L('余额查询失败：', 'Balance check failed: ') + e.message, 'err');
        });
      return;
    }
    if (name === 'p-refresh-meta') {
      flushEditingForm();
      if (!p) return;
      U.toast(L('正在刷新模型信息…', 'Refreshing model metadata…'));
      AI.refreshModelMeta(p, { probe: !!p.modelDetailEndpoint })
        .then(function (r) {
          try {
            U.renderDrawer();
            U.updateLabels();
          } catch (e) {}
          U.toast(
            tfmt(
              '已更新 {0} / {1} 个模型，接口提供 {2} 个；探测补齐 {3} 个',
              'Updated {0} / {1} models, {2} from API, {3} from detail probes'
            )(r.updated, r.total, r.apiModels, r.probed),
            'ok'
          );
        })
        .catch(function (e) {
          U.toast(L('刷新失败：', 'Refresh failed: ') + e.message, 'err');
        });
      return;
    }
    if (name === 'x-infer-models') {
      const n = AI.inferAllModels();
      try {
        U.renderDrawer();
        U.updateLabels();
      } catch (e) {}
      U.toast(
        n
          ? tfmt('已补齐 {0} 项模型元数据', 'Filled {0} metadata fields')(n)
          : L('没有可推断的新信息', 'Nothing new to infer'),
        'ok'
      );
      return;
    }
    return origAction.call(U, name, ds, el);
  };

  /* ------------------------------------------------------------
   10. Settings additions: reasoning folding, mobile Enter behaviour and
   billing notes
   ------------------------------------------------------------ */
  const origGeneral = U.tab_general;
  U.tab_general = function () {
    let h = origGeneral.call(U);
    h += '<div class="section-title">' + L('思考与输入', 'Reasoning & input') + '</div>';
    h += U.F.toggle(
      L('思考过程默认展开', 'Expand reasoning by default'),
      'settings.reasoningExpanded',
      L(
        '关闭后思考区默认折叠，仍可点击展开',
        'When off, the reasoning block starts collapsed and can still be expanded'
      )
    );
    h += U.F.toggle(
      L('允许模型输出思考', 'Allow models to emit reasoning'),
      'settings.reasoningOn',
      L(
        '关闭后不向模型请求思考预算 / 推理强度，可省 token；不影响本地展示开关',
        'When off, no thinking budget or reasoning effort is requested. The local display toggle is independent'
      )
    );
    h += U.F.toggle(
      L('还原字面量转义符', 'Unescape literal \\n / \\t'),
      'settings.unescapeLiteral',
      L(
        '把中转返回的 \\n、\\t、\\r\\n 还原成真实换行；代码块内保持原样',
        'Turn \\n / \\t / \\r\\n from gateways into real line breaks; code blocks are left untouched'
      )
    );
    h += U.F.toggle(
      L('移动设备按 Enter 发送', 'Enter sends on mobile'),
      'settings.mobileEnterSend',
      L('默认关闭：手机上 Enter 用于换行，避免误发', 'Off by default: Enter inserts a newline on touch devices')
    );
    h +=
      '<div class="tiny" style="line-height:1.7;margin:6px 0 12px">' +
      L(
        '关闭「展示思考过程」后，收到的思考内容仍会保存在会话中，重新打开即可回看，不会丢失数据。',
        'Turning off "Show reasoning" keeps the content saved in the conversation; turn it back on to review it. Nothing is lost.'
      ) +
      '</div>';
    return h;
  };

  /* ------------------------------------------------------------
   11. i18n additions: cover existing Chinese strings in 05/07 only;
   dynamic strings already use L()
   ------------------------------------------------------------ */
  Object.assign(AI.LEX, {
    '霓虹 · 渐变': 'Neon · Gradient',
    余额查询地址: 'Balance endpoint',
    取值路径: 'JSON path',
    请求方法: 'Method',
    余额单位: 'Currency / unit',
    查询余额: 'Check balance',
    '自定义请求头（余额接口）': 'Balance headers (JSON)',
    '请求体（POST 时）': 'Request body (POST)',
    余额端点: 'Balance endpoint',
    '填写完整 URL 或相对 Base URL 的路径。响应中可直接取数字，或用 JSON 路径取值；留空路径时自动查找常见余额字段。需服务端允许 CORS。':
      'Use a full URL or a path relative to Base URL. A numeric response is read directly, or set a JSON path. With no path, common balance keys are auto-detected. The endpoint must allow CORS.',
    自动推断模型信息: 'Infer model metadata',
    '根据模型 ID 批量补齐上下文长度、视觉 / 工具 / 推理能力与输入输出模态；不会覆盖你手动填过的值。':
      'Fill in context length, vision / tool / reasoning flags and I/O modalities from model IDs. Manually entered values are never overwritten.',
    批量推断: 'Infer all',
    模型能力: 'Capabilities',
    输入模态: 'Input',
    输出模态: 'Output',
    来源: 'Source',
    文本: 'Text',
    图像: 'Image',
    音频: 'Audio',
    未知: 'Unknown',
    隐私数据: 'Privacy & data',
    '输入 tokens': 'Input tokens',
    '输出 tokens': 'Output tokens',

    价格与计量说明: 'Pricing & metering',
    '不同模型的分词与计费规则各不相同，且价格会变动。token 计数优先采用 API 返回的实际值（服务商未返回时才本地估算）；费用按本地配置的单价估算，不代表服务商账单；可通过自定义余额端点查询实际余额。':
      'Tokenization and billing differ across models and prices change over time. Token counts come from the API whenever available (local estimates are used only when usage is missing); cost is computed from locally configured unit prices and is not your provider invoice. Use a custom balance endpoint for the real balance.',
    /* ---- Deep-scan gaps: option labels, placeholders, concatenated text and mixed Chinese/English strings. ---- */
    '继续,换个说法,给例子': 'Continue, rephrase, examples',
    'Custom JSON endpoint · 完全自定义 URL / headers': 'Custom JSON endpoint · fully custom URL / headers',
    'Jina Reader · 无需 Key，搜索/读取网页文本': 'Jina Reader · no key needed, search / read web pages',
    'Perplexity Sonar · 需要 API Key，用模型返回答案+引用':
      'Perplexity Sonar · requires an API key, returns answers with citations',
    'SearXNG（自建） · 需填地址，支持 format=json': 'SearXNG (self-hosted) · set the URL, supports format=json',
    'Memory only（刷新即失效）': 'Memory only (cleared on refresh)',
    'localStorage（持久）': 'localStorage (persistent)',
    'sessionStorage（关标签即失效）': 'sessionStorage (cleared when the tab closes)',
    'Time range（可自定义）': 'Time range (customizable)',
    'Quick replies（逗号分隔）': 'Quick replies (comma-separated)',
    '图标/Emoji': 'Icon / Emoji',
    'JSON 对象': 'JSON object',
    'system 消息': 'system message',
    '首条 user 前缀': 'Prefix on first user message',
    不发送: 'Do not send',
    不限: 'Unlimited',
    严格: 'Strict',
    宽松: 'Relaxed',
    加强: 'Enhanced',
    标准: 'Standard',
    无边框: 'Borderless',
    易读黑体: 'Readable sans',
    等宽: 'Monospace',
    衬线: 'Serif',
    系统无衬线: 'System sans',
    自定义字体栈: 'Custom font stack',
    跟随明暗: 'Follow theme',
    默认: 'Default',
    一周: '1 week',
    一天: '1 day',
    一年: '1 year',
    一月: '1 month',
    近一周: 'Last week',
    近一天: 'Last day',
    近一年: 'Last year',
    近一月: 'Last month',
    不显示: 'Hidden',
    文内编号: 'Inline numbers',
    来源卡片: 'Source cards',
    自定义兼容端点: 'Custom compatible endpoint',
    简体中文: 'Simplified Chinese',
    参数: 'Parameters',
    命令: 'Commands',
    生成: 'Generate',
    '可在「工具与审批」中设置审批范围与工具黑名单。':
      'Set the approval scope and tool blacklist under Tools & approvals.',
    模型请求执行: 'The model wants to run',
    '。请确认参数后再放行。': '. Review the arguments before allowing.',
    本次会话始终允许: 'Always allow this session',
    允许一次: 'Allow once',
    拒绝: 'Deny',
    '「批量推断」根据模型 ID 补齐上下文长度、视觉 / 工具 / 推理能力与输入输出模态；不会覆盖你手动填过的值。':
      'Infer all fills in context length, vision / tool / reasoning flags and I/O modalities from model IDs. Values you entered manually are never overwritten.',
    '不同模型支持的尺寸不同，可直接输入自定义值': 'Supported sizes vary by model; you can type any custom value',
    '文件夹 / 标签 / 归档 / 排序、全局全文搜索、命令面板、请求日志与用量图表、活动热力图、二维码配置分享、六种导出格式、旧版数据迁移、多标签同步、PWA 离线缓存。':
      'Folders / tags / archive / sorting, global full-text search, command palette, request log and usage charts, activity heatmap, QR config sharing, six export formats, legacy migration, multi-tab sync, PWA offline cache.',
    '时间范围（可自定义）': 'Time range (customizable)',
    '任意档位，如 high / xhigh': 'Any level, e.g. high / xhigh',
    'auto / none / required / 指定函数名': 'auto / none / required / a specific function name',
    可填服务商私有值: 'Provider-specific values allowed',
    可直接写完整阈值串: 'Enter a full threshold string',
    '预设或任意 WxH': 'Preset or any WxH',
    '预设 + 自定义': 'Preset or custom',
    展示思考过程: 'Show reasoning',
    思考过程默认展开: 'Expand reasoning by default',
    推理模型: 'Reasoning model',
    视觉模型: 'Vision model',
    '连接提前结束，输出可能不完整': 'The stream ended without a completion signal — output may be incomplete',
    生成已停止: 'Generation was stopped',
    继续生成: 'Continue',
    '请从上次输出的中断处继续，不要重复已经生成的内容，也不要添加前言或总结。':
      'Continue exactly from where the previous output stopped. Do not repeat anything already produced and do not add a preface.',
    思考过程: 'Reasoning',
    '思考中…': 'Thinking…',
    '执行中…': 'Running…',
    失败: 'Failed',
    完成: 'Done',
    '参数：': 'Args: ',
    '结果：': 'Result: ',
    '当前浏览器未提供 PWA 安装提示': 'This browser did not provide a PWA install prompt',
    'API 计数': 'API count',
    'API 返回错误：': 'API error: ',
    'token 计数为 API 返回的实际值；费用按单价估算。':
      'Token counts are the exact values returned by the API; cost is estimated from unit prices.',
    '该请求未返回 usage，token 与费用为本地近似估算，仅供参考。':
      'The API did not return usage; token counts and cost are local estimates.',
    '上次请求 API 实际计数': 'last request, exact API count',
    '本地估算（未返回 usage）': 'local estimate (no usage returned)',
    费用估算: 'Est. cost',
    'token 汇总优先采用 API 返回的实际计数，费用按配置的单价估算。':
      'Token totals are the exact counts returned by the API; cost is computed from configured unit prices.',
    'API count': 'API count',
    '(cost est.)': '(cost est.)',
    '(费用估算)': '(cost est.)',
    '响应体为空：SSE 流未建立（请检查网关是否返回 text/event-stream）':
      'Empty response body: SSE stream not established (check whether the gateway returns text/event-stream)',
    '连接提前关闭：未收到任何响应数据（可能被网关或代理截断）':
      'Connection closed early: no response data received (possibly truncated by a gateway or proxy)',
    '连接提前关闭：未收到任何响应数据': 'Connection closed early: no response data received',
    维护: 'Maintenance',
    错误日志: 'Error log',
    安装到设备: 'Install app',
    '跳到输入框 · Skip to composer': 'Skip to composer',
    '错误日志只记录本次页面运行期间的错误，保存在内存里、刷新即清空，不会上传。安装到设备需浏览器支持 PWA 且站点通过 HTTPS 访问。':
      'The error log records errors from this page session only, keeps them in memory, clears on refresh and is never uploaded. Installing requires a PWA-capable browser over HTTPS.',
    暂无错误记录: 'No errors recorded',

    '显示更早 {0} 条消息': 'Show {0} earlier messages',
    上下文: 'ctx',
    输出上限: 'max out',
    含单价: 'priced',
    图像输入: 'Image in',
    向量: 'Embedding',
    '探测选中模型详情（较慢，可补齐列表没返回的上下文窗口 / 输出上限）':
      'Probe details for selected models (slower; fills in context / output limits missing from the list)',
    探测选中模型详情: 'Probe selected model details',
    '正在探测模型详情…': 'Probing model details…',
    '详情探测完成，已合并': 'Details merged',
    刷新模型信息: 'Refresh model info',
    '正在刷新模型信息…': 'Refreshing model metadata…',
    '已更新 {0} / {1} 个模型，接口提供 {2} 个；探测补齐 {3} 个':
      'Updated {0} / {1} models, {2} from API, {3} from detail probes',
    '刷新失败：': 'Refresh failed: ',
    '模型列表地址（可选）': 'Model list endpoint (optional)',
    '模型详情模板（可选）': 'Model detail template (optional)',
    留空按协议自动拼接: 'Auto-detected from protocol if blank',
    '不同网关返回的字段不同：OpenRouter / 多数中转会在列表里直接给出 context_length、max_completion_tokens、pricing 与模态；OpenAI 官方 /models 只给 id，可填详情模板逐个探测，或点「刷新模型信息」。已手动填写的值（来源标记为 manual）不会被覆盖。':
      'Gateways expose different fields: OpenRouter and most relays return context_length, max_completion_tokens, pricing and modalities in the list; the official OpenAI /models only returns ids. Set a detail template to probe each model, or click Refresh model info. Manually entered values (source: manual) are never overwritten.',
    还原字面量转义符: 'Unescape literal \\n / \\t',
    '把中转返回的 \\n、\\t、\\r\\n 还原成真实换行；代码块内保持原样':
      'Turn \\n / \\t / \\r\\n from gateways into real line breaks; code blocks are left untouched',
    置顶: 'Pin to top',
    移动到文件夹: 'Move to folder',
    '归档/取消归档': 'Archive / unarchive',
    新对话: 'New chat'
  });

  /* ------------------------------------------------------------
   12. Startup: fill metadata for existing models silently, without
   overwriting manual values
   ------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      try {
        AI.inferAllModels();
      } catch (e) {}
      updatePlaceholder();
    }, 300);
  });

  /* ------------------------------------------------------------
   13. Production readiness: error boundary, large-conversation window,
   focus trap and PWA lifecycle
   ------------------------------------------------------------ */
  (function production() {
    const ZH = () => AI.state.settings.lang !== 'en';

    /* --- Global error boundary: record the error, show a friendly message, and never swallow it silently. --- */
    AI.errorLog = [];
    let lastToast = 0;
    const record = function (kind, msg, extra) {
      try {
        AI.errorLog.unshift({ at: Date.now(), kind, msg: String(msg || '').slice(0, 400), extra: extra || '' });
        if (AI.errorLog.length > 30) AI.errorLog.length = 30;
      } catch (e) {}
      const now = Date.now();
      if (now - lastToast > 8000) {
        lastToast = now;
        try {
          U.toast(
            ZH() ? '发生了一个错误，可在「帮助 → 错误日志」查看详情' : 'An error occurred. See Help → Error log.',
            'err'
          );
        } catch (e) {}
      }
    };
    AI.reportError = function (kind, msg, extra) {
      record(kind, msg, extra);
    };
    window.addEventListener(
      'error',
      function (e) {
        // Resource load failures (img / script onerror) also reach this handler in the capture phase; exclude them from JavaScript error records.
        if (!e.message && e.target && e.target !== window) return;
        record('error', e.message || 'resource failed', (e.filename || '') + ':' + (e.lineno || 0));
      },
      true
    );
    window.addEventListener('unhandledrejection', function (e) {
      const r = e.reason;
      record('rejection', (r && r.message) || r, r && r.stack ? String(r.stack).slice(0, 300) : '');
    });
    U.showErrorLog = function () {
      const rows = AI.errorLog.length
        ? AI.errorLog
            .map(function (x) {
              return (
                '<div class="list-row"><span class="grow"><b>' +
                AI.esc(x.kind) +
                '</b> ' +
                AI.esc(x.msg) +
                '<small>' +
                AI.esc(new Date(x.at).toLocaleString()) +
                (x.extra ? ' · ' + AI.esc(x.extra) : '') +
                '</small></span></div>'
              );
            })
            .join('')
        : '<div class="tiny">' + (ZH() ? '暂无错误记录' : 'No errors recorded') + '</div>';
      U.modal({
        title: ZH() ? '错误日志（仅本机）' : 'Error log (local only)',
        body:
          '<p class="tiny">' +
          (ZH()
            ? '仅记录本次页面运行期间的错误，不会上传；刷新后清空。'
            : 'Errors from this page session only. Never uploaded; cleared on refresh.') +
          '</p>' +
          rows,
        actions: [
          {
            label: ZH() ? '清空' : 'Clear',
            cls: 'ghost',
            onClick: function () {
              AI.errorLog = [];
            }
          },
          { label: ZH() ? '关闭' : 'Close', cls: 'primary' }
        ]
      });
    };

    /* --- Large-conversation window: render only the latest 160 messages to avoid full rebuilds on long threads. --- */
    const MAX_ROWS = 160;
    let lastConvId = null;
    U._showAllMessages = false;
    const origRM = U.renderMessages;
    U.renderMessages = function () {
      const c = AI.currentConv();
      const cid = c ? c.id : null;
      if (cid !== lastConvId) {
        lastConvId = cid;
        U._showAllMessages = false;
      }
      origRM.call(U);
      try {
        if (U.refreshTokenInfo) U.refreshTokenInfo();
      } catch (e) {}
      try {
        // origRM only removed .msg-row elements, leaving stale expand buttons; remove them on every redraw.
        const old = U.dom.messages.querySelector('.load-earlier');
        if (old) old.remove();
        if (U._showAllMessages || (U.dom.chatSearchInput.value || '').trim()) return;
        const rows = U.dom.messages.querySelectorAll('.msg-row');
        if (rows.length <= MAX_ROWS) return;
        const hide = rows.length - MAX_ROWS;
        for (let i = 0; i < hide; i++) rows[i].remove();
        const btn = document.createElement('button');
        btn.className = 'load-earlier';
        btn.type = 'button';
        btn.textContent = ZH() ? '显示更早 ' + hide + ' 条消息' : 'Show ' + hide + ' earlier messages';
        btn.onclick = function () {
          U._showAllMessages = true;
          U.renderMessages();
        };
        const first = U.dom.messages.querySelector('.msg-row');
        if (first) U.dom.messages.insertBefore(btn, first);
      } catch (e) {}
    };

    /* --- Modal focus trap: Tab cycles inside the dialog so focus cannot escape to the page behind it. --- */
    const trap = function (e) {
      if (e.key !== 'Tab' || !U.dom.modalRoot || U.dom.modalRoot.hidden) return;
      const sel =
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const els = Array.prototype.slice.call(U.dom.modalRoot.querySelectorAll(sel)).filter(function (x) {
        return x.offsetParent !== null;
      });
      if (!els.length) return;
      const first = els[0],
        last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !U.dom.modalRoot.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const origModal = U.modal;
    U.modal = function (cfg) {
      origModal.call(U, cfg);
      document.addEventListener('keydown', trap, true);
    };
    const origClose = U.closeModal;
    U.closeModal = function () {
      document.removeEventListener('keydown', trap, true);
      origClose.call(U);
    };

    /* --- PWA: install prompt and update prompt, both user-controlled so an in-flight generation is never interrupted. --- */
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      try {
        U.renderDrawer();
      } catch (er) {}
    });
    U.installPwa = function () {
      if (!deferredPrompt) {
        U.toast(ZH() ? '当前浏览器不支持安装，或已安装' : 'Not installable here, or already installed', 'warn');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
      });
    };
    U.hasInstallPrompt = function () {
      return !!deferredPrompt;
    };

    /* In private mode, older WebViews or hosts that override navigator,
   serviceWorker may be a stub object. Each method is verified before use so an
   optional enhancement cannot break the whole page. */
    const swc = navigator.serviceWorker;
    if (swc && typeof swc.addEventListener === 'function' && typeof swc.getRegistration === 'function') {
      let reloading = false;
      swc.addEventListener('controllerchange', function () {
        if (reloading) return;
        reloading = true;
        try {
          location.reload();
        } catch (e) {}
      });
      Promise.resolve(swc.getRegistration())
        .then(function (reg) {
          if (!reg || typeof reg.addEventListener !== 'function') return;
          const onFound = function () {
            const nw = reg.installing;
            if (!nw || typeof nw.addEventListener !== 'function') return;
            nw.addEventListener('statechange', function () {
              if (nw.state !== 'installed' || !swc.controller) return;
              U.toast(ZH() ? '发现新版本，刷新即可更新' : 'New version available — refresh to update', 'ok');
            });
          };
          reg.addEventListener('updatefound', onFound);
          if (reg.waiting && swc.controller) onFound();
        })
        .catch(function () {});
    }

    /* Help page actions: error log and installation */
    const origAction2 = U.drawerAction;
    U.drawerAction = function (name, ds, el) {
      if (name === 'x-error-log') {
        U.showErrorLog();
        return;
      }
      if (name === 'x-install-pwa') {
        U.installPwa();
        return;
      }
      return origAction2.call(U, name, ds, el);
    };
  })();
})();
