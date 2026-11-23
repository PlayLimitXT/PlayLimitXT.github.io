/* ============================================================
   06-main.js - Conversation pipeline: send, stream, branch, compare,
   compress and initialise
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI;
  let genCount = 0;
  AI.activeAborts = new Set();

  function beginGen() {
    genCount++;
    AI.UI.setGenerating(true);
  }
  function endGen() {
    genCount = Math.max(0, genCount - 1);
    if (!genCount) {
      AI.UI.setGenerating(false);
      if (AI.localizeAll) setTimeout(AI.localizeAll, 0);
    }
  }
  function clearInput() {
    const D = AI.UI.dom;
    D.input.value = '';
    AI.UI.autoGrow();
    AI.UI.saveDraft();
    AI.UI.pending = [];
    AI.UI.renderAttachments();
  }
  function isAbort(e) {
    return e && (e.name === 'AbortError' || /abort/i.test(e.message || ''));
  }

  /* ---------------- Conversation management ---------------- */
  AI.newChat = function (title) {
    AI.UI.saveDraft();
    AI.newConversation({ title });
    AI.UI.renderAll();
    AI.UI.dom.sidebar.classList.remove('open');
    AI.UI.dom.sidebarOverlay.classList.remove('show');
    AI.UI.dom.input.focus();
  };
  AI.selectConv = function (id) {
    AI.UI.saveDraft();
    AI.state.currentId = id;
    AI.save(true);
    AI.UI.renderAll();
    AI.UI.dom.sidebar.classList.remove('open');
    AI.UI.dom.sidebarOverlay.classList.remove('show');
  };
  AI.deleteConv = function (id) {
    AI.state.conversations = AI.state.conversations.filter(c => c.id !== id);
    delete AI.state.ui.drafts[id];
    if (!AI.state.conversations.length) AI.newConversation({ silent: true });
    if (AI.state.currentId === id) AI.state.currentId = AI.state.conversations[0].id;
    AI.save(true);
    AI.UI.renderAll();
    AI.UI.toast(AI.t('conversationDeleted') || '会话已删除', 'ok');
  };

  /* ---------------- Core generation flow ---------------- */
  async function generateReply(conv, parentId, opt) {
    opt = opt || {};
    const U = AI.UI,
      D = U.dom,
      st = AI.state.settings;
    const provider = opt.provider || AI.currentProvider();
    const model = opt.model || AI.currentModel();
    if (!provider || !model) {
      U.toast(AI.t('noModel') + ' · ' + AI.t('cfgHint'), 'warn');
      U.openDrawer('providers');
      return;
    }

    const node = AI.addNode(
      conv,
      {
        role: 'assistant',
        content: '',
        reasoning: '',
        model: model.name || model.id || '',
        providerId: provider.id
      },
      parentId
    );
    const row = AI.Render.message(node, conv, { streaming: true });
    row.dataset.streaming =
      '1'; /* Live streaming rows must not be rebuilt by renderMessages, which would appear as interrupted output. */
    D.messages.appendChild(
      row
    ); /* The scroll-to-latest button lives outside the scroll container, so no offset compensation is needed. */
    D.emptyState.hidden = true;
    U.scrollBottom(true);

    const ac = new AbortController();
    AI.activeAborts.add(ac);
    beginGen();

    /* Unified event queue: reasoning, tool calls and text are written to one
   timeline in arrival order, so interleaved multi-round agent events are no
   longer collapsed into one reasoning block, one tool group and one answer. */
    let pending = [],
      raf = null;
    const flush = () => {
      raf = null;
      const list = pending;
      pending = [];
      list.forEach(ev => {
        try {
          if (ev.type === 'text') AI.Render.appendText(row, ev.text);
          else if (ev.type === 'newText') AI.Render.startTextBlock(row);
          else if (ev.type === 'reasoning') AI.Render.appendReasoning(row, ev.text);
          else if (ev.type === 'tool') AI.Render.addToolCard(row, ev.call);
          else if (ev.type === 'toolEnd') AI.Render.finishToolCard(row, ev.call, ev.res, ev.err);
        } catch (e) {
          // Render errors are no longer swallowed: node data is already stored and finalize performs a fallback redraw.
          // Report once so a silent render failure cannot be mistaken for the model stopping.
          try {
            if (AI.reportError) AI.reportError('stream-render', e && e.message, e && e.stack);
          } catch (_) {
            console.warn('[' + AI.BRAND.name + '] stream render:', e);
          }
        }
      });
      U.scrollBottom(); // No force flag: once the user detaches from auto-scroll, content is not pulled back.
    };
    const enqueue = ev => {
      pending.push(ev);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const timeline = [];
    node.timeline = timeline;
    const pushTimeline = (type, text, id) => {
      const last = timeline[timeline.length - 1];
      if (last && last.type === type && type !== 'tool') {
        last.text = (last.text || '') + text;
        return;
      }
      timeline.push(type === 'tool' ? { type: 'tool', id } : { type, text });
    };
    const start = Date.now();
    try {
      // 1) Search augmentation (non-tool mode: retrieve first, then inject context and sources)
      let searchContext = '';
      if (st.webSearchOn && !st.toolsOn) {
        U.status('正在联网搜索…');
        const lastUser = AI.pathOf(conv, parentId)
          .filter(n => n.role === 'user')
          .pop();
        const q = ((lastUser && lastUser.content) || '').replace(/\n/g, ' ').slice(0, 300);
        const r = await AI.webSearch(q);
        searchContext = AI.state.search.autoInject === false ? '' : r.text || '';
        const cite = AI.state.search.citationStyle || 'chip';
        if (cite === 'inline' && r.results && r.results.length)
          searchContext +=
            '\n\n【来源编号】\n' + r.results.map((s, i) => `[${i + 1}] ${s.title || ''} ${s.url || ''}`).join('\n');
        if (r.results && r.results.length && cite !== 'none') {
          node.sources = r.results;
          AI.Render.setSources(row, r.results);
        }
        if (r.error && !r.results.length) U.toast('搜索失败：' + r.error, 'warn');
      }
      // 2. Tool set
      let tools = [];
      if (st.toolsOn) {
        U.status('正在准备工具…');
        tools = await AI.collectTools({ webSearch: true, mcp: true });
      }
      // 3. Context
      const messages = AI.buildMessages(conv, { leafId: parentId, searchContext });
      const ev = {
        onDelta: t => {
          const s = typeof t === 'string' && t ? t : '';
          if (!s) return;
          node.content = (node.content || '') + s;
          if (timeline.length && timeline[timeline.length - 1].type !== 'text') enqueue({ type: 'newText' });
          pushTimeline('text', s);
          enqueue({ type: 'text', text: s });
        },
        onReasoning: t => {
          const s = typeof t === 'string' && t ? t : '';
          if (!s) return;
          // Reasoning data is always retained; the display setting only controls rendering and can be re-enabled later.
          node.reasoning = (node.reasoning || '') + s;
          pushTimeline('reasoning', s);
          if (st.showReasoning !== false) enqueue({ type: 'reasoning', text: s });
        },
        onStatus: s => U.status(s),
        onToolStart: call => {
          node.toolCalls = node.toolCalls || [];
          node.toolCalls.push({ id: call.id, name: call.name, args: call.args, status: 'running', result: '' });
          pushTimeline('tool', '', call.id);
          enqueue({ type: 'tool', call });
          U.status('调用工具：' + call.name);
          U.scrollBottom();
        },
        onToolEnd: (call, res, err) => {
          const list = node.toolCalls || [];
          const rec = list.find(x => x.id === call.id) || list[list.length - 1];
          if (rec) {
            rec.status = err ? 'fail' : 'done';
            rec.result = err ? '错误：' + err : (res && res.text) || '';
          }
          enqueue({ type: 'toolEnd', call, res: res && res.text, err });
          U.scrollBottom();
        },
        onSources: list => {
          node.sources = list;
          AI.Render.setSources(row, list);
        },
        onImages: list => {
          node.images = list;
          AI.Render.setImages(row, list);
        }
      };

      let result;
      if (tools.length) {
        result = await AI.runAgentLoop({
          provider,
          model,
          messages,
          tools,
          ev,
          signal: ac.signal,
          stream: st.stream,
          conv
        });
      } else {
        result = { content: '', reasoning: '', usage: null, sources: [], rounds: 0, truncated: false };
        const r = await AI.chat({
          provider,
          model,
          messages,
          signal: ac.signal,
          stream: st.stream,
          conv,
          onDelta: ev.onDelta,
          onReasoning: ev.onReasoning,
          onStatus: ev.onStatus
        });
        result.content = r.content;
        result.reasoning = r.reasoning;
        result.usage = r.usage;
        result.truncated = !!r.truncated;
      }
      if (raf) {
        cancelAnimationFrame(raf);
        flush();
      }
      node.content = node.content || result.content || '';
      node.reasoning = node.reasoning || result.reasoning || '';
      if (result.sources && result.sources.length) node.sources = result.sources;
      if (result.images && result.images.length) node.images = result.images;

      const dur = Math.max(1, Date.now() - start);
      /* Token accounting: use the API usage object whenever present and never
   overwrite it with a local estimate. Estimation is used only when usage is
   entirely absent, with usageSource set to estimated for clear UI labelling. */
      const api = result.usage && result.usage.source === 'api' ? result.usage : null;
      const inTok = api
        ? api.in
        : AI.estimateTokens(
            messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('')
          );
      const outTok = api ? api.out : AI.estimateTokens(node.content + node.reasoning);
      node.usage = api || null;
      node.stats = {
        in: inTok,
        out: outTok,
        total: api ? api.total || inTok + outTok : inTok + outTok,
        cached: api ? api.cached || 0 : 0,
        reasoningTokens: api ? api.reasoning || 0 : 0,
        usageSource: api ? 'api' : 'estimated',
        speed: outTok / (dur / 1000),
        duration: dur,
        rounds: result.rounds || 0,
        cost: AI.estimateCost(inTok, outTok, model)
      };
      node.truncated = !!result.truncated;
      U.updateTokenInfo(node);
      if (st.autoSpeak && node.content && !node.error) {
        try {
          U.speak(node.content);
        } catch (_) {}
      }
    } catch (e) {
      if (raf) {
        cancelAnimationFrame(raf);
        flush();
      }
      if (isAbort(e)) {
        // The stopped marker is no longer appended to the message body; it is stored as state and offers one-click continuation.
        node.stopped = true;
        U.toast(AI.t('stopped'), 'warn');
      } else {
        node.error = e.message || String(e);
        U.toast(node.error, 'err');
      }
    } finally {
      /* The timeline is kept only for interleaved events; ordinary replies render as a single block to avoid duplicate storage. */
      const tl = node.timeline || [];
      const textCount = tl.filter(x => x.type === 'text').length;
      const lastIsText = tl.length && tl[tl.length - 1].type === 'text';
      const interleaved = textCount > 1 || (tl.length > 1 && !lastIsText) || tl.some(x => x.type === 'tool');
      if (!interleaved || tl.length > 200) delete node.timeline;
      AI.Render.finalize(row, node);
      delete row.dataset.streaming;
      AI.activeAborts.delete(ac);
      endGen();
      try {
        const s2 = node.stats || {};
        AI.recordUsage(model.id || node.model || 'unknown', s2.in || 0, s2.out || 0, s2.cost || 0);
      } catch (e) {
        try {
          if (AI.reportError) AI.reportError('usage-record', e && e.message);
        } catch (_) {}
      }
      AI.save(true);
      U.renderConvList();
      U.renderChatHead();
      U.updateCtxMeter();
      U.scrollBottom(); // Do not force the viewport back to the bottom on completion; respect the user's scroll position.
    }
    return node;
  }

  /* Continue from a truncated or stopped node without repeating already generated content. */
  AI.continueGeneration = function (conv, nodeId) {
    const n = conv.nodes[nodeId];
    if (!n) return;
    const en = AI.state.settings.lang === 'en';
    const text = en
      ? 'Continue exactly from where the previous output stopped. Do not repeat anything already produced and do not add a preface.'
      : '请从上次输出的中断处继续，不要重复已经生成的内容，也不要添加前言或总结。';
    const un = AI.addNode(conv, { role: 'user', content: text }, n.id);
    AI.UI.renderMessages();
    setTimeout(() => generateReply(conv, un.id), 30);
  };

  /* Automatic titles run asynchronously and never block the main reply. */
  let titleBusy = false;
  async function autoTitle(conv) {
    if (titleBusy || !AI.state.settings.autoTitle) return;
    if (conv.title && conv.title !== AI.t('newChat') && conv.title.length > 2 && !/^.{1,3}$/.test(conv.title)) {
      // An existing truncated title is still refined once.
    }
    titleBusy = true;
    try {
      const text = AI.pathOf(conv)
        .slice(0, 2)
        .map(n => n.content)
        .join('\n')
        .slice(0, 500);
      const t = await AI.generateTitle(text);
      if (t && conv.title !== t) {
        conv.title = t;
        AI.save();
        AI.UI.renderConvList();
        AI.UI.renderChatHead();
      }
    } catch (e) {
      /* Ignored */
    }
    titleBusy = false;
  }

  /* ---------------- Sending ---------------- */
  AI.send = async function (opts) {
    opts = opts || {};
    const U = AI.UI,
      D = U.dom,
      st = AI.state.settings;
    if (genCount > 0 && !opts.force) {
      U.toast('正在生成中，请先停止或等待', 'warn');
      return;
    }
    let text = (D.input.value || '').trim();
    const literalSlash = text.startsWith('//');
    if (literalSlash) text = text.slice(1); // A leading // sends a literal slash.
    const attachments = U.pending.slice();
    if (!text && !attachments.length) return;
    if (!literalSlash && text.startsWith('/')) {
      if (handleSlash(text)) {
        clearInput();
        return;
      }
    }
    if (!AI.currentProvider() || !AI.currentModel()) {
      U.toast(AI.t('noModel') + ' · ' + AI.t('cfgHint'), 'warn');
      U.openDrawer('providers');
      return;
    }
    if (!D.replyBar.hidden) {
      text = '> ' + D.replyLabel.textContent.replace(/^引用：/, '').trim() + '\n\n' + text;
      U.setReply('');
    }
    const conv = AI.currentConv();
    const userNode = AI.addNode(conv, { role: 'user', content: text, attachments }, AI.leafId(conv));
    clearInput();
    U.renderMessages();
    if (st.autoTitle && !conv.titleGenerated) {
      conv.titleGenerated = true;
      autoTitle(conv);
    }
    await generateReply(conv, userNode.id, opts);
    // Auto-compress context every N turns
    if (st.compressAuto && (st.compressEvery | 0) > 0) {
      conv._turns = (conv._turns || 0) + 1;
      if (conv._turns >= (st.compressEvery | 0)) {
        conv._turns = 0;
        try {
          await AI.compressContext();
        } catch (_) {}
      }
    }
  };
  function handleSlash(text) {
    const U = AI.UI;
    const parts = text.slice(1).split(/\s+/),
      cmd = (parts[0] || '').toLowerCase(),
      arg = parts.slice(1).join(' ');
    switch (cmd) {
      case 'new':
        AI.newChat();
        return true;
      case 'clear':
        AI.clearConv(AI.currentConv());
        U.renderAll();
        return true;
      case 'model':
        U.showModelPicker(U.dom.modelLabel.parentElement);
        return true;
      case 'theme':
        U.setMode(document.body.classList.contains('light') ? 'dark' : 'light');
        return true;
      case 'search':
        U.openDrawer('search');
        return true;
      case 'export':
        U.exportMarkdown();
        return true;
      case 'prompt':
      case 'p':
        U.promptPicker(document.getElementById('btnPromptQuick'));
        return true;
      case 'image':
        U.imageDialog();
        return true;
      case 'summarize':
      case 'compress':
        AI.compressContext();
        return true;
      case 'branch':
        U.branchTree();
        return true;
      case 'race':
        U.raceDialog();
        return true;
      case 'settings':
        U.openDrawer(arg || 'general');
        return true;
      case 'help':
        U.openDrawer('help');
        return true;
      default: {
        const ext = (AI.SLASH_COMMANDS || {})[cmd];
        if (ext) {
          try {
            ext(arg);
          } catch (e) {
            U.toast(e.message, 'err');
          }
          return true;
        }
        U.toast('未知命令 /' + cmd + '（试试 /help）', 'warn');
        return false;
      }
    }
  }
  AI.stop = function () {
    AI.activeAborts.forEach(a => {
      try {
        a.abort();
      } catch (e) {}
    });
    if (window.speechSynthesis) speechSynthesis.cancel();
  };

  /* ---------------- Edit-and-regenerate, regenerate and switch model ---------------- */
  AI.editMessage = function (conv, id) {
    const n = conv.nodes[id];
    if (!n) return;
    AI.UI.modal({
      title: '编辑消息并重新生成',
      width: 'min(560px,94vw)',
      body: `<p class="tiny">修改后会生成一条新的对话分支，原分支保留。</p><textarea class="textarea" id="editMsg" rows="7">${AI.esc(n.content)}</textarea>`,
      actions: [
        { label: AI.t('cancel'), cls: 'ghost' },
        {
          label: '重新生成',
          cls: 'primary',
          onClick: root => {
            const val = root.querySelector('#editMsg').value.trim();
            if (!val) return false;
            const un = AI.addNode(conv, { role: 'user', content: val, attachments: n.attachments || [] }, n.parentId);
            AI.UI.renderMessages();
            setTimeout(() => generateReply(conv, un.id), 30);
          }
        }
      ]
    });
  };
  AI.regenerate = function (conv, id, anchor) {
    const n = conv.nodes[id];
    if (!n) return;
    const go = (p, m) => generateReply(conv, n.parentId, p ? { provider: p, model: m } : {});
    if (!anchor) {
      go();
      return;
    }
    const items = [
      { icon: AI.icon('refresh'), label: '用当前模型重新生成', onClick: go },
      {
        title:
          AI.state.settings.lang === 'en' ? 'Retry with another model (new branch)' : '换模型生成新分支（新分支独立）'
      },
      { sep: true }
    ];
    AI.allModels()
      .slice(0, 18)
      .forEach(x =>
        items.push({
          icon: AI.icon('layers'),
          label: x.model.name || x.id,
          sub: x.provider.name,
          onClick: () => go(x.provider, x.model)
        })
      );
    AI.UI.popover(anchor, items);
  };

  /* ---------------- Context compression ---------------- */
  AI.compressContext = async function () {
    const U = AI.UI,
      conv = AI.currentConv();
    if (!conv) return;
    const path = AI.pathOf(conv);
    const head = path.slice(0, Math.max(0, path.length - 6));
    if (head.length < 4) {
      U.toast('对话太短，暂时无需压缩', 'warn');
      return;
    }
    U.status('正在生成上下文摘要…');
    try {
      const text = head
        .map(n => `${n.role === 'user' ? '用户' : 'AI'}：${n.content}`)
        .join('\n\n')
        .slice(0, 16000);
      const r = await AI.complete(
        AI.langPrompt(
          '把以下对话历史压缩为可供后续回合继续使用的结构化摘要：① 已确认的事实、数值与专有名词（逐条保留，不得改写数值）② 用户偏好与约束 ③ 已做出的决定及理由 ④ 未解决问题与待办 ⑤ 工具或检索得到的关键结论及来源。使用简体中文、Markdown 列表；区分「事实」与「推断」；不要新增原文没有的信息。',
          'Compress the conversation history into a structured handoff summary for later turns: (1) confirmed facts, figures and proper nouns, preserved verbatim; (2) user preferences and constraints; (3) decisions made and their rationale; (4) open questions and action items; (5) key findings from tools or search with their sources. Use Markdown lists. Separate facts from inferences and introduce no information absent from the source.'
        ),
        text
      );
      conv.summary = r;
      conv.summaryAt = Date.now();
      AI.save(true);
      U.renderAll();
      U.toast(AI.t('compressDone'), 'ok');
    } catch (e) {
      U.toast(e.message, 'err');
    }
    U.status(AI.t('ready'));
  };

  /* ---------------- Multi-model comparison (Race) ---------------- */
  AI.race = async function (picked, text) {
    const U = AI.UI;
    if (!text || !text.trim()) {
      U.toast('请输入要对比的问题', 'warn');
      return;
    }
    const conv = AI.currentConv();
    const node = AI.addNode(conv, { role: 'user', content: text }, AI.leafId(conv));
    clearInput();
    U.renderMessages();
    // Sibling nodes generated concurrently under the same parent form switchable branch variants.
    /* Rate-limit by maxConcurrency so a large batch does not issue every request at once. */
    const limit = Math.max(1, Math.min(8, AI.state.settings.maxConcurrency | 0 || 3));
    const rows = new Array(picked.length);
    let nextIdx = 0;
    const worker = async () => {
      while (nextIdx < picked.length) {
        const i = nextIdx++,
          x = picked[i];
        rows[i] = await generateReply(conv, node.id, { provider: x.provider, model: x.model });
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, picked.length) }, worker));
    if (rows[0]) AI.setActiveChild(conv, node.id, rows[0].id);
    U.toast(`已生成 ${rows.filter(Boolean).length} 个版本，用消息下方 ‹ 1/${rows.length} › 切换`, 'ok');
  };

  /* ---------------- Text-to-image ---------------- */
  AI.doImageGen = async function (prompt) {
    const U = AI.UI,
      conv = AI.currentConv();
    const un = AI.addNode(conv, { role: 'user', content: '生成图片：' + prompt }, AI.leafId(conv));
    const n = AI.addNode(conv, { role: 'assistant', content: '正在生成图片…', model: 'image' }, un.id);
    U.renderMessages();
    try {
      const urls = await AI.generateImage(prompt);
      n.content = '已生成图片：\n\n' + prompt;
      n.images = urls;
      U.toast('图片已生成', 'ok');
    } catch (e) {
      n.error = e.message;
      n.content = '图片生成失败';
      U.toast(e.message, 'err');
    }
    AI.save(true);
    U.renderMessages();
  };

  /* ---------------- Fork a conversation from any node ---------------- */
  AI.forkFrom = function (conv, nodeId) {
    const src = AI.pathOf(conv, nodeId);
    if (!src.length) {
      AI.UI.toast('该节点没有可复制的上下文', 'warn');
      return;
    }
    const nc = AI.newConversation({ title: (conv.title || '对话') + ' · 分支' });
    nc.assistantId = conv.assistantId;
    nc.params = AI.clone(conv.params || {});
    nc.systemOverride = conv.systemOverride || '';
    nc.folder = conv.folder || '';
    nc.forkedFrom = conv.id;
    let parent = nc.rootId;
    src.forEach(n => {
      const copy = AI.addNode(
        nc,
        {
          role: n.role,
          content: n.content,
          reasoning: n.reasoning,
          attachments: AI.clone(n.attachments || []),
          images: AI.clone(n.images || []),
          sources: AI.clone(n.sources || []),
          toolCalls: AI.clone(n.toolCalls || []),
          model: n.model,
          providerId: n.providerId,
          stats: n.stats,
          starred: n.starred
        },
        parent
      );
      parent = copy.id;
    });
    AI.state.currentId = nc.id;
    AI.save(true);
    AI.UI.renderAll();
    AI.UI.toast('已派生为新会话，原分支保持不变', 'ok');
  };

  /* ---------------- Copy all ---------------- */
  AI.copyAll = function () {
    const c = AI.currentConv();
    if (!c) return;
    const path = AI.pathOf(c);
    const text = path.map(n => `${n.role === 'user' ? '你' : 'AI'}：\n${n.content}`).join('\n\n---\n\n');
    if (!text.trim()) {
      AI.UI.toast(AI.t('noMessages'), 'warn');
      return;
    }
    AI.copy(text, true).then(ok => {
      if (ok) AI.UI.toast(AI.t('copiedAll'), 'ok');
    });
  };

  /* ---------------- Initialisation ---------------- */
  AI.init = function () {
    AI.load();
    if ((AI.state.settings.autoCleanDays | 0) > 0) {
      const cutoff = Date.now() - AI.state.settings.autoCleanDays * 86400000;
      const before = AI.state.conversations.length;
      AI.state.conversations = AI.state.conversations.filter(c => c.updatedAt > cutoff);
      if (!AI.state.conversations.length) AI.newConversation({ silent: true });
      if (!AI.currentConv()) AI.state.currentId = AI.state.conversations[0].id;
      if (before !== AI.state.conversations.length) AI.save(true);
    }
    if (window.marked) {
      try {
        marked.setOptions({ gfm: true, breaks: true });
      } catch (e) {}
    }
    if (window.mermaid) {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      } catch (e) {}
    }
    if (!window.CSS) window.CSS = {};
    if (!window.CSS.escape) window.CSS.escape = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
    AI.UI.init();
    setTimeout(() => {
      if (!AI.state.providers.length) AI.UI.toast(AI.t('noApi') + ' · ' + AI.t('cfgHint'), 'warn');
    }, 700);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', AI.init);
  else AI.init();
})();
