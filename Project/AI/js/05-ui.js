/* ============================================================
   05-ui.js - Interface: themes, conversation list, settings, command palette,
   attachments and backup
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI,
    U = (AI.UI = {});
  /* Shared localisation directive for both translation entry points. */
  const TRANSLATION_DIRECTIVE = {
    zh: '将以下内容译为地道、专业的简体中文，仅输出译文。保留 Markdown 结构、代码块、公式、专有名词、单位与既有术语；不增删内容、不改写语气、不加译注或解释；无法确定译法时保留原文并在括号内标注。',
    en: 'Translate the following into precise, idiomatic English. Output only the translation. Preserve Markdown structure, code blocks, equations, proper nouns, units and established terminology; do not add, omit or paraphrase content, and add no translator notes. Where a term is uncertain, keep the original in parentheses.'
  };
  const $ = id => document.getElementById(id);
  const D = (U.dom = {});

  /* ---------------- DOM cache ---------------- */
  U.cache = function () {
    [
      'sidebar',
      'sidebarOverlay',
      'convList',
      'sidebarSearch',
      'sideFilters',
      'sideFolders',
      'messages',
      'emptyState',
      'starterPrompts',
      'emptyHint',
      'emptyTitle',
      'emptyDesc',
      'chatTitle',
      'chatMeta',
      'chatSearchBar',
      'chatSearchInput',
      'chatSearchCount',
      'btnScrollBottom',
      'input',
      'attachmentBar',
      'replyBar',
      'replyLabel',
      'btnStop',
      'btnSend',
      'btnClearInput',
      'statusText',
      'tokenInfo',
      'draftInfo',
      'ctxFill',
      'ctxText',
      'ctxWrap',
      'modelLabel',
      'assistantLabel',
      'composer',
      'fileInput',
      'popover',
      'cmdPalette',
      'cmdInput',
      'cmdList',
      'drawerRoot',
      'drawerMask',
      'drawer',
      'drawerTitle',
      'drawerTabs',
      'drawerBody',
      'modalRoot',
      'toasts',
      'btnLang',
      'inspector',
      'inspectorTabs',
      'inspectorBody',
      'btnInspector',
      'btnCloseInspector',
      'btnInspectorSettings',
      'btnMore',
      'mobileTabbar',
      'brandTitle',
      'statusDot',
      'btnFullEdit',
      'btnDrawerExpand',
      'composerTools'
    ].forEach(id => (D[id] = $(id)));
  };

  /* ---------------- Hints and status ---------------- */
  AI.toast = U.toast = function (msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    D.toasts.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 250);
    }, 3200);
  };
  U.status = function (s) {
    D.statusText.textContent = s || AI.t('ready');
  };
  AI.onStatus = s => U.status(s);
  U.setGenerating = function (on) {
    D.btnSend.hidden = on;
    D.btnStop.hidden = !on;
    U.status(on ? AI.t('generating') : AI.t('ready'));
    document.body.dataset.generating = on ? '1' : '';
    // Disable screen-reader announcements during streaming and restore them afterwards to avoid character-by-character chatter.
    if (D.messages) D.messages.setAttribute('aria-live', on ? 'off' : 'polite');
  };
  U.refreshTokenInfo = function () {
    const c = AI.currentConv();
    const path = c ? AI.pathOf(c) : [];
    let last = null;
    path.forEach(n => {
      if (n.stats) last = n;
    });
    U.updateTokenInfo(last);
  };
  U.updateTokenInfo = function (n) {
    if (!n || !n.stats) {
      D.tokenInfo.textContent = '';
      D.tokenInfo.title = '';
      return;
    }
    const s = n.stats,
      en = AI.state.settings.lang === 'en';
    const exact = s.usageSource === 'api';
    const mark = exact ? '' : '≈';
    D.tokenInfo.textContent =
      `${mark}↑${AI.fmtNum(s.in || 0)} ↓${AI.fmtNum(s.out || 0)}` +
      (s.cached ? ` · ${AI.fmtNum(s.cached)} cached` : '') +
      (s.speed ? ` · ${s.speed.toFixed(1)} tok/s` : '') +
      (s.cost ? ` · ≈${AI.money(s.cost)}` : '') +
      (exact ? (en ? ' · API' : ' · API 计数') : '');
    D.tokenInfo.title = exact
      ? en
        ? 'Token counts are the exact values returned by the API; cost is estimated from unit prices.'
        : 'token 计数为 API 返回的实际值；费用按单价估算。'
      : en
        ? 'The API did not return usage; token counts and cost are local estimates.'
        : '该请求未返回 usage，token 与费用为本地近似估算，仅供参考。';
  };

  /* ---------------- Modals and confirmations ---------------- */
  U.closeModal = function () {
    const cb = U._modalOnClose;
    U._modalOnClose = null;
    D.modalRoot.hidden = true;
    D.modalRoot.innerHTML = '';
    const back = U._modalFocus;
    U._modalFocus = null;
    if (back && back.isConnected) {
      try {
        back.focus();
      } catch (e) {}
    }
    if (cb) {
      try {
        cb();
      } catch (e) {}
    }
  };
  U.modal = function (cfg) {
    U._modalFocus = document.activeElement;
    U._modalOnClose = cfg.onClose || null;
    D.modalRoot.setAttribute('aria-modal', 'true');
    const acts = (cfg.actions || [{ label: AI.t('close'), cls: 'ghost' }])
      .map((a, i) => `<button class="btn ${a.cls || 'ghost'}" data-modal-act="${i}">${AI.esc(a.label)}</button>`)
      .join('');
    /* cfg.width is interpolated into a style attribute; accept only the internal min() form or plain dimensions to prevent attribute injection. */
    const safeW =
      typeof cfg.width === 'string' && /^(?:min\([\d.]+px,\s*[\d.]+vw\)|\d{1,4}(?:px|vw|%|em|rem))$/.test(cfg.width)
        ? cfg.width
        : '';
    D.modalRoot.innerHTML = `<div class="modal ${cfg.wide ? 'wide' : ''}" ${safeW ? `style="width:${safeW}"` : ''}>
    <h3>${AI.esc(cfg.title || '')}</h3>
    ${cfg.body || ''}
    <div class="modal-actions">${acts}</div></div>`;
    D.modalRoot.hidden = false;
    D.modalRoot.onclick = e => {
      if (e.target === D.modalRoot) {
        U.closeModal();
        return;
      }
      const b = e.target.closest('[data-modal-act]');
      if (!b) return;
      const a = (cfg.actions || [])[+b.dataset.modalAct];
      if (a && a.onClick) {
        if (a.onClick(D.modalRoot) === false) return;
      }
      U.closeModal();
    };
    if (cfg.onOpen) cfg.onOpen(D.modalRoot);
  };
  U.confirm = function (title, body, onOk) {
    U.modal({
      title,
      body: `<p>${AI.esc(body)}</p>`,
      actions: [
        { label: AI.t('cancel'), cls: 'ghost' },
        {
          label: AI.t('confirm'),
          cls: 'danger',
          onClick: () => {
            onOk();
          }
        }
      ]
    });
  };
  /* Tool approval: Promise<boolean> */
  AI.sessionApproved = AI.sessionApproved || new Set();
  U.confirmTool = function (name, args) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => {
        if (done) return false;
        done = true;
        resolve(v);
        return true;
      };
      const pretty = JSON.stringify(args || {}, null, 2);
      U.modal({
        title: '允许调用工具？',
        wide: true,
        onClose: () => finish(false),
        body: `<p>${AI.state.settings.lang === 'en' ? 'The model wants to run' : '模型请求执行'} <b>${AI.esc(name)}</b>${AI.state.settings.lang === 'en' ? '. Review the arguments before allowing.' : '。请确认参数后再放行。'}</p>
        <pre style="max-height:220px;overflow:auto;padding:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font:12px/1.6 var(--mono);white-space:pre-wrap">${AI.esc(pretty)}</pre>
        <p class="tiny">${AI.state.settings.lang === 'en' ? 'Set the approval scope and tool blacklist under Tools & approvals.' : '可在「工具与审批」中设置审批范围与工具黑名单。'}</p>`,
        actions: [
          { label: '拒绝', cls: 'ghost', onClick: () => finish(false) },
          {
            label: '本次会话始终允许',
            cls: 'ghost',
            onClick: () => {
              AI.sessionApproved.add(name);
              finish(true);
            }
          },
          { label: '允许一次', cls: 'primary', onClick: () => finish(true) }
        ]
      });
    });
  };

  /* ---------------- Popover ---------------- */
  U.closePopover = function () {
    U._popAnchor = null;
    D.popover.hidden = true;
    D.popover.innerHTML = '';
  };
  U.popover = function (anchor, items) {
    U._popAnchor = anchor || null; // Record the trigger anchor.
    U._popOpenedAt = Date.now(); // The opening click is not treated as an outside click.
    const html = items
      .map((it, i) =>
        it.sep
          ? '<div class="pop-sep"></div>'
          : it.title
            ? `<div class="pop-title">${AI.esc(it.title)}</div>`
            : `<button class="pop-item ${it.checked ? 'sel' : ''}" data-pop="${i}"><span>${AI.iconHtml(it.icon, 'message')}</span><span>${AI.esc(it.label)}${it.sub ? `<small>${AI.esc(it.sub)}</small>` : ''}</span>${it.checked ? '<span class="check">✓</span>' : ''}</button>`
      )
      .join('');
    D.popover.innerHTML = html;
    D.popover.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = D.popover.offsetWidth,
      h = D.popover.offsetHeight;
    D.popover.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    D.popover.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, r.bottom + 6)) + 'px';
    D.popover.onclick = e => {
      const b = e.target.closest('[data-pop]');
      if (!b) return;
      const it = items[+b.dataset.pop];
      U.closePopover();
      if (it && it.onClick) it.onClick();
    };
  };
  document.addEventListener(
    'click',
    e => {
      const onTrigger = e.target.closest('#btnModel,#btnAssistant,#btnTheme,#btnPromptQuick,[data-pop-trigger]');
      const anchor = U._popAnchor;
      const onAnchor = anchor && (e.target === anchor || anchor.contains(e.target));
      if (Date.now() - (U._popOpenedAt || 0) < 150) return; // Ignore the click that opened the overlay.
      if (!D.popover.hidden && !e.target.closest('#popover') && !onTrigger && !onAnchor) U.closePopover();
    },
    true
  ); // Capture phase: executes before button handlers so that an overlay opened by the same event is not closed immediately.

  /* ---------------- Theme ---------------- */
  U.applyTheme = function () {
    const s = AI.state.settings;
    let mode = s.mode || 'light';
    if (mode === 'auto')
      mode = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const b = document.body,
      r = document.documentElement.style;
    b.classList.toggle('light', mode === 'light');
    b.dataset.design = AI.normalizeDesign(s.design);
    b.dataset.codeTheme = s.codeTheme || 'auto';
    b.dataset.borders = s.borders || 'normal';
    b.classList.toggle('flat', s.shadows === false);
    b.classList.toggle('no-anim', s.animations === false);
    b.classList.toggle('wrap-code', !!s.wrapCode);
    b.classList.toggle('line-numbers', !!s.lineNumbers);
    b.classList.toggle('hide-avatar', s.showAvatar === false);
    b.classList.toggle('hide-time', s.showTime === false);
    b.classList.toggle('hide-stats', s.showStats === false);
    b.classList.toggle('hide-model', s.showModelBadge === false);
    b.classList.toggle('hide-suggestions', s.showSuggestions === false);
    b.classList.toggle('hide-starters', s.showStarters === false);
    b.classList.toggle('no-bubbles', s.bubbles === false);

    r.setProperty('--fs', (s.fontSize || 14) + 'px');
    r.setProperty('--lh', String(s.lineHeight || 1.65));
    const rad = Number(s.radius || 10);
    const dKey = AI.normalizeDesign(s.design);
    const radMul = dKey === 'prism' || dKey === 'aurora' ? 1.8 : 1;
    const radBase = rad * radMul;
    // Written as an inline body style so user overrides take precedence over design-language radius defaults.
    b.style.setProperty('--radius', radBase + 'px');
    b.style.setProperty('--radius-sm', Math.max(4, radBase - 4) + 'px');
    b.style.setProperty('--radius-lg', radBase + 4 + 'px');
    r.setProperty('--gap', String(s.density || 1));
    r.setProperty('--content-w', (s.contentWidth || 860) + 'px');
    r.setProperty('--sidebar-w', (s.sidebarWidth || 268) + 'px');
    r.setProperty('--inspector-w', (s.inspectorWidth || 320) + 'px');
    const fonts = {
      system:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      readable: '"Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      mono: '"SFMono-Regular", "JetBrains Mono", Consolas, monospace',
      serif: 'Georgia, "Songti SC", "Noto Serif SC", serif'
    };
    r.setProperty(
      '--font',
      s.fontFamily === 'custom' && s.fontCustom ? s.fontCustom : fonts[s.fontFamily] || fonts.system
    );

    if (s.accentCustom && s.accent) {
      b.style.setProperty('--accent', s.accent);
      const hex = /^#([0-9a-f]{6})$/i.exec(s.accent);
      let soft = 'rgba(59,91,219,.12)';
      if (hex) {
        const n = parseInt(hex[1], 16);
        soft = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},.14)`;
      }
      b.style.setProperty('--accent-soft', soft);
      b.style.setProperty('--sel', soft);
      let accentText = '#ffffff';
      if (hex) {
        const rr = parseInt(hex[1].slice(0, 2), 16),
          gg = parseInt(hex[1].slice(2, 4), 16),
          bb = parseInt(hex[1].slice(4, 6), 16);
        if ((0.299 * rr + 0.587 * gg + 0.114 * bb) / 255 > 0.62) accentText = '#111111';
      }
      b.style.setProperty('--accent-text', accentText);
    } else {
      ['--accent', '--accent-soft', '--sel', '--accent-text'].forEach(k => b.style.removeProperty(k));
    }

    const link = document.getElementById('hljsTheme');
    if (link) {
      const lightCode = s.codeTheme === 'light' || (s.codeTheme === 'auto' && mode === 'light');
      const href = lightCode ? 'vendor/github.min.css' : 'vendor/github-dark.min.css';
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) {
      const d = AI.normalizeDesign(s.design);
      meta.content =
        mode === 'light'
          ? d === 'neon'
            ? '#f6f4ff'
            : '#f4f5fd'
          : d === 'neon'
            ? '#080a16'
            : d === 'prism'
              ? '#131314'
              : d === 'slate'
                ? '#18181b'
                : d === 'aurora'
                  ? '#0a0c19'
                  : '#171717';
    }
    if (D.brandTitle) D.brandTitle.textContent = AI.BRAND.name;
    let st = $('customCss');
    if (!st) {
      st = document.createElement('style');
      st.id = 'customCss';
      document.head.appendChild(st);
    }
    st.textContent = s.customCss || '';
    AI.emit('theme-changed');
  };
  U.setTheme = function (name) {
    const k = AI.normalizeDesign(name);
    AI.state.settings.design = k;
    if (k === 'bespoke' && !AI.state.settings.accentCustom) AI.state.settings.accentCustom = true;
    AI.save();
    U.applyTheme();
  };
  U.setMode = function (m) {
    AI.state.settings.mode = m;
    AI.save();
    U.applyTheme();
    U.renderInspector && U.renderInspector();
  };
  U.toggleLang = function () {
    AI.state.settings.lang = AI.state.settings.lang === 'zh' ? 'en' : 'zh';
    AI.applyStaticI18n();
    U.renderStarters();
    U.renderConvList();
    U.renderChatHead();
    U.renderMessages();
    U.updateLabels();
    U.renderInspector();
    AI.save();
  };
  U.updateLabels = function () {
    const p = AI.currentProvider(),
      m = AI.currentModel(),
      as = AI.currentAssistant();
    D.modelLabel.textContent = m ? m.name || m.id : AI.t('noModel');
    const dot = document.querySelector('#btnModel .chip-dot');
    if (dot) dot.classList.toggle('off', !m);
    D.assistantLabel.textContent = as ? as.name : '—';
    D.modelLabel.parentElement.title = p ? `${p.name} · ${m ? m.id : ''}` : AI.t('cfgHint');
    document.querySelectorAll('.tool-btn.toggle').forEach(b => {
      const map = { btnWebSearch: 'webSearchOn', btnMcp: 'toolsOn', btnReasoning: 'showReasoning' };
      const key = map[b.id];
      if (key) b.classList.toggle('on', !!AI.state.settings[key]);
      if (b.id === 'btnWebSearch') b.title = AI.t('webSearch');
    });
    U.updateCtxMeter();
  };
  U.updateCtxMeter = function () {
    const conv = AI.currentConv(),
      en = AI.state.settings.lang === 'en';
    /* When the previous request returned prompt_tokens, use that exact value
   instead of a character estimate. It is the server's authoritative count for
   the input actually processed in that turn. */
    let exactIn = null;
    const path = conv ? AI.pathOf(conv) : [];
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      if (n.role === 'assistant' && n.stats && n.stats.usageSource === 'api') {
        exactIn = n.stats.in;
        break;
      }
    }
    const exact = exactIn != null;
    const tk = exact ? exactIn : AI.contextTokens(conv);
    const limit = Math.max(4000, (AI.currentModel() && AI.currentModel().context) || 32000);
    const pct = Math.min(100, Math.round((tk / limit) * 100));
    D.ctxFill.style.width = pct + '%';
    D.ctxText.textContent = pct + '%';
    D.ctxWrap.classList.toggle('warn', pct > 75);
    D.ctxWrap.title = exact
      ? `${AI.t('ctx')} ${AI.fmtNum(tk)} / ${AI.fmtNum(limit)} ${AI.t('tokens')} · ` +
        (en ? 'last request, exact API count' : '上次请求 API 实际计数')
      : `${AI.t('ctx')} ≈ ${AI.fmtNum(tk)} / ${AI.fmtNum(limit)} ${AI.t('tokens')} · ` +
        (en ? 'local estimate (no usage returned)' : '本地估算（未返回 usage）');
  };

  /* ---------------- Starter prompts ---------------- */
  U.renderStarters = function () {
    const en = AI.state.settings.lang === 'en';
    D.starterPrompts.innerHTML = AI.STARTERS.map(
      (s, i) =>
        `<button data-starter="${i}"><span>${AI.esc(AI.field(s, 'title'))}</span><small>${AI.esc(AI.field(s, 'sub'))}</small></button>`
    ).join('');
    D.emptyTitle.textContent = en ? 'What can I help with?' : '有什么可以帮忙的？';
    D.emptyDesc.textContent = en
      ? 'Configure a model to get started, or pick one of the prompts below.'
      : '配置好模型后即可开始。也可以从下面的示例提示词开始。';
    D.emptyHint.innerHTML = `<kbd>Ctrl/⌘ + K</kbd> ${en ? 'Command palette' : '命令面板'}　<kbd>Ctrl + N</kbd> ${en ? 'New chat' : '新对话'}　<kbd>/</kbd> ${en ? 'Slash commands' : '斜杠命令'}<br>${en ? 'All conversations and attachments stay in this browser.' : '会话与附件仅保存在本机浏览器，不会上传。'}`;
  };

  /* ---------------- Conversation list ---------------- */
  U.renderConvList = function () {
    const q = (D.sidebarSearch.value || '').trim().toLowerCase();
    const filter = AI.state.ui.sidebarFilter || 'all';
    const folder = AI.state.ui.folder || '';
    const sort = AI.state.ui.sort || 'updated';
    // Folder filter bar
    if (D.sideFolders) {
      const folders = AI.state.folders || [];
      D.sideFolders.innerHTML =
        `<button class="folder-chip ${folder ? '' : 'active'}" data-folder="">全部</button>` +
        folders
          .map(
            f =>
              `<button class="folder-chip ${folder === f.id ? 'active' : ''}" data-folder="${AI.esc(f.id)}">${AI.esc(f.name)}</button>`
          )
          .join('');
    }
    let list = AI.state.conversations.slice();
    if (filter === 'archived') list = list.filter(c => c.archived);
    else list = list.filter(c => !c.archived);
    if (folder) list = list.filter(c => c.folder === folder);
    if (filter === 'pinned') list = list.filter(c => c.pinned);
    if (filter === 'starred') list = list.filter(c => Object.values(c.nodes).some(n => n.starred));
    if (q)
      list = list.filter(
        c =>
          (c.title || '').toLowerCase().includes(q) ||
          Object.values(c.nodes).some(n => (n.content || '').toLowerCase().includes(q))
      );
    const cmp =
      {
        updated: (a, b) => b.updatedAt - a.updatedAt,
        created: (a, b) => b.createdAt - a.createdAt,
        title: (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
        messages: (a, b) => Object.keys(b.nodes).length - Object.keys(a.nodes).length
      }[sort] || ((a, b) => b.updatedAt - a.updatedAt);
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmp(a, b));
    const groups = { today: [], yesterday: [], week: [], older: [] };
    const d0 = AI.dayKey(),
      d1 = AI.dayKey(Date.now() - 86400000),
      d7 = AI.dayKey(Date.now() - 7 * 86400000);
    list.forEach(c => {
      const k = AI.dayKey(c.updatedAt);
      groups[k === d0 ? 'today' : k === d1 ? 'yesterday' : k >= d7 ? 'week' : 'older'].push(c);
    });
    const names = { today: '今天', yesterday: '昨天', week: '近 7 天', older: '更早' };
    const namesEn = { today: 'Today', yesterday: 'Yesterday', week: 'Last 7 days', older: 'Older' };
    const en = AI.state.settings.lang === 'en';
    let html = '';
    Object.keys(groups).forEach(k => {
      if (!groups[k].length) return;
      html += `<div class="conv-group-title">${en ? namesEn[k] : names[k]}</div>`;
      html += groups[k]
        .map(c => {
          const cnt = Object.values(c.nodes).filter(n => n.role !== 'system').length;
          const tag = (AI.state.folders || []).find(f => f.id === c.folder);
          /* Default titles follow the interface language; user-defined titles are data and are not translated. */
          const zhDef = (AI.I18N && AI.I18N.zh && AI.I18N.zh.newChat) || '新对话';
          const isDef = !c.title || c.title === zhDef || c.title === 'New Chat' || c.title === 'New chat';
          const dispTitle = isDef ? (en ? 'New Chat' : zhDef) : c.title;
          return `<div class="conv-item ${c.id === AI.state.currentId ? 'active' : ''}" data-conv="${c.id}">
        <span class="conv-emoji">${c.archived ? AI.icon('archive') : c.pinned ? AI.icon('pin') : AI.icon('message')}</span>
        <div style="flex:1;min-width:0"><div class="conv-name">${AI.esc(dispTitle || AI.t('untitled'))}</div>
        <div class="conv-sub">${cnt} ${AI.t('msgCount')} · ${AI.fmtTime(c.updatedAt).slice(5)}${tag ? ' · ' + AI.esc(tag.name) : ''}</div></div>
        <div class="conv-tools">
          <button data-conv-act="pin" data-id="${c.id}" title="置顶">${AI.icon('pin')}</button>
          <button data-conv-act="folder" data-id="${c.id}" title="移动到文件夹">${AI.icon('folder')}</button>
          <button data-conv-act="archive" data-id="${c.id}" title="归档/取消归档">${AI.icon('archive')}</button>
          <button data-conv-act="rename" data-id="${c.id}" title="${AI.t('rename')}">${AI.icon('edit')}</button>
          <button data-conv-act="export" data-id="${c.id}" title="${AI.t('export')}">${AI.icon('download')}</button>
          <button data-conv-act="del" data-id="${c.id}" title="${AI.t('delete')}">${AI.icon('close')}</button>
        </div></div>`;
        })
        .join('');
    });
    if (!html)
      html = `<div style="padding:20px;text-align:center;color:var(--dim);font-size:.8em">${AI.t('noResult')}</div>`;
    D.convList.innerHTML = html;
    document
      .querySelectorAll('#sideFilters .filter')
      .forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  };
  U.renderChatHead = function () {
    const c = AI.currentConv();
    if (!c) return;
    const cnt = AI.pathOf(c).length;
    /* Default titles follow the interface language; user-defined titles are data and remain untouched. */
    const zhDefault = (AI.I18N && AI.I18N.zh && AI.I18N.zh.newChat) || '新对话';
    const isDefault = !c.title || c.title === zhDefault || c.title === 'New chat';
    D.chatTitle.textContent = isDefault ? AI.t('newChat') : c.title || AI.t('untitled');
    D.chatMeta.textContent = `${cnt} ${AI.t('msgCount')} · ${AI.esc((AI.state.assistants.find(a => a.id === c.assistantId) || {}).name || '')} · ${AI.fmtTime(c.updatedAt)}`;
    D.emptyState.hidden = cnt > 0;
    U.renderDrafts();
  };
  U.renderDrafts = function () {
    const c = AI.currentConv();
    if (!c) return;
    D.input.value = AI.state.ui.drafts[c.id] || '';
    U.autoGrow();
  };
  U.autoGrow = function () {
    const rows = Math.max(1, Math.min(8, AI.state.settings.composerRows | 0 || 1));
    const lh = parseFloat(getComputedStyle(D.input).lineHeight) || 22;
    const min = Math.max(48, Math.round(rows * lh) + 18);
    D.input.style.height = 'auto';
    D.input.style.height = Math.max(min, Math.min(220, D.input.scrollHeight)) + 'px';
  };

  /* ---------------- Message area ---------------- */
  U.renderMessages = function () {
    const c = AI.currentConv();
    if (!c) return;
    const path = AI.pathOf(c),
      q = (D.chatSearchInput.value || '').trim().toLowerCase();
    const atBottom = D.messages.scrollHeight - D.messages.scrollTop - D.messages.clientHeight < 80;
    /* No redraw during generation (multi-tab sync, title updates, search input or
   post-render i18n) may remove and recreate the row being streamed into:
   appendText would then write into a detached node and output would appear to
   stop. Detach and reuse the live row, then reinsert it in order. */
    const live = {};
    if (document.body.dataset.generating === '1')
      D.messages.querySelectorAll('.msg-row[data-streaming="1"]').forEach(r => {
        live[r.dataset.node] = r;
        r.remove();
      });
    D.messages.querySelectorAll('.msg-row').forEach(el => el.remove());
    path.forEach(n => {
      const row = live[n.id] || AI.Render.message(n, c, { streaming: false });
      if (q) row.classList.toggle('hit', (n.content || '').toLowerCase().includes(q));
      if (q && !(n.content || '').toLowerCase().includes(q)) row.classList.add('dimmed');
      D.messages.appendChild(row);
    });
    D.emptyState.hidden = path.length > 0;
    D.chatSearchCount.textContent = q
      ? `${path.filter(n => (n.content || '').toLowerCase().includes(q)).length} 条匹配`
      : '';
    U.updateCtxMeter();
    U.updateLabels();
    if (atBottom) U.scrollBottom(true);
  };
  U.setScrollBtn = function (show) {
    if (D.btnScrollBottom) D.btnScrollBottom.hidden = !show;
    document.body.classList.toggle('has-scroll-btn', !!show);
  };
  /* v3.3: detachable auto-follow.
   - scrollSticky=true keeps streaming content pinned to the bottom.
   - A user scroll-up, wheel-up or PageUp sets sticky=false; content is not
     pulled back afterwards.
   - Returning to the bottom resumes following; scroll-to-latest forces it. */
  U.scrollSticky = true;
  U._userScrolling = false;
  U.scrollBottom = function (force) {
    const el = D.messages,
      dist = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    if (force) {
      el.scrollTop = el.scrollHeight;
      U.scrollSticky = true;
      U._userScrolling = false;
      U.setScrollBtn(dist() >= 90);
      return;
    }
    if (!U.scrollSticky) {
      U.setScrollBtn(dist() >= 90);
      return;
    }
    if (AI.state.settings.autoScroll === false && dist() >= 90) {
      U.setScrollBtn(true);
      return;
    }
    el.scrollTop = el.scrollHeight;
    U.setScrollBtn(dist() >= 90);
  };
  U.rowOf = id => D.messages.querySelector(`[data-node="${id}"]`);
  U.setReply = function (text) {
    D.replyBar.hidden = !text;
    D.replyLabel.textContent = text ? '引用：' + String(text).slice(0, 90) : '';
  };

  /* ---------------- Attachments ---------------- */
  U.pending = [];
  U.renderAttachments = function () {
    D.attachmentBar.hidden = !U.pending.length;
    D.attachmentBar.innerHTML = U.pending
      .map(
        a =>
          `<span class="att-item">${a.type === 'image' && a.data ? `<img src="${AI.esc(a.data)}">` : AI.icon('paperclip')}<span>${AI.esc(a.name)}</span><button data-att-del="${a.id}">${AI.icon('close')}</button></span>`
      )
      .join('');
  };
  async function compressImage(file) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    if (file.size < 180 * 1024) return dataUrl;
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
    } catch (e) {
      return dataUrl;
    }
  }
  async function extractFile(file) {
    const name = file.name,
      ext = (name.split('.').pop() || '').toLowerCase();
    if (file.type.startsWith('image/') || /^(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(ext))
      return { type: 'image', data: await compressImage(file) };
    if (ext === 'pdf') {
      const ok = await AI.loadLib('pdfjs');
      if (!ok) return { type: 'file', text: '[PDF 解析库未能加载（离线或超时），已按二进制附件处理]' };
      try {
        let workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        try {
          const h = await fetch('vendor/pdf.worker.min.js', { method: 'HEAD' });
          if (h.ok) workerSrc = 'vendor/pdf.worker.min.js';
        } catch (e) {}
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        const buf = await file.arrayBuffer(),
          pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
          const pg = await pdf.getPage(i);
          text += (await pg.getTextContent()).items.map(x => x.str).join(' ') + '\n';
        }
        return { type: 'file', text: text.slice(0, 60000) };
      } catch (e) {
        return { type: 'file', text: '[PDF 解析失败：' + e.message + ']' };
      }
    }
    if (ext === 'docx') {
      const ok = await AI.loadLib('mammoth');
      if (!ok) return { type: 'file', text: '[DOCX 解析库未能加载（离线或超时），已按二进制附件处理]' };
      try {
        const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return { type: 'file', text: r.value.slice(0, 60000) };
      } catch (e) {
        return { type: 'file', text: '[DOCX 解析失败：' + e.message + ']' };
      }
    }
    // EPUB, PPTX and XLSX are ZIP containers; reading them as plain text only injects binary noise into the context.
    if (/^(epub|pptx|xlsx|docx|zip)$/.test(ext))
      return { type: 'file', text: '[二进制文档暂不解析，请另存为 PDF 或纯文本后上传]' };
    if (
      /^(txt|md|json|csv|js|ts|py|html|css|xml|yaml|yml|log|sh|sql|java|c|cpp|go|rs|jsx|tsx|vue)$/.test(ext) ||
      file.size < 300 * 1024
    ) {
      const text = await file.text();
      return { type: 'file', text: text.slice(0, 60000) };
    }
    return {
      type: 'file',
      text: `[文件 ${name}（${Math.round(file.size / 1024)}KB）为二进制格式，当前浏览器无法解析正文]`
    };
  }
  U.addFiles = async function (files) {
    for (const f of Array.from(files || [])) {
      if (f.size > 8 * 1024 * 1024) {
        U.toast(AI.t('fileTooLarge'), 'warn');
        continue;
      }
      try {
        const x = await extractFile(f);
        U.pending.push(Object.assign({ id: AI.uid(), name: f.name, size: f.size }, x));
      } catch (e) {
        U.toast('读取失败：' + e.message, 'err');
      }
    }
    U.renderAttachments();
    U.toast(AI.t('attached'), 'ok');
  };

  /* ---------------- Speech ---------------- */
  U.startVoice = function () {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      U.toast(AI.t('voiceUnsupported'), 'warn');
      return;
    }
    const r = new SR();
    r.lang = AI.state.settings.asrLang || 'zh-CN';
    r.interimResults = true;
    r.continuous = false;
    let base = D.input.value;
    r.onresult = e => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      D.input.value = base + txt;
      U.autoGrow();
      U.saveDraft();
    };
    r.onerror = e => U.toast('语音识别：' + e.error, 'err');
    r.start();
    $('btnVoice').classList.add('on');
    U.toast('正在聆听…');
    r.onend = () => $('btnVoice').classList.remove('on');
  };
  U.speak = function (text) {
    if (!window.speechSynthesis) {
      U.toast('浏览器不支持朗读', 'warn');
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 4000));
    u.rate = AI.state.settings.ttsRate || 1;
    u.lang = AI.state.settings.lang === 'zh' ? 'zh-CN' : 'en-US';
    speechSynthesis.speak(u);
    U.toast('开始朗读', 'ok');
  };
  U.screenshot = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      D.fileInput.click();
      return;
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const v = document.createElement('video');
      v.srcObject = stream;
      v.muted = true;
      await v.play();
      // play() does not guarantee metadata is ready; without waiting, a blank frame with videoWidth=0 is captured.
      if (!v.videoWidth)
        await new Promise((res, rej) => {
          let timer = null;
          const cleanup = () => {
            if (timer) clearTimeout(timer);
            v.onloadedmetadata = null;
            v.onerror = null;
          };
          const done = () => {
            cleanup();
            res();
          };
          timer = setTimeout(done, 1500); // Fallback timeout
          v.onloadedmetadata = done;
          v.onerror = () => {
            cleanup();
            rej(new Error('无法读取屏幕流元数据'));
          };
        });
      const w = v.videoWidth || 1280,
        h = v.videoHeight || 720;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(v, 0, 0, w, h);
      U.pending.push({
        id: AI.uid(),
        name: 'screen-' + Date.now() + '.png',
        type: 'image',
        size: 0,
        data: cv.toDataURL('image/png')
      });
      U.renderAttachments();
      U.toast('已捕获屏幕截图', 'ok');
    } catch (e) {
      U.toast('截图失败：' + ((e && e.message) || e), 'err');
      D.fileInput.click();
    } finally {
      if (stream)
        stream.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (_) {}
        });
    }
  };

  /* ---------------- Artifact preview (sandboxed iframe) ---------------- */
  U.openArtifact = function (code, lang) {
    const l = (lang || '').toLowerCase();
    let src;
    if (/^html?$/.test(l) || /^\s*<!doctype|^\s*<html/i.test(code)) src = code;
    else if (l === 'svg' || /^\s*<svg/.test(code))
      src = `<body style="display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body>`;
    else if (l === 'mermaid')
      src = `<body style="font-family:sans-serif;padding:20px;background:#fff"><pre>${AI.esc(code)}</pre><p style="color:#888">Mermaid 源码（已在消息中渲染）</p></body>`;
    else
      src = `<body style="margin:0;background:#0d1117;color:#e6edf3"><pre style="padding:16px;font:12px/1.6 monospace;white-space:pre-wrap">${AI.esc(code)}</pre></body>`;
    U.modal({
      title: '预览 · ' + (lang || 'text'),
      wide: true,
      body: '<iframe id="artifactIframe" class="artifact-frame" sandbox="allow-scripts" title="Artifact 预览"></iframe>',
      actions: [
        {
          label: '复制源码',
          cls: 'ghost',
          onClick: () => {
            AI.copy(code);
            return false;
          }
        },
        {
          label: '下载',
          cls: 'ghost',
          onClick: () => {
            download('artifact-' + Date.now() + '.txt', code);
            return false;
          }
        },
        { label: '关闭', cls: 'primary' }
      ],
      onOpen: root => {
        const f = root.querySelector('#artifactIframe');
        if (f) f.srcdoc = src;
      }
    });
  };
  AI.on('artifact', d => U.openArtifact(d.code, d.lang));
  AI.on('image-preview', d =>
    U.modal({ title: '图片预览', body: `<img src="${AI.esc(d.src)}" style="max-width:100%;border-radius:8px">` })
  );

  /* ---------------- Drawer and settings ---------------- */
  U.TABS = [
    ['general', '通用'],
    ['providers', '供应商'],
    ['models', '模型参数'],
    ['assistants', '助手'],
    ['prompts', '提示词'],
    ['memory', '记忆'],
    ['search', '联网搜索'],
    ['mcp', 'MCP'],
    ['image', '图像生成'],
    ['stats', '统计'],
    ['backup', '备份'],
    ['help', '帮助']
  ];
  /* Grouped navigation: 20 settings pages are shown one group at a time to avoid long horizontal scrolling. */
  AI.DRAWER_GROUPS = [
    { id: 'basic', label: '常用', en: 'General', keys: ['general', 'providers', 'models', 'assistants'] },
    { id: 'content', label: '提示与记忆', en: 'Prompts', keys: ['prompts', 'memory', 'context', 'lorebook'] },
    {
      id: 'capability',
      label: '模型与工具',
      en: 'Models & tools',
      keys: ['modelslib', 'search', 'mcp', 'tools', 'image']
    },
    { id: 'data', label: '数据', en: 'Data', keys: ['stats', 'logs', 'backup', 'privacy'] },
    { id: 'ui', label: '外观与效率', en: 'Appearance', keys: ['layout', 'shortcuts', 'help'] }
  ];
  U.drawerTab = 'general';
  U.drawerGroup = 'basic';
  U.editing = null;
  U.openDrawer = function (tab) {
    // Only registered tabs are accepted; invalid values fall back to general settings rather than rendering an empty page.
    const t = tab || U.drawerTab || 'general';
    const g = (AI.DRAWER_GROUPS || []).find(x => x.keys.includes(t));
    U.drawerTab = g ? t : 'general';
    if (g) U.drawerGroup = g.id;
    else U.drawerGroup = 'basic';
    U.editing = null;
    D.drawerRoot.hidden = false;
    U.renderDrawer();
  };
  U.closeDrawer = function () {
    D.drawerRoot.hidden = true;
  };
  U.renderDrawer = function () {
    const en = AI.state.settings.lang === 'en';
    D.drawerTitle.textContent = en ? 'Settings' : '设置';
    const namesEn = {
      general: 'General',
      providers: 'Providers',
      models: 'Parameters',
      assistants: 'Assistants',
      prompts: 'Prompts',
      memory: 'Memory',
      search: 'Search',
      mcp: 'MCP',
      image: 'Image',
      stats: 'Stats',
      backup: 'Data',
      help: 'Help',
      modelslib: 'Model library',
      context: 'Context',
      lorebook: 'Lorebook',
      tools: 'Tools & approval',
      layout: 'Appearance',
      shortcuts: 'Shortcuts',
      logs: 'Request log',
      privacy: 'Privacy'
    };
    const groups = AI.DRAWER_GROUPS || [];
    let g = groups.find(x => x.id === U.drawerGroup);
    if (!g) {
      g = groups.find(x => x.keys.includes(U.drawerTab)) || groups[0];
      U.drawerGroup = g ? g.id : '';
    }
    const visible = g ? U.TABS.filter(([k]) => g.keys.includes(k)) : U.TABS;
    const groupBar = groups.length
      ? `<div class="drawer-groups">` +
        groups
          .map(
            x =>
              `<button data-group="${x.id}" class="${x.id === U.drawerGroup ? 'active' : ''}">${en ? x.en : x.label}</button>`
          )
          .join('') +
        `</div>`
      : '';
    D.drawerTabs.innerHTML =
      groupBar +
      visible
        .map(
          ([k, n]) =>
            `<button data-tab="${k}" class="${k === U.drawerTab ? 'active' : ''}">${AI.esc(en ? namesEn[k] || n : n)}</button>`
        )
        .join('');
    D.drawerBody.innerHTML = (U['tab_' + U.drawerTab] || U.tab_general)();
    U.updateCtxMeter();
  };
  /* Inspector (right-hand runtime parameter panel) */
  U.setInspector = function (open) {
    const isOpen = open === undefined ? D.inspector.hidden : !!open;
    D.inspector.hidden = !isOpen;
    D.btnInspector.classList.toggle('active', isOpen);
    AI.state.ui.inspectorOpen = isOpen;
    AI.save();
    if (isOpen) {
      U.renderInspector();
      D.sidebar.classList.remove('open');
      D.sidebarOverlay.classList.remove('show');
    }
  };
  U.renderInspector = function () {
    if (!D.inspectorBody || D.inspector.hidden) return;
    const tabs = AI.INSPECTOR_TABS || [['run', '运行']];
    const cur = AI.state.settings.inspectorTab || 'run';
    D.inspectorTabs.innerHTML = tabs
      .map(([k, n]) => `<button data-insp-tab="${k}" class="${k === cur ? 'active' : ''}">${AI.esc(n)}</button>`)
      .join('');
    const fn = U['inspectorTab_' + cur] || U.inspectorTab_run;
    D.inspectorBody.innerHTML = fn ? fn() : '<div class="tiny">参数面板加载中…</div>';
    AI.emit('inspector-rendered', D.inspectorBody);
  };
  /* ---- Form helpers ---- */
  const bv = path => {
    if (path.startsWith('arr:')) {
      const [, coll, id, ...rest] = path.split(':');
      const it = AI.state[coll].find(x => x.id === id);
      return rest.reduce((o, k) => o && o[k], it);
    }
    return path.split('.').reduce((o, k) => o && o[k], AI.state);
  };
  U.setBound = function (path, val, type) {
    let v = val;
    if (type === 'number') v = Number(val) || 0;
    if (type === 'float') v = parseFloat(val);
    if (type === 'bool') v = val === true || val === 'true' || val === 'on';
    if (type === 'json') {
      try {
        v = JSON.parse(val || '{}');
      } catch (e) {
        U.toast('JSON 格式错误：' + e.message, 'err');
        return false;
      }
    }
    if (path.startsWith('arr:')) {
      const [, coll, id, ...rest] = path.split(':');
      const it = AI.state[coll].find(x => x.id === id);
      if (!it) return false;
      let o = it;
      for (let i = 0; i < rest.length - 1; i++) o = o[rest[i]] || (o[rest[i]] = {});
      o[rest[rest.length - 1]] = v;
    } else {
      const parts = path.split('.');
      let o = AI.state;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] || (o[parts[i]] = {});
      o[parts[parts.length - 1]] = v;
    }
    AI.save();
    return true;
  };
  U.toggleBound = function (path) {
    const v = !bv(path);
    U.setBound(path, v, 'bool');
    U.renderDrawer();
  };
  const F = {
    current: path => bv(path),
    combo: (label, path, opts, opt) => {
      opt = opt || {};
      const id = 'dl-' + String(path).replace(/[^a-zA-Z0-9_-]/g, '_');
      const v = bv(path) == null ? '' : bv(path);
      return `<div class="form-row"><label>${AI.esc(label)}</label><input class="input combo-input" data-bind="${path}" data-type="text" list="${id}" value="${AI.esc(v)}" placeholder="${AI.esc(opt.ph || '可直接输入自定义值')}" autocomplete="off"><datalist id="${id}">${opts.map(o => `<option value="${AI.esc(o[0])}">${AI.esc(o[1] || '')}</option>`).join('')}</datalist>${opt.hint ? `<span class="hint">${AI.esc(opt.hint)}</span>` : ''}</div>`;
    },
    input: (label, path, opt) =>
      `<div class="form-row"><label>${AI.esc(label)}</label><input class="input" data-bind="${path}" data-type="${opt.type || 'text'}" value="${AI.esc(bv(path) == null ? (opt.def != null ? opt.def : '') : bv(path))}" placeholder="${AI.esc(opt.ph || '')}" ${opt.attr || ''}>${opt.hint ? `<span class="hint">${opt.hint}</span>` : ''}</div>`,
    area: (label, path, opt) =>
      `<div class="form-row"><label>${AI.esc(label)}</label><textarea class="textarea" data-bind="${path}" data-type="${opt.type || 'text'}" rows="${opt.rows || 4}" placeholder="${AI.esc(opt.ph || '')}">${AI.esc(bv(path) == null ? '' : opt.type === 'json' ? JSON.stringify(bv(path), null, 2) : bv(path))}</textarea>${opt.hint ? `<span class="hint">${opt.hint}</span>` : ''}</div>`,
    select: (label, path, opts) =>
      `<div class="form-row"><label>${AI.esc(label)}</label><select class="select" data-bind="${path}">${opts.map(o => `<option value="${AI.esc(o[0])}" ${String(bv(path)) === String(o[0]) ? 'selected' : ''}>${AI.esc(o[1])}</option>`).join('')}</select></div>`,
    toggle: (label, path, desc) =>
      `<div class="switch-row"><div>${AI.esc(label)}${desc ? `<small>${AI.esc(desc)}</small>` : ''}</div><button class="switch ${bv(path) ? 'on' : ''}" data-toggle="${path}" aria-label="toggle"></button></div>`,
    section: t => `<div class="section-title">${AI.esc(t)}</div>`,
    title: (t, sub) => `<div class="card-head"><b>${AI.esc(t)}</b><span class="tag">${AI.esc(sub || '')}</span></div>`
  };
  U.F = F;

  /* ---- Settings tabs ---- */
  /* [v3.3 cleanup] The general tab is superseded by 07-extras.js / 09-plus.js; the dead implementation was removed. */

  U.tab_providers = function () {
    const ps = AI.state.providers;
    let h =
      F.section('快速添加预设') +
      '<div class="form-actions">' +
      AI.PRESETS.map(
        (p, i) => `<button class="mini-btn" data-do="preset" data-v="${i}">＋ ${AI.esc(p.name)}</button>`
      ).join('') +
      '</div>';
    h += F.section('已配置的供应商');
    if (!ps.length)
      h += `<div class="card"><p style="color:var(--muted);font-size:12px;margin:0">还没有供应商。点击上方预设一键添加，再填写 API Key。所有配置仅保存在本机 localStorage。</p></div>`;
    ps.forEach(p => {
      const edit = U.editing === 'p:' + p.id;
      h += `<div class="card"><div class="card-head"><b>${AI.esc(p.name)} <span class="tag">${AI.esc(p.type)}</span></b>
      <div><button class="mini-btn" data-do="p-balance" data-v="${p.id}">查询余额</button> <button class="mini-btn" data-do="p-test" data-v="${p.id}">测试</button> <button class="mini-btn" data-do="p-fetch" data-v="${p.id}">拉取模型</button> <button class="mini-btn" data-do="p-refresh-meta" data-v="${p.id}">刷新模型信息</button> <button class="mini-btn" data-do="p-edit" data-v="${p.id}">${edit ? '收起' : '编辑'}</button> <button class="mini-btn del" data-do="p-del" data-v="${p.id}">删除</button></div></div>`;
      if (!edit) {
        h += `<div class="tiny" style="word-break:break-all">${AI.esc(p.baseUrl)} · ${(p.models || []).length} 个模型 · ${p.apiKey ? 'Key 已配置' : '未配置 Key'}</div>`;
      } else {
        const q = k => `arr:providers:${p.id}:${k}`;
        if (p.modelsRaw === undefined)
          p.modelsRaw = (p.models || []).map(m => (typeof m === 'string' ? m : m.id || '')).join('\n');
        h +=
          `<div class="form-grid">${F.input('名称', q('name'), {})}${F.select('协议', q('type'), [
            ['openai', 'Chat Completions 兼容'],
            ['anthropic', 'Anthropic 消息协议'],
            ['gemini', 'Gemini 生成接口']
          ])}</div>` +
          F.input('API Base URL', q('baseUrl'), { ph: 'https://api.openai.com/v1' }) +
          F.input('API Key', q('apiKey'), {
            type: 'text',
            ph: 'sk-...',
            hint: '仅保存在本机；本地 Ollama / LM Studio 可留空'
          }) +
          F.input('请求路径（高级，可留空）', q('path'), { ph: '/chat/completions' }) +
          `<div class="form-grid">` +
          F.combo(
            '模型列表地址（可选）',
            q('modelsEndpoint'),
            [
              ['/models', '/models（OpenAI 兼容）'],
              ['/api/v1/models', 'OpenRouter'],
              ['/v1beta/models?pageSize=200', 'Gemini'],
              ['/api/tags', 'Ollama']
            ],
            { ph: '留空按协议自动拼接', hint: '可填完整 URL 或相对 Base URL 的路径' }
          ) +
          F.input('模型详情模板（可选）', q('modelDetailEndpoint'), { ph: '/models/{id}，{id} 会替换为模型 ID' }) +
          `</div>` +
          `<div class="tiny" style="line-height:1.7;margin:-2px 0 8px">不同网关返回的字段不同：OpenRouter / 多数中转会在列表里直接给出 context_length、max_completion_tokens、pricing 与模态；OpenAI 官方 /models 只给 id，可填详情模板逐个探测，或点「刷新模型信息」。已手动填写的值（来源标记为 manual）不会被覆盖。</div>` +
          F.area('模型列表（每行一个；可用 JSON 数组对象设置 per-model 参数）', q('modelsRaw'), {
            rows: 3,
            ph: 'gpt-4o-mini\ngpt-4o'
          }) +
          F.area('自定义请求头 JSON', q('headers'), { type: 'json', rows: 2 }) +
          F.area('自定义请求体 JSON（深度合并）', q('body'), {
            type: 'json',
            rows: 2,
            hint: '例如 {"max_completion_tokens": 16000}'
          }) +
          F.section('余额查询（可选）') +
          `<div class="form-grid">${F.combo(
            '余额查询地址',
            q('balanceUrl'),
            [
              ['/dashboard/billing/credit_grants', 'OpenAI 兼容 credit_grants'],
              ['/v1/account/balance', '/v1/account/balance'],
              ['/api/balance', '/api/balance']
            ],
            { ph: '完整 URL 或相对 Base URL 的路径' }
          )}${F.combo(
            '请求方法',
            q('balanceMethod'),
            [
              ['GET', 'GET'],
              ['POST', 'POST']
            ],
            { ph: 'GET / POST' }
          )}</div>` +
          `<div class="form-grid">${F.input('取值路径（JSON）', q('balancePath'), { ph: 'data.total_available / balance[0].amount，留空自动查找' })}${F.input('余额单位', q('balanceCurrency'), { ph: 'USD / CNY / 点数' })}</div>` +
          F.area('自定义请求头（余额接口，JSON）', q('balanceHeaders'), { type: 'json', rows: 2 }) +
          F.area('请求体（POST 时，JSON 字符串）', q('balanceBody'), { rows: 2 }) +
          `<div class="tiny" style="line-height:1.7;margin:2px 0 8px">填写完整 URL 或相对 Base URL 的路径。响应中可直接取数字，或用 JSON 路径取值；留空路径时自动查找常见余额字段。需服务端允许 CORS。</div>` +
          F.toggle('启用', q('enabled'), '关闭后不出现在模型选择器') +
          `<div class="form-actions"><button class="btn primary" data-do="p-save" data-v="${p.id}">${AI.t('save')}</button></div>`;
      }
      h += '</div>';
    });
    h += `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim);line-height:1.7">浏览器直连第三方 API 需对方允许 CORS。Anthropic 使用 anthropic-dangerous-direct-browser-access 头；Gemini 用 URL 中的 key；Ollama 需设置 OLLAMA_ORIGINS=*；LM Studio 需开启 CORS。若被浏览器拦截，请改用支持 CORS 的中转或兼容端点。</span></div>`;
    return h;
  };
  /* [v3.3 cleanup] The models tab is superseded by 07-extras.js / 09-plus.js; the dead implementation was removed. */
  U.tab_assistants = function () {
    const list = AI.state.assistants;
    let h =
      F.section('自定义助手 / 智能体') +
      `<div class="form-actions"><button class="mini-btn" data-do="a-add">＋ 新建助手</button></div>`;
    list.forEach(a => {
      if (a.quickRaw === undefined) a.quickRaw = (a.quickReplies || []).join(', ');
      if (a.injectRaw === undefined) a.injectRaw = (a.promptInjections || []).map(x => x.content || x).join('\n');
      const edit = U.editing === 'a:' + a.id,
        q = k => `arr:assistants:${a.id}:${k}`;
      h += `<div class="card"><div class="card-head"><b>${AI.iconHtml(a.emoji, 'sparkle')} ${AI.esc(a.name)} ${a.id === AI.state.activeAssistantId ? '<span class="tag">当前</span>' : ''}</b>
      <div>${a.id !== 'default' ? `<button class="mini-btn" data-do="a-use" data-v="${a.id}">使用</button> <button class="mini-btn del" data-do="a-del" data-v="${a.id}">删除</button>` : ''} <button class="mini-btn" data-do="a-edit" data-v="${a.id}">${edit ? '收起' : '编辑'}</button></div></div>`;
      if (edit) {
        h +=
          `<div class="form-grid three">${F.input('名称', q('name'), {})}${F.input('图标/Emoji', q('emoji'), {})}${F.input('快捷回复（逗号分隔）', q('quickRaw'), { ph: '继续,换个说法,给例子' })}</div>` +
          F.area('系统提示词（支持 {{model}} {{date}} {{time}} {{locale}} {{device}} 等变量）', q('systemPrompt'), {
            rows: 5
          }) +
          F.area('提示词注入（每行一条，追加到系统提示）', q('injectRaw'), { rows: 2 }) +
          F.toggle('启用记忆', q('memory'), '') +
          `<div class="form-actions"><button class="btn primary" data-do="a-save" data-v="${a.id}">${AI.t('save')}</button></div>`;
      } else
        h += `<div class="tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${AI.esc(a.systemPrompt || '')}</div>`;
      h += '</div>';
    });
    h += `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim)">助手可独立配置系统提示、人格、快捷回复与提示词注入；会话创建时绑定当前助手，切换助手不影响已有会话。</span></div>`;
    return h;
  };
  U.tab_prompts = function () {
    let h =
      F.section('提示词模板库') +
      `<div class="form-actions"><button class="mini-btn" data-do="pr-add">＋ 新建模板</button></div>` +
      `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim);line-height:1.7">可用变量：{{model}} {{provider}} {{assistant}} {{date}} {{time}} {{datetime}} {{locale}} {{timezone}} {{device}} {{lang}} {{selection}} {{role}}；{{selection}} 会替换为选中的文字或输入框内容。</span></div>`;
    AI.state.prompts.forEach(p => {
      const edit = U.editing === 'pr:' + p.id,
        q = k => `arr:prompts:${p.id}:${k}`;
      h += `<div class="card"><div class="card-head"><b>${AI.esc(AI.field(p, 'name'))} <span class="tag">${AI.esc(AI.field(p, 'cat'))}</span></b><div><button class="mini-btn" data-do="pr-use" data-v="${p.id}">插入</button> <button class="mini-btn" data-do="pr-edit" data-v="${p.id}">${edit ? '收起' : '编辑'}</button> <button class="mini-btn del" data-do="pr-del" data-v="${p.id}">删除</button></div></div>`;
      if (edit)
        h +=
          `<div class="form-grid">${F.input('名称', q('name'), {})}${F.input('分类', q('cat'), {})}</div>` +
          F.area('模板内容', q('content'), { rows: 5 }) +
          `<div class="form-actions"><button class="btn primary" data-do="pr-save" data-v="${p.id}">${AI.t('save')}</button></div>`;
      else
        h += `<div class="tiny" style="white-space:pre-wrap;max-height:60px;overflow:hidden">${AI.esc(AI.field(p, 'content').slice(0, 180))}</div>`;
      h += '</div>';
    });
    return h;
  };
  U.tab_memory = function () {
    let h =
      F.section('文件式长期记忆') +
      `<div class="card"><div class="form-row"><label>新增一条记忆</label><textarea class="textarea" id="newMemory" rows="2" placeholder="例如：我喜欢用简体中文回答，代码要带注释"></textarea></div>
    <div class="form-actions"><button class="btn primary" data-do="mem-add">＋ 记住</button><button class="mini-btn" data-do="mem-auto">从当前对话提取</button></div></div>`;
    if (!AI.state.memories.length) h += '<div class="tiny">记忆库为空</div>';
    AI.state.memories.forEach(
      m =>
        (h += `<div class="list-row"><span class="grow">${AI.esc(m.text)}<small>${AI.esc(m.scope)} · ${AI.fmtTime(m.createdAt)}</small></span><button class="mini-btn del" data-do="mem-del" data-v="${m.id}">删除</button></div>`)
    );
    h += `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim)">记忆会作为系统提示注入每条请求；工具 write_memory / read_memory 允许模型主动读写（需开启工具模式）。</span></div>`;
    return h;
  };
  /* [v3.3 cleanup] The search tab is superseded by 07-extras.js / 09-plus.js; the dead implementation was removed. */
  U.tab_mcp = function () {
    let h =
      F.section('MCP 服务器（Streamable HTTP）') +
      `<div class="form-actions"><button class="mini-btn" data-do="mcp-add">＋ 添加服务器</button></div>`;
    AI.state.mcpServers.forEach(s => {
      const edit = U.editing === 'mcp:' + s.id,
        q = k => `arr:mcpServers:${s.id}:${k}`;
      h += `<div class="card"><div class="card-head"><b>${AI.esc(s.name)} <span class="tag">${s.enabled === false ? '已禁用' : '启用'}</span></b><div><button class="mini-btn" data-do="mcp-test" data-v="${s.id}">连接 / 列工具</button> <button class="mini-btn" data-do="mcp-edit" data-v="${s.id}">${edit ? '收起' : '编辑'}</button> <button class="mini-btn del" data-do="mcp-del" data-v="${s.id}">删除</button></div></div>`;
      if (edit)
        h +=
          `<div class="form-grid">${F.input('名称', q('name'), {})}${F.input('端点 URL', q('url'), { ph: 'http://localhost:3000/mcp' })}</div>` +
          F.area('自定义请求头 JSON', q('headers'), { type: 'json', rows: 2 }) +
          F.toggle('启用', q('enabled'), '') +
          `<div class="form-actions"><button class="btn primary" data-do="mcp-save" data-v="${s.id}">${AI.t('save')}</button></div>`;
      else h += `<div class="tiny" style="word-break:break-all">${AI.esc(s.url)}</div>`;
      const cache = AI.mcpCache[s.id];
      if (cache && cache.tools)
        h += `<div class="tiny" style="margin-top:6px">已发现 ${cache.tools.length} 个工具：${AI.esc(
          cache.tools
            .slice(0, 8)
            .map(t => t.rawName)
            .join(', ')
        )}</div>`;
      h += '</div>';
    });
    h += `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim);line-height:1.7">实现 initialize → notifications/initialized → tools/list → tools/call（JSON-RPC 2.0），支持 Mcp-Session-Id 与 SSE 响应。浏览器直连需服务端允许 CORS 并暴露相应头。</span></div>`;
    return h;
  };
  U.tab_image = function () {
    const g = AI.state.imageGen;
    return (
      F.section('文生图') +
      F.select('接口类型', 'imageGen.provider', [
        ['openai', '兼容 /images/generations'],
        ['gemini', 'Imagen predict 接口'],
        ['custom', '自定义兼容端点']
      ]) +
      `<div class="form-grid">${F.input('Base URL', 'imageGen.baseUrl', { ph: 'https://api.openai.com/v1' })}${F.input('API Key', 'imageGen.apiKey', { ph: '可留空则复用当前供应商' })}</div>` +
      `<div class="form-grid">${F.input('模型', 'imageGen.model', { ph: 'gpt-image-1 / dall-e-3 / imagen-3.0' })}${F.combo(
        '尺寸',
        'imageGen.size',
        [
          ['1024x1024', '1024×1024'],
          ['1024x1536', '1024×1536'],
          ['1536x1024', '1536×1024'],
          ['512x512', '512×512'],
          ['1792x1024', '1792×1024'],
          ['1024x1792', '1024×1792']
        ],
        { ph: '预设或任意 WxH', hint: '不同模型支持的尺寸不同，可直接输入自定义值' }
      )}</div>` +
      `<div class="form-actions"><button class="btn primary" data-do="image-test">生成测试图</button></div>` +
      `<div class="card"><span class="hint" style="font-size:11px;color:var(--dim)">也可在输入框点「生图」，或让模型通过 generate_image 工具调用。同样受 CORS 限制。</span></div>`
    );
  };
  U.tab_stats = function () {
    const logs = AI.state.logs,
      keys = Object.keys(logs).sort();
    let ti = 0,
      to = 0,
      rq = 0,
      models = {};
    keys.forEach(k => {
      const l = logs[k];
      ti += l.in || 0;
      to += l.out || 0;
      rq += l.requests || 0;
      Object.entries(l.models || {}).forEach(([m, n]) => (models[m] = (models[m] || 0) + n));
    });
    const cells = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 83 - today.getDay());
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = AI.dayKey(d.getTime()),
        l = logs[k],
        n = l ? (l.in || 0) + (l.out || 0) : 0;
      const lv = n === 0 ? 0 : n < 2000 ? 1 : n < 8000 ? 2 : n < 30000 ? 3 : 4;
      const colors = [
        'var(--surface-2)',
        'color-mix(in srgb,var(--accent) 25%,var(--surface-2))',
        'color-mix(in srgb,var(--accent) 50%,var(--surface-2))',
        'color-mix(in srgb,var(--accent) 75%,var(--surface-2))',
        'var(--accent)'
      ];
      cells.push(`<div class="heat-cell" title="${k}: ${AI.fmtNum(n)} tokens" style="background:${colors[lv]}"></div>`);
    }
    return (
      F.section('使用概览') +
      `<div class="stat-grid"><div class="stat-box"><b>${AI.fmtNum(rq)}</b><span>请求次数</span></div><div class="stat-box"><b>${AI.fmtNum(ti)}</b><span>输入 tokens</span></div><div class="stat-box"><b>${AI.fmtNum(to)}</b><span>输出 tokens</span></div></div>` +
      F.section('每日活动（近 12 周）') +
      `<div class="heatmap">${cells.join('')}</div>` +
      F.section('模型使用分布') +
      (Object.keys(models).length
        ? Object.entries(models)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([m, n]) => `<div class="list-row"><span class="grow">${AI.esc(m)}<small>${n} 次请求</small></span></div>`
            )
            .join('')
        : '<div class="tiny">暂无数据</div>') +
      F.section('会话') +
      `<div class="tiny">共 ${AI.state.conversations.length} 个会话 · ${AI.state.conversations.reduce((a, c) => a + Object.keys(c.nodes).length - 1, 0)} 条消息 · ${AI.state.memories.length} 条记忆</div>`
    );
  };
  /* [v3.3 cleanup] The backup tab is superseded by 07-extras.js / 09-plus.js; the dead implementation was removed. */
  /* [v3.3 cleanup] The help tab is superseded by 07-extras.js / 09-plus.js; the dead implementation was removed. */

  /* ---------------- Drawer action dispatch ---------------- */
  U.drawerAction = function (name, ds, el) {
    const v = ds.v,
      S = AI.state;
    const find = (coll, id) => S[coll].find(x => x.id === id);
    switch (name) {
      case 'theme':
        U.setTheme(v);
        U.renderDrawer();
        return;
      case 'preset': {
        const p = AI.clone(AI.PRESETS[+v]);
        p.id = AI.uid();
        p.apiKey = '';
        p.enabled = true;
        p.headers = {};
        p.body = {};
        p.models = p.models.map(m => (typeof m === 'string' ? { id: m, name: m } : AI.clone(m)));
        S.providers.push(p);
        AI.save(true);
        U.editing = 'p:' + p.id;
        U.renderDrawer();
        U.toast('已添加，请填写 API Key', 'ok');
        return;
      }
      case 'p-edit':
        U.editing = U.editing === 'p:' + v ? null : 'p:' + v;
        U.renderDrawer();
        return;
      case 'p-save': {
        const p = find('providers', v);
        if (p && p.modelsRaw !== undefined) {
          const old = {};
          (p.models || []).forEach(m => {
            if (typeof m === 'object') old[m.id] = m;
          });
          let parsed = null;
          if (p.modelsRaw.trim().startsWith('[')) parsed = AI.clone(AI.safeJson(p.modelsRaw, null));
          const ids = Array.isArray(parsed)
            ? parsed
            : p.modelsRaw
                .split('\n')
                .map(x => x.trim())
                .filter(Boolean);
          p.models = ids.map(x => (typeof x === 'string' ? Object.assign({ id: x, name: x }, old[x] || {}) : x));
          delete p.modelsRaw;
        }
        U.editing = null;
        AI.save(true);
        U.renderDrawer();
        U.updateLabels();
        U.toast(AI.t('saved'), 'ok');
        return;
      }
      case 'p-del':
        U.confirm('删除供应商', '将同时移除其所有模型配置，确定？', () => {
          S.providers = S.providers.filter(x => x.id !== v);
          AI.save(true);
          U.renderDrawer();
          U.updateLabels();
        });
        return;
      case 'p-test': {
        const p = find('providers', v);
        if (!p) return;
        U.modal({ title: '连接测试', body: '<p>正在请求 /models 或 chat completions…</p>' });
        AI.fetchModels(p)
          .then(list =>
            U.modal({
              title: '连接成功',
              body: `<p>发现 ${list.length} 个模型</p><div class="tiny" style="max-height:220px;overflow:auto">${AI.esc(list.slice(0, 40).join('\n'))}</div>`
            })
          )
          .catch(e =>
            U.modal({
              title: '连接失败',
              body: `<p>${AI.esc(e.message)}</p><p class="tiny">请检查 Base URL、Key 与 CORS 设置。</p>`
            })
          );
        return;
      }
      case 'p-fetch': {
        const p = find('providers', v);
        if (!p) return;
        U.toast('正在拉取模型列表…');
        AI.fetchModels(p)
          .then(list => {
            const old = {};
            (p.models || []).forEach(m => (old[m.id || m] = typeof m === 'object' ? m : { id: m, name: m }));
            p.models = list.slice(0, 200).map(id => Object.assign({ id, name: id }, old[id] || {}));
            AI.save(true);
            U.renderDrawer();
            U.updateLabels();
            U.toast(`已获取 ${p.models.length} 个模型`, 'ok');
          })
          .catch(e => U.toast('拉取失败：' + e.message, 'err'));
        return;
      }
      case 'm-edit':
        U.editing = U.editing === 'm:' + v ? null : 'm:' + v;
        U.renderDrawer();
        return;
      case 'm-flag': {
        const [pid, mid] = v.split('|'),
          p = find('providers', pid),
          m = p && p.models.find(x => (x.id || x) === mid);
        if (m && typeof m === 'object') {
          m[ds.f] = !m[ds.f];
          AI.save();
          U.renderDrawer();
        }
        return;
      }
      case 'm-save': {
        const [pid, mid] = v.split('|'),
          p = find('providers', pid),
          m = p && p.models.find(x => (x.id || x) === mid);
        if (!m || typeof m !== 'object') return;
        D.drawerBody.querySelectorAll(`[data-model-field][data-m="${CSS.escape(mid)}"]`).forEach(inp => {
          const k = inp.dataset.modelField;
          let val = inp.value.trim();
          if (k === 'headers' || k === 'body') {
            try {
              val = JSON.parse(val || '{}');
            } catch (e) {
              U.toast(k + ' JSON 错误', 'err');
              return;
            }
          } else if (k === 'temperature' || k === 'maxTokens' || k === 'context') val = val === '' ? null : Number(val);
          m[k] = val;
        });
        AI.save(true);
        U.editing = null;
        U.renderDrawer();
        U.toast(AI.t('saved'), 'ok');
        return;
      }
      case 'a-add': {
        const a = {
          id: AI.uid(),
          name: '新助手',
          emoji: '',
          systemPrompt: AI.DEFAULT_SYSTEM_PROMPT,
          memory: true,
          quickReplies: [],
          promptInjections: []
        };
        S.assistants.push(a);
        S.activeAssistantId = a.id;
        AI.save(true);
        U.editing = 'a:' + a.id;
        U.renderDrawer();
        U.updateLabels();
        return;
      }
      case 'a-edit':
        U.editing = U.editing === 'a:' + v ? null : 'a:' + v;
        U.renderDrawer();
        return;
      case 'a-save': {
        const a = find('assistants', v);
        if (a.quickRaw != null) {
          a.quickReplies = a.quickRaw
            .split(/[,，]/)
            .map(x => x.trim())
            .filter(Boolean);
          delete a.quickRaw;
        }
        if (a.injectRaw != null) {
          a.promptInjections = a.injectRaw
            .split('\n')
            .map(x => ({ content: x.trim() }))
            .filter(x => x.content);
          delete a.injectRaw;
        }
        AI.save(true);
        U.editing = null;
        U.renderDrawer();
        U.renderMessages();
        U.toast(AI.t('saved'), 'ok');
        return;
      }
      case 'a-use':
        S.activeAssistantId = v;
        AI.save();
        U.renderDrawer();
        U.updateLabels();
        return;
      case 'a-del':
        U.confirm('删除助手', '确定删除？', () => {
          S.assistants = S.assistants.filter(x => x.id !== v || x.id === 'default');
          S.activeAssistantId = 'default';
          AI.save(true);
          U.renderDrawer();
          U.updateLabels();
        });
        return;
      case 'pr-add': {
        const p = { id: AI.uid(), name: '新模板', cat: '自定义', content: '{{selection}}' };
        S.prompts.push(p);
        AI.save(true);
        U.editing = 'pr:' + p.id;
        U.renderDrawer();
        return;
      }
      case 'pr-edit':
        U.editing = U.editing === 'pr:' + v ? null : 'pr:' + v;
        U.renderDrawer();
        return;
      case 'pr-save':
        U.editing = null;
        AI.save(true);
        U.renderDrawer();
        U.toast(AI.t('saved'), 'ok');
        return;
      case 'pr-del':
        S.prompts = S.prompts.filter(x => x.id !== v);
        AI.save(true);
        U.renderDrawer();
        return;
      case 'pr-use': {
        const p = find('prompts', v);
        if (p) {
          U.closeDrawer();
          U.insertPrompt(p.content);
        }
        return;
      }
      case 'mem-add': {
        const t = ($('newMemory') || {}).value;
        if (t && t.trim()) {
          S.memories.push({ id: AI.uid(), text: t.trim().slice(0, 300), scope: 'global', createdAt: AI.now() });
          AI.save(true);
          U.renderDrawer();
          U.toast('已记住', 'ok');
        }
        return;
      }
      case 'mem-del':
        S.memories = S.memories.filter(x => x.id !== v);
        AI.save(true);
        U.renderDrawer();
        return;
      case 'mem-auto': {
        const c = AI.currentConv(),
          text = AI.pathOf(c)
            .map(n => n.content)
            .join('\n')
            .slice(0, 6000);
        if (!text) {
          U.toast('当前会话为空', 'warn');
          return;
        }
        U.toast('正在提取记忆…');
        AI.complete(
          AI.langPrompt(
            '从对话中提取值得长期记住的用户偏好、约束与稳定事实，每行一条，最多 5 条；仅输出条目本身，不编号、不加解释；排除一次性任务、推测与临时信息。',
            'Extract durable user preferences, constraints and stable facts from the conversation. Output at most 5 lines, one item per line, with no numbering or commentary. Exclude one-off tasks, speculation and transient information.'
          ),
          text
        )
          .then(r => {
            r.split('\n')
              .map(x => x.replace(/^[-*\d.]\s*/, '').trim())
              .filter(x => x.length > 4 && x.length < 200)
              .forEach(t => S.memories.push({ id: AI.uid(), text: t, scope: 'global', createdAt: AI.now() }));
            AI.save(true);
            U.renderDrawer();
            U.toast('记忆已提取', 'ok');
          })
          .catch(e => U.toast(e.message, 'err'));
        return;
      }
      case 'search-test':
        U.toast('正在测试搜索…');
        AI.webSearch('AI Chat 前端 最新特性').then(r =>
          U.modal({
            title: r.error ? '搜索失败' : '搜索成功',
            body: `<p>${AI.esc(r.error || '返回 ' + r.results.length + ' 条结果')}</p><pre style="max-height:260px;overflow:auto;font-size:11px;white-space:pre-wrap">${AI.esc(r.text.slice(0, 1500))}</pre>`
          })
        );
        return;
      case 'mcp-add': {
        const s = { id: AI.uid(), name: 'MCP Server', url: 'http://localhost:3000/mcp', enabled: true, headers: {} };
        S.mcpServers.push(s);
        AI.save(true);
        U.editing = 'mcp:' + s.id;
        U.renderDrawer();
        return;
      }
      case 'mcp-edit':
        U.editing = U.editing === 'mcp:' + v ? null : 'mcp:' + v;
        U.renderDrawer();
        return;
      case 'mcp-save':
        AI.mcpRefresh(v);
        U.editing = null;
        AI.save(true);
        U.renderDrawer();
        return;
      case 'mcp-del':
        AI.mcpRefresh(v);
        S.mcpServers = S.mcpServers.filter(x => x.id !== v);
        AI.save(true);
        U.renderDrawer();
        return;
      case 'mcp-test': {
        const s = find('mcpServers', v);
        if (!s) return;
        U.toast('正在连接 MCP…');
        AI.mcpRefresh(v);
        AI.mcpInit(s)
          .then(c =>
            U.modal({
              title: 'MCP 已连接',
              body: `<p>发现 ${(c.tools || []).length} 个工具</p><div class="tiny" style="max-height:240px;overflow:auto">${AI.esc((c.tools || []).map(t => `${t.rawName}: ${t.description}`).join('\n\n'))}</div>`
            })
          )
          .catch(e =>
            U.modal({
              title: 'MCP 连接失败',
              body: `<p>${AI.esc(e.message)}</p><p class="tiny">确认 URL、CORS 与 Streamable HTTP 支持。</p>`
            })
          );
        return;
      }
      case 'image-test':
        U.toast('正在生成…');
        AI.generateImage('a minimalist neon-blue abstract logo, clean background')
          .then(u =>
            U.modal({ title: '生成成功', body: `<img src="${AI.esc(u[0])}" style="max-width:100%;border-radius:8px">` })
          )
          .catch(e => U.toast(e.message, 'err'));
        return;
      case 'export-json':
        U.exportJson(false);
        return;
      case 'export-config':
        U.exportJson(true);
        return;
      case 'export-md':
        U.exportMarkdown();
        return;
      case 'import-json':
        U.importJson(false);
        return;
      case 'import-config':
        U.importJson(true);
        return;
      case 'qr':
        U.qrDialog();
        return;
      case 'reset':
        U.confirm('清空全部数据', '将删除所有会话、配置与记忆，且不可恢复。', () => {
          AI.resetAll();
          U.closeDrawer();
          U.renderAll();
        });
        return;
    }
    if (AI.EXTRA_ACTIONS && AI.EXTRA_ACTIONS[name]) return AI.EXTRA_ACTIONS[name]({ v, ds, el, find, S });
  };

  /* ---------------- Import and export ---------------- */
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
  /* Recursive redaction: strip apiKey, password, secret and credential-like header fields. */
  function shareSafe(value) {
    if (Array.isArray(value)) return value.map(shareSafe);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(k => {
        if (/^(apiKey|api_key|password|secret|token)$/i.test(k)) return;
        if (/^headers$/i.test(k) && value[k] && typeof value[k] === 'object') {
          const h = {};
          Object.keys(value[k]).forEach(hk => {
            if (!/^(authorization|x-api-key|x-goog-api-key|.*-token|.*-key|cookie)$/i.test(hk)) h[hk] = value[k][hk];
          });
          out[k] = h;
          return;
        }
        out[k] = shareSafe(value[k]);
      });
      return out;
    }
    return value;
  }
  U.exportJson = function (configOnly) {
    const doExport = redact => {
      const s = AI.clone(AI.state);
      if (configOnly) {
        s.conversations = [];
        s.logs = {};
        s.currentId = null;
      }
      const out = redact ? shareSafe(s) : s;
      download(
        `ai-chat-pro-${configOnly ? 'config' : 'backup'}-${AI.dayKey()}.json`,
        JSON.stringify(out, null, 2),
        'application/json'
      );
      U.toast(redact ? '已导出（密钥已脱敏）' : AI.t('exporting'), 'ok');
    };
    if (configOnly) {
      doExport(true);
      return;
    }
    // Full backups require confirmation and are redacted by default.
    U.modal({
      title: '导出备份',
      body: '<p>JSON 备份可能包含 API Key 与自定义请求头。建议脱敏导出；确需完整备份时请勿分享给他人。</p>',
      actions: [
        { label: AI.t('cancel'), cls: 'ghost' },
        { label: '脱敏导出', cls: 'primary', onClick: () => doExport(true) },
        { label: '包含密钥导出', cls: 'ghost', onClick: () => doExport(false) }
      ]
    });
  };
  U.exportMarkdown = function (conv) {
    const c = conv || AI.currentConv();
    if (!c) return;
    const path = AI.pathOf(c);
    let md = `# ${c.title}\n\n> 导出于 ${new Date().toLocaleString()} · ${path.length} 条消息\n\n`;
    path.forEach(n => {
      md += `## ${n.role === 'user' ? '你' : 'AI'}${n.model ? ' · ' + n.model : ''}\n\n`;
      if (n.reasoning) md += `<details><summary>思考过程</summary>\n\n${n.reasoning}\n\n</details>\n\n`;
      (n.attachments || []).forEach(a => {
        if (a.type === 'image' && a.data) md += `![${a.name}](${a.data})\n\n`;
        else md += `> 附件：${a.name}\n\n${a.text || ''}\n\n`;
      });
      md += (n.content || '') + '\n\n';
      (n.images || []).forEach(u => (md += `![generated](${u})\n\n`));
      if (n.sources && n.sources.length)
        md += '**来源**\n\n' + n.sources.map((s, i) => `[${i + 1}] [${s.title}](${s.url})`).join(' · ') + '\n\n';
      md += '---\n\n';
    });
    download(`${(c.title || 'chat').replace(/[\\/:*?"<>|]/g, '_')}.md`, md, 'text/markdown;charset=utf-8');
    U.toast(AI.t('exporting'), 'ok');
  };
  U.importJson = function (configOnly) {
    const doApply = text => {
      const j = AI.safeJson(text, null);
      if (!j || typeof j !== 'object') {
        U.toast('JSON 格式错误', 'err');
        return;
      }
      try {
        if (configOnly) {
          ['settings', 'providers', 'assistants', 'prompts', 'memories', 'mcpServers', 'search', 'imageGen'].forEach(
            k => {
              if (j[k] !== undefined) AI.state[k] = j[k];
            }
          );
          if (j.activeModel) AI.state.activeModel = j.activeModel;
        } else {
          AI.state = Object.assign(AI.DEFAULT_STATE(), j);
          if (!AI.state.conversations || !AI.state.conversations.length) AI.newConversation({ silent: true });
          if (!AI.currentConv()) AI.state.currentId = AI.state.conversations[0].id;
        }
        AI.save(true);
        U.closeDrawer();
        U.applyTheme();
        AI.applyStaticI18n();
        U.renderAll();
        U.toast(AI.t('importing'), 'ok');
      } catch (e) {
        U.toast('导入失败：' + e.message, 'err');
      }
    };
    if (configOnly) {
      U.modal({
        title: '粘贴配置 JSON',
        body: '<textarea class="textarea" id="importText" rows="8" placeholder=\'{"providers":[...]}\'></textarea>',
        actions: [
          { label: AI.t('cancel'), cls: 'ghost' },
          { label: AI.t('import'), cls: 'primary', onClick: root => doApply(root.querySelector('#importText').value) }
        ]
      });
    } else {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => doApply(r.result);
        r.readAsText(f);
      };
      inp.click();
    }
  };
  U.qrDialog = function () {
    const cfg = shareSafe({ providers: AI.state.providers, search: AI.state.search });
    const text = JSON.stringify(cfg);
    U.modal({
      title: AI.t('qrTitle'),
      width: 'min(420px,94vw)',
      body: `<p>${AI.esc(AI.t('qrHint'))}</p><div class="qr-box" id="qrBox"></div><textarea class="textarea" rows="4" id="qrText">${AI.esc(text)}</textarea>`,
      actions: [
        { label: '复制 JSON', cls: 'primary', onClick: root => AI.copy(root.querySelector('#qrText').value) },
        { label: AI.t('close'), cls: 'ghost' }
      ],
      onOpen: root => {
        const box = root.querySelector('#qrBox');
        const draw = () => {
          if (window.QRCode && box.isConnected) {
            try {
              box.innerHTML = '';
              new QRCode(box, { text, width: 180, height: 180 });
            } catch (e) {}
          }
        };
        if (window.QRCode) {
          draw();
          return;
        }
        box.innerHTML = '<span class="tiny">正在加载二维码组件…</span>';
        AI.loadLib('qrcode').then(ok => {
          if (!box.isConnected) return;
          if (ok) draw();
          else box.innerHTML = '<span class="tiny">二维码组件不可用（离线或超时），请复制下方 JSON</span>';
        });
      }
    });
  };

  /* ---------------- Command palette ---------------- */
  let cmdItems = [],
    cmdSel = 0;
  U.openCmd = function () {
    D.cmdPalette.hidden = false;
    D.cmdInput.value = '';
    renderCmd('');
    D.cmdInput.focus();
  };
  U.closeCmd = function () {
    D.cmdPalette.hidden = true;
  };
  function cmdBase() {
    const items = [
      { ico: AI.icon('plus'), label: '新建对话', hint: 'Ctrl+N', run: () => AI.newChat() },
      { ico: AI.icon('user'), label: '切换助手…', run: () => U.openDrawer('assistants') },
      { ico: AI.icon('layers'), label: '切换模型…', run: () => U.showModelPicker($('btnModel')) },
      { ico: AI.icon('settings'), label: '打开设置', run: () => U.openDrawer('general') },
      { ico: AI.icon('globe'), label: '联网搜索设置', run: () => U.openDrawer('search') },
      { ico: AI.icon('plug'), label: 'MCP 工具设置', run: () => U.openDrawer('mcp') },
      { ico: AI.icon('book'), label: '提示词库', run: () => U.openDrawer('prompts') },
      { ico: AI.icon('brain'), label: '记忆库', run: () => U.openDrawer('memory') },
      { ico: AI.icon('chart'), label: '使用统计', run: () => U.openDrawer('stats') },
      { ico: AI.icon('database'), label: '备份与导入', run: () => U.openDrawer('backup') },
      {
        ico: AI.icon('moon'),
        label: '切换明暗',
        run: () => U.setMode(document.body.classList.contains('light') ? 'dark' : 'light')
      },
      { ico: AI.icon('download'), label: '导出当前会话 Markdown', run: () => U.exportMarkdown() },
      { ico: AI.icon('fork'), label: '查看分支树', run: () => U.branchTree() },
      { ico: AI.icon('search'), label: '全局搜索消息', run: () => U.globalSearch() },
      { ico: AI.icon('compress'), label: '压缩当前上下文', run: () => AI.compressContext && AI.compressContext() },
      { ico: AI.icon('bolt'), label: '多模型对比', run: () => U.raceDialog() },
      { ico: AI.icon('image'), label: '文生图', run: () => U.imageDialog() }
    ];
    AI.state.prompts.forEach(p =>
      items.push({
        ico: AI.icon('file'),
        label: (AI.state.settings.lang === 'en' ? 'Template: ' : '模板：') + AI.field(p, 'name'),
        hint: 'prompt',
        run: () => {
          U.closeCmd();
          U.insertPrompt(AI.field(p, 'content'));
        }
      })
    );
    AI.state.conversations.slice(0, 30).forEach(c =>
      items.push({
        ico: AI.icon('message'),
        label: '会话：' + c.title,
        hint: AI.fmtTime(c.updatedAt).slice(5),
        run: () => AI.selectConv(c.id)
      })
    );
    AI.allModels().forEach(x =>
      items.push({
        ico: AI.icon('layers'),
        label: '模型：' + (x.model.name || x.id),
        hint: x.provider.name,
        run: () => {
          AI.state.activeModel = { providerId: x.provider.id, modelId: x.id };
          AI.save();
          U.updateLabels();
          U.renderInspector();
        }
      })
    );
    (AI.EXTRA_COMMANDS || []).forEach(fn => {
      try {
        const a = fn();
        if (Array.isArray(a)) items.push(...a);
      } catch (e) {}
    });
    return items;
  }
  function renderCmd(q) {
    const all = cmdBase();
    cmdItems = q
      ? all.filter(i => (i.label + ' ' + (i.hint || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 40)
      : all.slice(0, 24);
    cmdSel = 0;
    D.cmdList.innerHTML = cmdItems.length
      ? cmdItems
          .map(
            (i, k) =>
              `<button class="cmd-item ${k === 0 ? 'sel' : ''}" data-cmd="${k}"><span class="cmd-ico">${i.ico}</span><span>${AI.esc(i.label)}</span><small>${AI.esc(i.hint || '')}</small></button>`
          )
          .join('')
      : `<div style="padding:20px;text-align:center;color:var(--dim)">${AI.t('noResult')}</div>`;
  }
  function execCmd(k) {
    const i = cmdItems[k];
    if (!i) return;
    U.closeCmd();
    setTimeout(() => i.run(), 0);
  }

  /* ---------------- Model and assistant pickers ---------------- */
  U.showModelPicker = function (anchor) {
    const items = [];
    AI.allModels().forEach(x =>
      items.push({
        icon: AI.icon('layers'),
        label: x.model.name || x.id,
        sub: x.provider.name,
        checked: x.provider.id === AI.state.activeModel.providerId && x.id === AI.state.activeModel.modelId,
        onClick: () => {
          AI.state.activeModel = { providerId: x.provider.id, modelId: x.id };
          AI.save();
          U.updateLabels();
          U.toast('已切换：' + x.id, 'ok');
        }
      })
    );
    items.push({ sep: true });
    items.push({ icon: AI.icon('settings'), label: '管理供应商 / 模型', onClick: () => U.openDrawer('providers') });
    if (!items.length || items.length === 2) items.unshift({ title: '尚无模型，请先添加供应商' });
    U.popover(anchor, items);
  };
  U.showAssistantPicker = function (anchor) {
    const items = AI.state.assistants.map(a => ({
      icon: AI.iconHtml(a.emoji, 'sparkle'),
      label: a.name,
      sub: (a.systemPrompt || '').slice(0, 40),
      checked: a.id === AI.state.activeAssistantId,
      onClick: () => {
        AI.state.activeAssistantId = a.id;
        AI.save();
        U.updateLabels();
      }
    }));
    items.push(
      { sep: true },
      { icon: AI.icon('settings'), label: '管理助手', onClick: () => U.openDrawer('assistants') }
    );
    U.popover(anchor, items);
  };
  U.promptPicker = function (anchor) {
    const items = AI.state.prompts.map(p => ({
      icon: AI.icon('file'),
      label: AI.field(p, 'name'),
      sub: AI.field(p, 'cat'),
      onClick: () => U.insertPrompt(AI.field(p, 'content'))
    }));
    items.push(
      { sep: true },
      { icon: AI.icon('settings'), label: '管理提示词模板', onClick: () => U.openDrawer('prompts') }
    );
    U.popover(anchor, items);
  };
  U.insertPrompt = function (tpl) {
    const sel = window.getSelection ? String(window.getSelection()) : '';
    const text = AI.renderVars(tpl, { selection: sel || D.input.value });
    D.input.value = text;
    U.autoGrow();
    U.saveDraft();
    D.input.focus();
    U.toast('已插入模板', 'ok');
  };

  /* ---------------- Global search, branch tree, model comparison and image generation ---------------- */
  U.globalSearch = function () {
    U.modal({
      title: '全局搜索消息',
      width: 'min(620px,94vw)',
      body: '<input class="input" id="gSearch" placeholder="输入关键词，搜索所有会话"><div id="gResults" style="margin-top:12px;max-height:46vh;overflow:auto"></div>',
      actions: [{ label: AI.t('close'), cls: 'ghost' }],
      onOpen: root => {
        const inp = root.querySelector('#gSearch'),
          box = root.querySelector('#gResults');
        const run = () => {
          const q = inp.value.trim().toLowerCase();
          box.innerHTML = '';
          if (!q) return;
          let count = 0;
          AI.state.conversations.forEach(c =>
            Object.values(c.nodes).forEach(n => {
              if (count > 60 || n.role === 'system' || !(n.content || '').toLowerCase().includes(q)) return;
              count++;
              const div = document.createElement('div');
              div.className = 'list-row';
              div.innerHTML = `<span class="grow">${AI.esc((n.content || '').replace(/\s+/g, ' ').slice(0, 110))}<small>${AI.esc(c.title)} · ${n.role === 'user' ? '你' : 'AI'} · ${AI.fmtTime(n.createdAt)}</small></span>`;
              div.style.cursor = 'pointer';
              div.onclick = () => {
                U.closeModal();
                AI.selectConv(c.id);
                D.chatSearchInput.value = inp.value;
                D.chatSearchBar.hidden = false;
                U.renderMessages();
              };
              box.appendChild(div);
            })
          );
          if (!count) box.innerHTML = `<div class="tiny" style="padding:12px">${AI.t('noResult')}</div>`;
        };
        inp.addEventListener('input', run);
        inp.focus();
      }
    });
  };
  U.branchTree = function () {
    const c = AI.currentConv();
    if (!c) return;
    const active = new Set(AI.pathOf(c).map(n => n.id));
    const lines = [];
    const walk = (id, depth) => {
      const n = c.nodes[id];
      if (!n) return;
      if (n.id !== c.rootId)
        lines.push({
          text:
            '  '.repeat(depth) +
            (active.has(n.id) ? '● ' : '○ ') +
            (n.role === 'user' ? '你: ' : 'AI: ') +
            (n.content || '').replace(/\n/g, ' ').slice(0, 60),
          on: active.has(n.id)
        });
      (n.children || []).forEach(ch => walk(ch, depth + 1));
    };
    walk(c.rootId, 0);
    U.modal({
      title: AI.t('branchTitle'),
      width: 'min(640px,94vw)',
      body: `<div class="branch-tree">${lines.map(l => `<div class="${l.on ? 'on' : ''}">${AI.esc(l.text)}</div>`).join('')}</div><p class="tiny" style="margin-top:10px">● 当前路径 · ○ 其它分支（用消息下方的 ‹ 2/3 › 切换）</p>`
    });
  };
  U.raceDialog = function () {
    const ms = AI.allModels();
    if (ms.length < 2) {
      U.toast('请先在设置里添加至少两个模型', 'warn');
      U.openDrawer('providers');
      return;
    }
    U.modal({
      title: AI.t('raceTitle'),
      body: `<p>${AI.esc(AI.t('raceHint'))}</p><div id="raceList">${ms.map((x, i) => `<label class="switch-row" style="cursor:pointer"><span><input type="checkbox" data-race="${i}" ${i < 2 ? 'checked' : ''}> ${AI.esc(x.model.name || x.id)} <small>${AI.esc(x.provider.name)}</small></span></label>`).join('')}</div>`,
      actions: [
        { label: AI.t('cancel'), cls: 'ghost' },
        {
          label: '开始对比',
          cls: 'primary',
          onClick: root => {
            const picked = Array.from(root.querySelectorAll('[data-race]:checked'))
              .map(el => ms[+el.dataset.race])
              .slice(0, 4);
            if (picked.length < 2) {
              U.toast('至少选择 2 个模型', 'warn');
              return false;
            }
            setTimeout(() => AI.race(picked, D.input.value || '你好，请做个自我介绍'), 0);
          }
        }
      ]
    });
  };
  U.imageDialog = function () {
    U.modal({
      title: AI.t('imageGenTitle'),
      body: `<p>${AI.esc(AI.t('imageGenHint'))}</p><textarea class="textarea" id="imgPrompt" rows="3" placeholder="a neon cyberpunk cat, cinematic lighting"></textarea>`,
      actions: [
        { label: AI.t('cancel'), cls: 'ghost' },
        {
          label: '生成',
          cls: 'primary',
          onClick: root => {
            const p = root.querySelector('#imgPrompt').value.trim();
            if (p) setTimeout(() => AI.doImageGen(p), 0);
          }
        }
      ]
    });
  };
  U.translate = async function (node) {
    if (!node) return;
    U.toast('正在翻译…');
    try {
      const r = await AI.complete(AI.langPrompt(TRANSLATION_DIRECTIVE.zh, TRANSLATION_DIRECTIVE.en), node.content);
      U.modal({
        title: AI.t('translate'),
        width: 'min(620px,94vw)',
        body: `<div class="md">${AI.Render.markdown(r)}</div>`,
        actions: [
          { label: AI.t('copy'), cls: 'primary', onClick: () => AI.copy(r) },
          { label: AI.t('close'), cls: 'ghost' }
        ]
      });
    } catch (e) {
      U.toast(e.message, 'err');
    }
  };

  /* ---------------- Main render entry point ---------------- */
  U.renderAll = function () {
    U.applyTheme();
    AI.applyStaticI18n();
    U.renderStarters();
    U.renderConvList();
    U.renderChatHead();
    U.renderMessages();
    U.updateLabels();
    U.renderAttachments();
    U.scrollBottom(true);
    if (D.inspector && !D.inspector.hidden) U.renderInspector();
  };
  U.saveDraft = function () {
    const c = AI.currentConv();
    if (!c || AI.state.settings.saveDrafts === false) return;
    if (D.input.value) AI.state.ui.drafts[c.id] = D.input.value;
    else delete AI.state.ui.drafts[c.id];
    AI.save();
  };

  /* ---------------- Event binding ---------------- */
  U.bind = function () {
    // Top bar
    $('btnMenu').onclick = () => {
      D.sidebar.classList.toggle('open');
      D.sidebarOverlay.classList.toggle('show', D.sidebar.classList.contains('open'));
    };
    D.sidebarOverlay.onclick = () => {
      D.sidebar.classList.remove('open');
      D.sidebarOverlay.classList.remove('show');
    };
    $('btnSettings').onclick = () => U.openDrawer('general');
    $('btnLang').onclick = () => U.toggleLang();
    $('btnTheme').onclick = e =>
      U.popover(e.currentTarget, [
        { title: '设计语言' },
        ...AI.DESIGNS.map(([k, n]) => ({
          icon: '<svg class="ico"><use href="#i-palette"/></svg>',
          label: n,
          checked: AI.normalizeDesign(AI.state.settings.design) === k,
          onClick: () => U.setTheme(k)
        })),
        { sep: true },
        { title: '明暗' },
        {
          icon: '<svg class="ico"><use href="#i-sun"/></svg>',
          label: '浅色',
          checked: AI.state.settings.mode === 'light',
          onClick: () => U.setMode('light')
        },
        {
          icon: '<svg class="ico"><use href="#i-moon"/></svg>',
          label: '深色',
          checked: AI.state.settings.mode === 'dark',
          onClick: () => U.setMode('dark')
        },
        {
          icon: '<svg class="ico"><use href="#i-layers"/></svg>',
          label: '跟随系统',
          checked: AI.state.settings.mode === 'auto',
          onClick: () => U.setMode('auto')
        },
        { sep: true },
        {
          icon: '<svg class="ico"><use href="#i-settings"/></svg>',
          label: '外观与布局设置…',
          onClick: () => U.openDrawer('layout')
        }
      ]);
    $('btnModel').onclick = e => U.showModelPicker(e.currentTarget);
    $('btnAssistant').onclick = e => U.showAssistantPicker(e.currentTarget);
    $('btnSearchGlobal').onclick = () => U.openCmd();
    $('btnNewChat').onclick = () => AI.newChat();
    D.sidebarSearch.addEventListener('input', () => U.renderConvList());
    D.sideFilters.onclick = e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      AI.state.ui.sidebarFilter = b.dataset.filter;
      AI.save();
      U.renderConvList();
    };
    D.sideFolders.onclick = e => {
      const b = e.target.closest('[data-folder]');
      if (!b) return;
      AI.state.ui.folder = b.dataset.folder;
      AI.save();
      U.renderConvList();
    };
    D.convList.onclick = e => {
      const act = e.target.closest('[data-conv-act]');
      if (act) {
        e.stopPropagation();
        const c = AI.state.conversations.find(x => x.id === act.dataset.id);
        if (!c) return;
        const a = act.dataset.convAct;
        if (a === 'pin') {
          c.pinned = !c.pinned;
          AI.save();
          U.renderConvList();
        }
        if (a === 'archive') {
          c.archived = !c.archived;
          AI.save();
          U.renderConvList();
          U.toast(c.archived ? '已归档' : '已取消归档', 'ok');
        }
        if (a === 'folder') {
          const folders = AI.state.folders || [];
          U.popover(
            act,
            [
              { title: '移动到文件夹' },
              {
                icon: AI.icon('close'),
                label: '无文件夹',
                onClick: () => {
                  c.folder = '';
                  AI.save();
                  U.renderConvList();
                }
              }
            ]
              .concat(
                folders.map(f => ({
                  icon: AI.icon('folder'),
                  label: f.name,
                  checked: c.folder === f.id,
                  onClick: () => {
                    c.folder = f.id;
                    AI.save();
                    U.renderConvList();
                  }
                }))
              )
              .concat([
                { sep: true },
                { icon: AI.icon('settings'), label: '管理文件夹…', onClick: () => U.openDrawer('layout') }
              ])
          );
        }
        if (a === 'del') U.confirm(AI.t('delete'), AI.t('confirmDelete'), () => AI.deleteConv(c.id));
        if (a === 'export') U.exportMarkdown(c);
        if (a === 'rename')
          U.modal({
            title: AI.t('rename'),
            body: `<input class="input" id="rnInput" value="${AI.esc(c.title)}">`,
            actions: [
              { label: AI.t('cancel'), cls: 'ghost' },
              {
                label: AI.t('confirm'),
                cls: 'primary',
                onClick: root => {
                  c.title = root.querySelector('#rnInput').value.trim() || c.title;
                  AI.save();
                  U.renderAll();
                }
              }
            ]
          });
        return;
      }
      const item = e.target.closest('[data-conv]');
      if (item) AI.selectConv(item.dataset.conv);
    };
    // Conversation header
    $('btnSearchInChat').onclick = () => {
      D.chatSearchBar.hidden = !D.chatSearchBar.hidden;
      if (!D.chatSearchBar.hidden) D.chatSearchInput.focus();
      else {
        D.chatSearchInput.value = '';
        U.renderMessages();
      }
    };
    $('btnCloseChatSearch').onclick = () => {
      D.chatSearchBar.hidden = true;
      D.chatSearchInput.value = '';
      U.renderMessages();
    };
    D.chatSearchInput.addEventListener('input', () => U.renderMessages());
    $('btnBranchView').onclick = () => U.branchTree();
    $('btnCompress').onclick = () => AI.compressContext && AI.compressContext();
    $('btnExportMd').onclick = () => U.exportMarkdown();
    $('btnExportJson').onclick = () => U.exportJson(false);
    $('btnClearChat').onclick = () =>
      U.confirm(AI.t('clear'), AI.t('confirmClear'), () => {
        AI.clearConv(AI.currentConv());
        U.renderAll();
      });
    $('btnDeleteChat').onclick = () =>
      U.confirm(AI.t('delete'), AI.t('confirmDelete'), () => AI.deleteConv(AI.state.currentId));
    // Reasoning and tool headers are keyboard operable.
    D.messages.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('[data-action="toggle-reasoning"],[data-action="toggle-tool"]');
      if (t) {
        e.preventDefault();
        t.click();
      }
    });
    // Message area event delegation
    D.messages.addEventListener('click', e => {
      const codeBtn = e.target.closest('[data-code-action]');
      if (codeBtn) {
        const wrap = codeBtn.closest('.code-block');
        const code = wrap ? wrap.dataset.code : '',
          lang = wrap ? wrap.dataset.lang : '';
        const a = codeBtn.dataset.codeAction;
        if (a === 'copy') {
          AI.copy(code);
        }
        if (a === 'preview') U.openArtifact(code, lang);
        if (a === 'download') download((lang || 'code') + '-' + Date.now() + '.txt', code);
        return;
      }
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const c = AI.currentConv(),
        id = t.dataset.node,
        n = id && c.nodes[id];
      const a = t.dataset.action;
      if (a === 'toggle-reasoning' || a === 'toggle-tool') {
        const b = t.nextElementSibling;
        if (!b) return;
        b.hidden = !b.hidden;
        t.setAttribute('aria-expanded', String(!b.hidden));
        const ch = t.querySelector('.reasoning-chevron, .tool-chevron');
        if (ch) ch.innerHTML = b.hidden ? AI.icon('chevron') : AI.icon('chevron-up');
        if (!b.hidden) {
          b.scrollTop = b.scrollHeight;
          delete b.dataset.userPinned;
        }
        return;
      }
      if (a === 'suggestion') {
        D.input.value = t.dataset.extra;
        U.autoGrow();
        U.saveDraft();
        D.input.focus();
        return;
      }
      if (!n) return;
      if (a === 'copy') {
        AI.copy(n.content || '');
      }
      if (a === 'continue') {
        AI.continueGeneration(c, id);
        return;
      }
      if (a === 'retry') {
        AI.regenerate(c, id);
      }
      if (a === 'retry-model') {
        AI.regenerate(c, id, t);
      }
      if (a === 'star') {
        n.starred = !n.starred;
        AI.save();
        U.renderMessages();
        U.renderConvList();
      }
      if (a === 'pin-msg') {
        n.pinned = !n.pinned;
        AI.save(true);
        U.renderMessages();
        U.updateCtxMeter();
        U.toast(n.pinned ? '已固定到上下文' : '已取消固定', 'ok');
      }
      if (a === 'fork') AI.forkFrom(c, id);
      if (a === 'fold') {
        const holder = t.closest('.msg-row').querySelector('.md-holder');
        if (holder) {
          holder.hidden = !holder.hidden;
          t.textContent = holder.hidden ? '展开' : '折叠';
        }
      }
      if (a === 'feedback') {
        n.feedback = n.feedback === t.dataset.extra ? null : t.dataset.extra;
        AI.save();
        U.renderMessages();
      }
      if (a === 'speak') U.speak(n.content);
      if (a === 'translate') U.translate(n);
      if (a === 'delete-node')
        U.confirm(AI.t('delete'), '删除该消息及其后续分支？', () => {
          AI.deleteSubtree(c, id);
          AI.save(true);
          U.renderAll();
        });
      if (a === 'edit') AI.editMessage(c, id);
      if (a === 'regenerate') AI.regenerate(c, id, t);
      if (a === 'branch-prev' || a === 'branch-next') {
        const sibs = AI.siblingsOf(c, id),
          i = sibs.findIndex(x => x.id === id);
        const next = sibs[(i + (a === 'branch-next' ? 1 : -1) + sibs.length) % sibs.length];
        if (next) {
          AI.setActiveChild(c, n.parentId, next.id);
          U.renderAll();
        }
      }
    });
    D.messages.addEventListener(
      'scroll',
      () => {
        const el = D.messages,
          d = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (d < 60) {
          U.scrollSticky = true;
          U._userScrolling = false;
        } else if (U._userScrolling) U.scrollSticky = false;
        U.setScrollBtn(d >= 90);
      },
      { passive: true }
    );
    /* Wheel events inside nested scrollers (reasoning, tool results, code blocks) do not count as detaching from the message flow. */
    const inInner = e =>
      e.target &&
      e.target.closest &&
      e.target.closest(
        '.reasoning-body,.tool-body,.code-body,.code-block pre,pre,.pick-list,.modal,.inspector,.drawer'
      );
    D.messages.addEventListener(
      'wheel',
      e => {
        if (inInner(e)) return;
        U._userScrolling = true;
        if (e.deltaY < 0) U.scrollSticky = false;
      },
      { passive: true }
    );
    D.messages.addEventListener(
      'touchstart',
      () => {
        U._userScrolling = true;
      },
      { passive: true }
    );
    D.messages.addEventListener(
      'touchmove',
      e => {
        if (!inInner(e)) U._userScrolling = true;
      },
      { passive: true }
    );
    document.addEventListener('keydown', e => {
      if (!['PageUp', 'Home', 'ArrowUp'].includes(e.key)) return;
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (D.modalRoot && !D.modalRoot.hidden) return;
      U._userScrolling = true;
      U.scrollSticky = false;
    });
    D.btnScrollBottom.onclick = () => U.scrollBottom(true);
    // Composer
    D.input.addEventListener('input', () => {
      U.autoGrow();
      U.saveDraft();
    });
    D.input.addEventListener('keydown', e => {
      const st = AI.state.settings;
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        const touch = window.matchMedia && matchMedia('(hover:none) and (pointer:coarse)').matches;
        // On touch devices Enter inserts a newline by default to prevent accidental sends; Ctrl/⌘+Enter still sends.
        const mobileBlock = touch && st.mobileEnterSend !== true;
        const send = mobileBlock
          ? e.ctrlKey || e.metaKey
          : st.sendKey === 'enter'
            ? !e.shiftKey
            : e.ctrlKey || e.metaKey;
        if (send) {
          e.preventDefault();
          AI.send();
        }
      }
      if (e.key === '/' && D.input.value === '') {
        e.preventDefault();
        U.openCmd();
      }
    });
    $('btnSend').onclick = () => AI.send();
    $('btnStop').onclick = () => AI.stop();
    $('btnClearInput').onclick = () => {
      D.input.value = '';
      U.autoGrow();
      U.saveDraft();
    };
    D.btnStop.hidden = true;
    $('btnAttach').onclick = () => D.fileInput.click();
    D.fileInput.onchange = () => {
      U.addFiles(D.fileInput.files);
      D.fileInput.value = '';
    };
    $('btnVoice').onclick = () => U.startVoice();
    $('btnScreenshot').onclick = () => U.screenshot();
    $('btnImageGen').onclick = () => U.imageDialog();
    $('btnRace').onclick = () => U.raceDialog();
    $('btnPromptQuick').onclick = e => U.promptPicker(e.currentTarget);
    D.attachmentBar.onclick = e => {
      const b = e.target.closest('[data-att-del]');
      if (!b) return;
      U.pending = U.pending.filter(x => x.id !== b.dataset.attDel);
      U.renderAttachments();
    };
    ['btnWebSearch', 'btnMcp', 'btnReasoning'].forEach(
      id =>
        ($(id).onclick = () => {
          const key = { btnWebSearch: 'webSearchOn', btnMcp: 'toolsOn', btnReasoning: 'showReasoning' }[id];
          AI.state.settings[key] = !AI.state.settings[key];
          AI.save();
          U.updateLabels();
          const label = {
            webSearchOn: AI.state.settings.lang === 'en' ? 'Web search' : '联网搜索',
            toolsOn: AI.state.settings.lang === 'en' ? 'Tools' : '工具调用',
            showReasoning: AI.state.settings.lang === 'en' ? 'Show reasoning' : '思考展示'
          }[key];
          U.toast(
            label +
              (AI.state.settings[key]
                ? AI.state.settings.lang === 'en'
                  ? ' on'
                  : ' 已开启'
                : AI.state.settings.lang === 'en'
                  ? ' off'
                  : ' 已关闭')
          );
        })
    );
    // Drag and drop, paste
    D.composer.addEventListener('dragover', e => {
      e.preventDefault();
      D.composer.classList.add('dragover');
    });
    D.composer.addEventListener('dragleave', () => D.composer.classList.remove('dragover'));
    D.composer.addEventListener('drop', e => {
      e.preventDefault();
      D.composer.classList.remove('dragover');
      U.addFiles(e.dataTransfer.files);
    });
    document.addEventListener('paste', e => {
      if (e.target === D.input) {
        const files = Array.from((e.clipboardData || {}).files || []).filter(f => f.type.startsWith('image/'));
        if (files.length) {
          e.preventDefault();
          U.addFiles(files);
        }
      }
    });
    $('btnCancelReply').onclick = () => U.setReply('');
    // Drawer
    $('btnCloseDrawer').onclick = () => U.closeDrawer();
    D.drawerMask.onclick = () => U.closeDrawer();
    D.drawerTabs.onclick = e => {
      const g = e.target.closest('[data-group]');
      if (g) {
        U.drawerGroup = g.dataset.group;
        const grp = (AI.DRAWER_GROUPS || []).find(x => x.id === U.drawerGroup);
        if (grp && !grp.keys.includes(U.drawerTab)) U.drawerTab = grp.keys[0];
        U.editing = null;
        U.renderDrawer();
        return;
      }
      const b = e.target.closest('[data-tab]');
      if (b) {
        U.drawerTab = b.dataset.tab;
        U.editing = null;
        U.renderDrawer();
      }
    };
    D.drawerBody.addEventListener('click', e => {
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        U.toggleBound(tg.dataset.toggle);
        return;
      }
      const ac = e.target.closest('[data-do]');
      if (ac) {
        U.drawerAction(ac.dataset.do, ac.dataset, ac);
        return;
      }
    });
    D.drawerBody.addEventListener('change', e => {
      const el = e.target.closest('[data-bind]');
      if (!el) return;
      if (U.setBound(el.dataset.bind, el.value, el.dataset.type) !== false) {
        if (
          ['settings.lang', 'settings.mode', 'settings.design', 'settings.fontSize', 'settings.customCss'].some(
            x => el.dataset.bind === x
          )
        ) {
          AI.applyStaticI18n();
          U.applyTheme();
          U.renderStarters();
          U.renderChatHead();
          U.renderMessages();
          U.renderInspector();
        } else U.updateCtxMeter();
      }
    });
    D.drawerBody.addEventListener('input', e => {
      const el = e.target.closest('[data-bind]');
      if (!el || el.tagName === 'SELECT' || el.type === 'color') return;
      if (
        [
          'settings.fontSize',
          'settings.temperature',
          'settings.maxTokens',
          'settings.contextLimit',
          'settings.maxToolRounds',
          'settings.ttsRate',
          'settings.accent',
          'settings.customCss'
        ].some(x => el.dataset.bind === x)
      ) {
        if (U.setBound(el.dataset.bind, el.value, el.dataset.type) !== false) U.applyTheme();
      } else if (el.dataset.type !== 'json') U.setBound(el.dataset.bind, el.value, el.dataset.type);
    });
    // Command palette
    D.cmdInput.addEventListener('input', () => renderCmd(D.cmdInput.value));
    D.cmdInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        U.closeCmd();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cmdSel = Math.max(0, Math.min(cmdItems.length - 1, cmdSel + (e.key === 'ArrowDown' ? 1 : -1)));
        D.cmdList.querySelectorAll('.cmd-item').forEach((b, i) => b.classList.toggle('sel', i === cmdSel));
        return;
      }
      if (e.key === 'Enter') execCmd(cmdSel);
    });
    D.cmdList.onclick = e => {
      const b = e.target.closest('[data-cmd]');
      if (b) execCmd(+b.dataset.cmd);
    };
    // Artifact
    // Selection popover
    let selBox = null;
    document.addEventListener('mouseup', e => {
      setTimeout(() => {
        const sel = window.getSelection(),
          text = sel && String(sel).trim();
        if (selBox) {
          selBox.remove();
          selBox = null;
        }
        if (!text || text.length < 2 || !e.target.closest('.msg-bubble')) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        selBox = document.createElement('div');
        selBox.className = 'popover';
        selBox.style.cssText = `position:fixed;z-index:65;left:${Math.max(8, rect.left)}px;top:${Math.max(8, rect.bottom + 6)}px;display:flex;gap:2px;padding:4px`;
        selBox.innerHTML = `<button class="mini-btn" data-sel="copy">复制</button><button class="mini-btn" data-sel="translate">翻译</button><button class="mini-btn" data-sel="ask">追问</button>`;
        document.body.appendChild(selBox);
        selBox.onclick = ev => {
          const b = ev.target.closest('[data-sel]');
          if (!b) return;
          const a = b.dataset.sel;
          if (a === 'copy') AI.copy(text);
          if (a === 'translate')
            AI.complete(AI.langPrompt(TRANSLATION_DIRECTIVE.zh, TRANSLATION_DIRECTIVE.en), text)
              .then(r => U.modal({ title: AI.t('translate'), body: `<div class="md">${AI.Render.markdown(r)}</div>` }))
              .catch(err => U.toast(err.message, 'err'));
          if (a === 'ask') {
            D.input.value = `关于这段内容：\n「${text.slice(0, 400)}」\n\n我的问题是：`;
            U.autoGrow();
            U.saveDraft();
            D.input.focus();
          }
          selBox.remove();
          selBox = null;
        };
      }, 10);
    });
    // Starter prompt click handler, previously missing and therefore inert.
    D.starterPrompts.onclick = e => {
      const b = e.target.closest('[data-starter]');
      if (!b) return;
      const s = AI.STARTERS[+b.dataset.starter];
      if (!s) return;
      D.input.value = AI.field(s, 'prompt');
      U.autoGrow();
      U.saveDraft();
      D.input.focus();
    };
    // Sidebar footer shortcuts
    const sb = document.querySelector('.sidebar-bottom');
    if (sb)
      sb.onclick = e => {
        const b = e.target.closest('[data-open]');
        if (b) {
          U.openDrawer(b.dataset.open);
          D.sidebar.classList.remove('open');
          D.sidebarOverlay.classList.remove('show');
        }
      };

    /* ---------- Right-hand Inspector ---------- */
    D.btnInspector.onclick = () => U.setInspector(D.inspector.hidden);
    D.btnCloseInspector.onclick = () => U.setInspector(false);
    D.btnInspectorSettings.onclick = () => U.openDrawer('models');
    D.inspectorTabs.onclick = e => {
      const b = e.target.closest('[data-insp-tab]');
      if (!b) return;
      AI.state.settings.inspectorTab = b.dataset.inspTab;
      AI.save();
      U.renderInspector();
    };
    const formHandler = container => {
      container.addEventListener('click', e => {
        const tg = e.target.closest('[data-toggle]');
        if (tg) {
          U.toggleBound(tg.dataset.toggle);
          U.applyTheme();
          U.renderInspector();
          return;
        }
        const ac = e.target.closest('[data-do]');
        if (ac) {
          U.drawerAction(ac.dataset.do, ac.dataset, ac);
          U.renderInspector();
          return;
        }
        const c = e.target.closest('[data-insp-click]');
        if (c) AI.emit('inspector-click', { key: c.dataset.inspClick, el: c, root: container });
      });
      container.addEventListener('change', e => {
        const el = e.target.closest('[data-bind]');
        if (!el) return;
        if (U.setBound(el.dataset.bind, el.value, el.dataset.type) !== false) {
          U.applyTheme();
          U.updateLabels();
          U.updateCtxMeter();
          U.renderInspector();
        }
      });
      container.addEventListener('input', e => {
        const el = e.target.closest('[data-bind]');
        if (!el) return;
        if (el.tagName === 'SELECT' || el.type === 'color' || el.dataset.type === 'json') return;
        if (U.setBound(el.dataset.bind, el.value, el.dataset.type) !== false) U.applyTheme();
        const lbl = el.parentElement && el.parentElement.querySelector('b[data-range-val]');
        if (lbl) lbl.textContent = el.value;
      });
    };
    formHandler(D.inspectorBody);

    /* ---------- Mobile bottom bar, overflow menu and full-screen editor ---------- */
    if (D.mobileTabbar)
      D.mobileTabbar.onclick = e => {
        const b = e.target.closest('[data-mobile]');
        if (!b) return;
        const a = b.dataset.mobile;
        if (a === 'new') AI.newChat();
        if (a === 'history') {
          D.sidebar.classList.add('open');
          D.sidebarOverlay.classList.add('show');
        }
        if (a === 'inspector') U.setInspector(true);
        if (a === 'commands') U.openCmd();
      };
    if (D.btnMore)
      D.btnMore.onclick = e =>
        U.popover(e.currentTarget, [
          { icon: AI.icon('download'), label: '导出 Markdown', onClick: () => U.exportMarkdown() },
          { icon: AI.icon('database'), label: '导出 JSON / HTML / TXT / JSONL', onClick: () => U.openDrawer('backup') },
          { icon: AI.icon('compress'), label: '压缩上下文', onClick: () => AI.compressContext() },
          { icon: AI.icon('fork'), label: '分支树', onClick: () => U.branchTree() },
          { sep: true },
          { icon: AI.icon('sliders'), label: '会话参数覆盖…', onClick: () => U.openDrawer('models') },
          { icon: AI.icon('folder'), label: '移动到文件夹…', onClick: () => U.openDrawer('layout') },
          { sep: true },
          {
            icon: AI.icon('erase'),
            label: '清空消息',
            onClick: () =>
              U.confirm(AI.t('clear'), AI.t('confirmClear'), () => {
                AI.clearConv(AI.currentConv());
                U.renderAll();
              })
          },
          {
            icon: AI.icon('trash'),
            label: '删除会话',
            onClick: () => U.confirm(AI.t('delete'), AI.t('confirmDelete'), () => AI.deleteConv(AI.state.currentId))
          }
        ]);
    const tMore = $('btnToolsMore');
    if (tMore)
      tMore.onclick = () => {
        const on = document.body.classList.toggle('tools-expanded');
        tMore.classList.toggle('on', on);
        tMore.setAttribute('aria-expanded', String(on));
        const span = tMore.querySelector('span');
        if (span) span.textContent = on ? '收起' : '更多';
      };
    if (D.btnFullEdit)
      D.btnFullEdit.onclick = () =>
        U.modal({
          title: '编辑消息',
          wide: true,
          body: `<textarea class="textarea" id="fullEditArea" style="min-height:46vh" placeholder="输入消息…">${AI.esc(D.input.value)}</textarea>
      <p class="tiny" style="margin-top:8px">Ctrl/⌘ + Enter 可直接发送</p>`,
          actions: [
            { label: AI.t('cancel'), cls: 'ghost' },
            {
              label: '写回输入框',
              cls: 'ghost',
              onClick: root => {
                D.input.value = root.querySelector('#fullEditArea').value;
                U.autoGrow();
                U.saveDraft();
              }
            },
            {
              label: '直接发送',
              cls: 'primary',
              onClick: root => {
                D.input.value = root.querySelector('#fullEditArea').value;
                U.autoGrow();
                U.saveDraft();
                setTimeout(() => AI.send(), 30);
              }
            }
          ],
          onOpen: root => {
            const ta = root.querySelector('#fullEditArea');
            ta.focus();
            ta.addEventListener('keydown', ev => {
              if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
                ev.preventDefault();
                U.closeModal();
                D.input.value = ta.value;
                setTimeout(() => AI.send(), 20);
              }
            });
          }
        });
    if (D.btnDrawerExpand) D.btnDrawerExpand.onclick = () => D.drawer.classList.toggle('wide');

    // Composer token estimate
    D.input.addEventListener('input', () => {
      const st = AI.state.settings;
      D.draftInfo.textContent =
        st.inputTokenEstimate && D.input.value
          ? `${D.input.value.length} 字符 · ≈${AI.estimateTokens(D.input.value)} tokens`
          : '';
    });

    /* ---------- Configurable global shortcuts ---------- */
    const matchShortcut = (e, spec) => {
      if (!spec) return false;
      const parts = String(spec)
        .toLowerCase()
        .split('+')
        .map(x => x.trim());
      const key = parts[parts.length - 1] === 'esc' ? 'escape' : parts[parts.length - 1];
      const mod = e.ctrlKey || e.metaKey;
      if (parts.includes('mod') !== mod) return false;
      if (parts.includes('shift') !== !!e.shiftKey) return false;
      if (parts.includes('alt') !== !!e.altKey) return false;
      let ek = e.key.toLowerCase();
      if (ek === ' ') ek = 'space';
      if (ek === 'esc') ek = 'escape';
      return ek === key;
    };
    document.addEventListener('keydown', e => {
      const sc = AI.state.shortcuts || {};
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (matchShortcut(e, sc.command)) {
        e.preventDefault();
        U.openCmd();
        return;
      }
      if (matchShortcut(e, sc.newChat)) {
        e.preventDefault();
        AI.newChat();
        return;
      }
      if (matchShortcut(e, sc.copyAll)) {
        e.preventDefault();
        AI.copyAll();
        return;
      }
      if (matchShortcut(e, sc.search)) {
        e.preventDefault();
        U.globalSearch();
        return;
      }
      if (matchShortcut(e, sc.sidebar)) {
        e.preventDefault();
        D.sidebar.classList.toggle('open');
        D.sidebarOverlay.classList.toggle('show', D.sidebar.classList.contains('open'));
        return;
      }
      if (matchShortcut(e, sc.inspector)) {
        e.preventDefault();
        U.setInspector(D.inspector.hidden);
        return;
      }
      if (matchShortcut(e, sc.fullEdit)) {
        e.preventDefault();
        D.btnFullEdit.click();
        return;
      }
      if (matchShortcut(e, sc.stop) || e.key === 'Escape') {
        if (!D.cmdPalette.hidden) {
          U.closeCmd();
          return;
        }
        if (!D.modalRoot.hidden) {
          U.closeModal();
          return;
        }
        if (!D.drawerRoot.hidden) {
          U.closeDrawer();
          return;
        }
        if (!D.popover.hidden) {
          U.closePopover();
          return;
        }
        if (!D.inspector.hidden && window.innerWidth <= 1020) {
          U.setInspector(false);
          return;
        }
        if (D.sidebar.classList.contains('open')) {
          D.sidebar.classList.remove('open');
          D.sidebarOverlay.classList.remove('show');
          return;
        }
        if (document.body.dataset.generating === '1') {
          e.preventDefault();
          AI.stop();
          return;
        }
      }
    });
    // Code actions outside the message area, for example inside a modal
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-code-action]');
      if (!b || b.closest('#messages')) return;
      const wrap = b.closest('.code-block');
      if (!wrap) return;
      if (b.dataset.codeAction === 'copy') {
        AI.copy(wrap.dataset.code || '');
      }
      if (b.dataset.codeAction === 'preview') U.openArtifact(wrap.dataset.code || '', wrap.dataset.lang || '');
    });
    // External updates
    AI.on('external-update', () => {
      U.renderConvList();
      U.updateLabels();
    });
    AI.on('theme-changed', () => {
      if (!D.inspector.hidden) U.renderInspector();
    });
    if (window.matchMedia)
      matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (AI.state.settings.mode === 'auto') U.applyTheme();
      });
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 1020 && !D.inspector.hidden && AI.state.ui.inspectorOpen === false)
        U.setInspector(false);
    });
  };

  U.init = function () {
    U.cache();
    U.bind();
    U.renderAll();
    const mobile = window.innerWidth <= 1020;
    U.setInspector(!mobile && AI.state.ui.inspectorOpen !== false);
  };
})();
