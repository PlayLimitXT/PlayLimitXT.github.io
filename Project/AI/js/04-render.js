/* ============================================================
   04-render.js - Markdown, code, formulas, diagrams and message components
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI;
  const R = (AI.Render = {});

  /* ---------------- Sanitisation ---------------- */
  R.sanitize = function (html) {
    /* An <img src="x"> in model output triggers a useless same-origin request and
   a 404. Only http(s), data:image and blob sources are retained; other src
   attributes are removed. */
    const okSrc = s => /^(?:https?:|data:image\/|blob:)/i.test(String(s || '').trim());
    // Inline styles could let model output render a position:fixed spoofed interface, so they are stripped as well.
    if (window.DOMPurify) {
      if (!R._purifyHooked) {
        R._purifyHooked = true;
        try {
          DOMPurify.addHook('afterSanitizeAttributes', node => {
            if (node.nodeName === 'IMG' && !okSrc(node.getAttribute('src'))) node.removeAttribute('src');
          });
        } catch (e) {}
      }
      return DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input'],
        FORBID_ATTR: ['style']
      });
    }
    try {
      const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
      doc
        .querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,video,audio')
        .forEach(n => n.remove());
      doc.querySelectorAll('*').forEach(n => {
        Array.from(n.attributes).forEach(a => {
          /* The fallback sanitizer must not reject every data: URI. User attachments and
   generated images use data:image/...; removing them when DOMPurify is
   unavailable would drop all images. Only script schemes and non-image data
   URIs are blocked. */
          if (
            /^on/i.test(a.name) ||
            a.name === 'style' ||
            /^(?:javascript|vbscript):/i.test(a.value) ||
            /^data:(?!image\/)/i.test(a.value)
          )
            n.removeAttribute(a.name);
        });
        if (n.tagName === 'A') {
          n.setAttribute('target', '_blank');
          n.setAttribute('rel', 'noopener noreferrer');
        }
      });
      doc.querySelectorAll('img').forEach(im => {
        if (!okSrc(im.getAttribute('src'))) im.removeAttribute('src');
      });
      return doc.body.firstChild.innerHTML;
    } catch (e) {
      return AI.esc(html);
    }
  };

  /* ---------------- Lightweight Markdown fallback ---------------- */
  function inline(s) {
    let x = AI.esc(s);
    x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
    x = x.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    x = x.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    x = x.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    x = x.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return x;
  }
  function simpleMarkdown(src) {
    const lines = String(src || '').split('\n'),
      out = [];
    let i = 0,
      listType = null;
    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };
    while (i < lines.length) {
      const line = lines[i];
      const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
      if (fence) {
        closeList();
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        out.push(`<pre><code class="language-${AI.esc(lang)}">${AI.esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if (/^\s*$/.test(line)) {
        closeList();
        out.push('');
        i++;
        continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        closeList();
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        i++;
        continue;
      }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        i++;
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        closeList();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + inline(buf.join('\n')).replace(/\n/g, '<br>') + '</blockquote>');
        continue;
      }
      const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (li) {
        const type = /\d/.test(li[1]) ? 'ol' : 'ul';
        if (listType !== type) {
          closeList();
          out.push(`<${type}>`);
          listType = type;
        }
        out.push('<li>' + inline(li[2]) + '</li>');
        i++;
        continue;
      }
      // Tables
      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        closeList();
        const cells = l =>
          l
            .replace(/^\s*\|/, '')
            .replace(/\|\s*$/, '')
            .split('|')
            .map(c => c.trim());
        const head = cells(line);
        i += 2;
        let html = '<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
          html +=
            '<tr>' +
            cells(lines[i])
              .map(c => `<td>${inline(c)}</td>`)
              .join('') +
            '</tr>';
          i++;
        }
        out.push(html + '</tbody></table>');
        continue;
      }
      closeList();
      const para = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|>|```|\s*([-*+]|\d+\.)\s)/.test(lines[i]) &&
        !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    closeList();
    return out.join('\n');
  }

  /* ---------------- Escape-sequence normalisation ----------------
   Some relays return line breaks as literal \n, \t or \r\n instead of real
   characters, which renders as backslash-letter pairs and loses the breaks.
   Fenced and inline code are left untouched so examples such as printf("\n")
   are not modified. This can be disabled in General settings. */
  R.unescapeLiteral = function (text) {
    const s = String(text || '');
    if (AI.state.settings && AI.state.settings.unescapeLiteral === false) return s;
    if (s.indexOf('\\') < 0) return s;
    const decode = function (p) {
      return p
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '');
    };
    const parts = s.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
    return parts
      .map(function (p) {
        if (!p) return p;
        if (p.indexOf('```') === 0) {
          // Real newlines inside normal code blocks are preserved, so literal \n remains
          // intact in examples such as printf("\n");
          // If a whole block is separated only by literal \n (the gateway did not decode
          // line breaks), restore them; otherwise marked cannot recognise the fence.
          return p.indexOf('\n') < 0 && /\\n/.test(p) ? decode(p) : p;
        }
        if (p.indexOf('`') === 0) return p; // Inline code is left untouched
        return decode(p);
      })
      .join('');
  };

  /* ---------------- Markdown entry point ---------------- */
  R.markdown = function (text, streaming) {
    let src = R.unescapeLiteral(String(text || ''));
    if (streaming) {
      const fences = (src.match(/```/g) || []).length;
      if (fences % 2 === 1) src += '\n```'; // Close unterminated code fences first so the remaining text is not parsed as code.
    }
    let html;
    if (window.marked) {
      try {
        html = marked.parse(src, { gfm: true, breaks: true, mangle: false, headerIds: false });
      } catch (e) {
        html = simpleMarkdown(src);
      }
    } else html = simpleMarkdown(src);
    return R.sanitize(html);
  };
  /* Streaming uses full Markdown with adaptive incremental re-parsing instead of raw text nodes. */
  R.streamHtml = function (text) {
    return '<div class="md md-stream">' + R.markdown(text, true) + '</div>';
  };

  /* ---------------- Optional enhancements: asynchronous, on demand ----------------
   Static layout, copy buttons and line numbers complete immediately; hljs,
   KaTeX and Mermaid are fetched only when used. */
  function highlightCode(code) {
    if (code.dataset.hljsDone) return;
    if (window.hljs) {
      try {
        hljs.highlightElement(code);
        code.dataset.hljsDone = '1';
      } catch (e) {
        try {
          if (AI.reportError) AI.reportError('highlight', e && e.message);
        } catch (_) {}
      }
      return;
    }
    if (AI._libState.hljs === 'fail') return;
    AI.loadLib('hljs').then(ok => {
      if (!ok || !code.isConnected || code.dataset.hljsDone) return;
      try {
        hljs.highlightElement(code);
        code.dataset.hljsDone = '1';
      } catch (e) {}
    });
  }
  function applyKatex(root) {
    try {
      renderMathInElement(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
      });
    } catch (e) {}
  }
  function renderMathIn(root) {
    if (!/\$\$|\\\(|\\\[|\$[^$\n]+\$/.test(root.textContent || '')) return;
    if (window.renderMathInElement) {
      applyKatex(root);
      return;
    }
    if (AI._libState.katex === 'fail') return;
    AI.loadLib('katex').then(ok => {
      if (ok && root.isConnected) applyKatex(root);
    });
  }
  function drawMermaid(root, codes) {
    codes.forEach(code => {
      if (code.dataset.mmdDone) return;
      code.dataset.mmdDone = '1';
      const src = code.textContent,
        box = document.createElement('div');
      box.className = 'mermaid-box';
      box.textContent = '图表渲染中…';
      const target = code.closest('.code-block') || code.parentElement;
      target.parentElement.insertBefore(box, target);
      target.style.display = 'none';
      const id = 'mmd' + AI.uid();
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: document.body.classList.contains('light') ? 'default' : 'dark',
          securityLevel: 'strict'
        });
        Promise.resolve(mermaid.render(id, src))
          .then(r => {
            box.innerHTML = R.sanitize(r.svg || r);
          })
          .catch(e => {
            box.textContent = '图表解析失败：' + e.message;
          });
      } catch (e) {
        box.textContent = '图表解析失败：' + e.message;
      }
    });
  }
  function renderMermaidIn(root) {
    const codes = root.querySelectorAll('pre > code.language-mermaid, code.language-mermaid');
    if (!codes.length) return;
    if (window.mermaid) {
      drawMermaid(root, codes);
      return;
    }
    if (AI._libState.mermaid === 'fail') return;
    AI.loadLib('mermaid').then(ok => {
      if (ok && root.isConnected) drawMermaid(root, codes);
    });
  }

  /* ---------------- Code block, formula and diagram decoration ---------------- */
  R.decorate = function (root, opts) {
    if (!root) return;
    opts = opts || {};
    // Code blocks
    root.querySelectorAll('pre > code').forEach(code => {
      if (code.parentElement.classList.contains('code-block')) return;
      const pre = code.parentElement,
        wrap = document.createElement('div');
      wrap.className = 'code-block';
      pre.parentElement.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const lang =
        (code.className.match(/language-([\w+-]+)/) || [])[1] ||
        (/^\w+$/.test(code.className) ? code.className : 'text');
      const lineCount = code.textContent.split('\n').length;
      const bar = document.createElement('div');
      bar.className = 'code-bar';
      bar.innerHTML =
        `<span>${AI.esc(lang)}</span><span class="flex-spacer"></span>` +
        `<span class="code-lines">${lineCount} 行</span>` +
        `<button data-code-action="copy"><svg class="ico"><use href="#i-copy"/></svg> 复制</button>` +
        (opts.artifact !== false
          ? `<button data-code-action="preview"><svg class="ico"><use href="#i-expand"/></svg> 预览</button>`
          : '') +
        `<button data-code-action="download"><svg class="ico"><use href="#i-download"/></svg> 下载</button>`;
      wrap.insertBefore(bar, pre);
      wrap.dataset.code = code.textContent;
      wrap.dataset.lang = lang;
      if (!code.className) code.className = 'language-' + lang;
      highlightCode(code);
      if (AI.state.settings.lineNumbers) {
        const body = document.createElement('div');
        body.className = 'code-body';
        wrap.insertBefore(body, pre);
        body.appendChild(pre);
        const gutter = document.createElement('div');
        gutter.className = 'code-gutter';
        gutter.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        body.insertBefore(gutter, pre);
      }
      // Synchronised scrolling: the gutter follows horizontal and vertical code-block scrolling.
      wrap.querySelector('pre').addEventListener('scroll', e => {
        const g = wrap.querySelector('.code-gutter');
        if (g) g.scrollTop = e.target.scrollTop;
      });
    });
    // Math and Mermaid rendering: final state only, with asynchronous on-demand loading.
    if (!opts.streaming) {
      renderMathIn(root);
      renderMermaidIn(root);
    }
    // External links
    root.querySelectorAll('a[href]').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    // Click-to-preview images
    root.querySelectorAll('img').forEach(img => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => AI.emit('image-preview', { src: img.src }));
    });
  };

  /* ---------------- Fragment components ---------------- */
  R.attachments = function (list) {
    if (!list || !list.length) return '';
    return (
      '<div class="msg-attachments">' +
      list
        .map(a => {
          if (a.type === 'image' && a.data)
            return `<img src="${AI.esc(a.data)}" alt="${AI.esc(a.name)}" loading="lazy">`;
          return `<span class="file-pill" title="${AI.esc(a.name)}"><svg class="ico"><use href="#i-paperclip"/></svg> <span>${AI.esc(a.name)}</span></span>`;
        })
        .join('') +
      '</div>'
    );
  };
  /* Collapsed reasoning shows a one-line activity summary: Thinking... plus
   counts for reasoning segments, tool calls and searches. The full text is
   always written to .reasoning-body, which is hidden until the header is
   clicked. */
  R.isSearchTool = function (name) {
    return /search|web_?search|fetch_url|browse|news|wiki|检索|搜索|网页|google|bing/i.test(String(name || ''));
  };
  R.activityCounts = function (n) {
    const tl = Array.isArray(n.timeline) ? n.timeline : [];
    const tools = n.toolCalls || [];
    const tlR = tl.filter(b => b.type === 'reasoning'),
      tlT = tl.filter(b => b.type === 'tool');
    let reason = tlR.length;
    if (!reason && n.reasoning) reason = 1;
    const toolCount = Math.max(tlT.length, tools.length);
    const nameOf = b => {
      const t = tools.find(x => x.id === b.id);
      return (t && t.name) || b.name || '';
    };
    const searchCount = Math.max(
      tools.filter(t => R.isSearchTool(t.name)).length,
      tlT.filter(b => R.isSearchTool(nameOf(b))).length
    );
    return { reason, tools: toolCount, search: searchCount };
  };
  R.summaryText = function (c, streaming) {
    const en = AI.state.settings.lang === 'en';
    const bits = [];
    if (streaming) bits.push(AI.t('thinking') + '…');
    if (c.reason) bits.push(en ? `${c.reason} ${c.reason > 1 ? 'thoughts' : 'thought'}` : `思考 ${c.reason} 段`);
    if (c.tools) bits.push(en ? `${c.tools} ${c.tools > 1 ? 'tool calls' : 'tool call'}` : `工具 ${c.tools} 次`);
    if (c.search) bits.push(en ? `${c.search} ${c.search > 1 ? 'searches' : 'search'}` : `搜索 ${c.search} 次`);
    return bits.join(' · ') || (streaming ? AI.t('thinking') : AI.t('thought'));
  };
  /* Refresh every reasoning header during streaming; a single message may contain several reasoning segments. */
  R.refreshActivity = function (row) {
    const a = row._activity || { reason: 0, tools: 0, search: 0 };
    row.querySelectorAll('[data-reasoning]').forEach(box => {
      const s = box.querySelector('[data-reasoning-summary]');
      if (s) s.textContent = R.summaryText(a, box.dataset.streaming === '1');
    });
  };
  R.reasoningBox = function (text, streaming, open, counts) {
    if (!text && !streaming) return '';
    const show = open === true; // Collapsed by default
    const c = counts || { reason: 0, tools: 0, search: 0 };
    return `<div class="reasoning-box" data-reasoning ${streaming ? 'data-streaming="1"' : ''}>
    <div class="reasoning-head" data-action="toggle-reasoning" role="button" tabindex="0" aria-expanded="${show}">
      ${streaming ? '<i class="spin"></i>' : ''}<b>${AI.t('thought')}</b>
      <span class="reasoning-summary tiny" data-reasoning-summary>${AI.esc(R.summaryText(c, streaming))}</span>
      <span class="reasoning-chevron">${show ? AI.icon('chevron-up') : AI.icon('chevron')}</span>
    </div>
    <div class="reasoning-body" ${show ? '' : 'hidden'}>${AI.esc(text || '')}</div>
  </div>`;
  };
  R.toolCard = function (call, status, result, open) {
    const cls = status === 'done' ? 'done' : status === 'fail' ? 'fail' : '';
    const show = open === true;
    return `<div class="tool-card ${cls}" data-tool="${AI.esc(call.id || AI.uid())}">
    <div class="tool-head" data-action="toggle-tool" role="button" tabindex="0" aria-expanded="${show}"><i class="dot"></i> <b>${AI.esc(call.name)}</b> <small>${status === 'running' ? '执行中…' : status === 'fail' ? '失败' : '完成'}</small><span class="tool-chevron">${show ? AI.icon('chevron-up') : AI.icon('chevron')}</span></div>
    <div class="tool-body" ${show ? '' : 'hidden'}>${AI.esc('参数：' + JSON.stringify(call.args || {}).slice(0, 600))}${result != null ? '\n\n结果：' + AI.esc(String(result).slice(0, 2000)) : ''}</div>
  </div>`;
  };
  R.sources = function (list) {
    if (!list || !list.length) return '';
    const seen = new Set();
    return (
      '<div class="sources-row">' +
      list
        .filter(s => {
          if (!s.url || seen.has(s.url)) return false;
          seen.add(s.url);
          return true;
        })
        .slice(0, 8)
        .map(
          (s, i) =>
            `<a class="source-chip" href="${AI.esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${AI.esc(s.content || '')}">[${i + 1}] <span>${AI.esc(s.title || AI.hostname(s.url))}</span></a>`
        )
        .join('') +
      '</div>'
    );
  };
  R.images = function (list) {
    if (!list || !list.length) return '';
    return (
      '<div class="msg-attachments">' +
      list.map(u => `<img src="${AI.esc(u)}" alt="generated" loading="lazy">`).join('') +
      '</div>'
    );
  };
  R.suggestions = function (list) {
    if (!list || !list.length) return '';
    return (
      '<div class="suggestions">' +
      list.map(s => `<button data-action="suggestion" data-extra="${AI.esc(s)}">${AI.esc(s)}</button>`).join('') +
      '</div>'
    );
  };
  R.resumeNotice = function (n) {
    const en = AI.state.settings.lang === 'en';
    const msg = n.truncated
      ? en
        ? 'The stream ended without a completion signal — output may be incomplete.'
        : '连接提前结束，输出可能不完整'
      : en
        ? 'Generation was stopped.'
        : '生成已停止';
    return (
      `<div class="msg-resume"><svg class="ico"><use href="#i-info"/></svg><span>${AI.esc(msg)}</span>` +
      `<button class="mini-btn" data-action="continue" data-node="${AI.esc(n.id)}">${en ? 'Continue' : '继续生成'}</button></div>`
    );
  };
  R.stats = function (n) {
    if (!n || !n.stats) return '';
    const s = n.stats,
      bits = [];
    const exact = s.usageSource === 'api';
    if (s.in || s.out) bits.push(`${exact ? '' : '≈'}↑ ${AI.fmtNum(s.in)} ↓ ${AI.fmtNum(s.out)} ${AI.t('tokens')}`);
    if (exact) bits.push(AI.state.settings.lang === 'en' ? 'API count' : 'API 计数');
    if (s.speed) bits.push(`${s.speed.toFixed(1)} tok/s`);
    if (s.duration) bits.push(`${(s.duration / 1000).toFixed(1)}s`);
    if (s.cached) bits.push(`cached ${AI.fmtNum(s.cached)}`);
    if (s.reasoningTokens) bits.push(`reasoning ${AI.fmtNum(s.reasoningTokens)}`);
    if (s.cost) bits.push('≈ ' + AI.money(s.cost) + (AI.state.settings.lang === 'en' ? ' (cost est.)' : ' (费用估算)'));
    if (s.rounds) bits.push(`工具 ${s.rounds} 轮`);
    return bits.length
      ? '<div class="msg-stats">' + bits.map(b => `<span>${AI.esc(b)}</span>`).join('') + '</div>'
      : '';
  };
  R.actions = function (n, conv) {
    const id = n.id,
      isUser = n.role === 'user';
    const sibs = AI.siblingsOf(conv, id),
      idx = sibs.findIndex(x => x.id === id);
    const branch =
      sibs.length > 1
        ? `<span class="branch-nav">
      <button data-action="branch-prev" data-node="${id}" title="上一版本">‹</button>
      <b>${idx + 1}/${sibs.length}</b>
      <button data-action="branch-next" data-node="${id}" title="下一版本">›</button></span>`
        : '';
    const btns = [
      `<button data-action="copy" data-node="${id}" title="${AI.t('copy')}"><svg class="ico"><use href="#i-copy"/></svg> ${AI.t('copy')}</button>`,
      isUser
        ? `<button data-action="edit" data-node="${id}" title="${AI.t('edit')}"><svg class="ico"><use href="#i-edit"/></svg> ${AI.t('edit')}</button>`
        : `<button data-action="regenerate" data-node="${id}" title="${AI.t('regenerate')}"><svg class="ico"><use href="#i-refresh"/></svg> ${AI.t('regenerate')}</button>`,
      branch,
      `<button data-action="star" data-node="${id}" class="${n.starred ? 'on' : ''}" title="${AI.t('star')}"><svg class="ico"><use href="#i-star"/></svg></button>`,
      `<button data-action="pin-msg" data-node="${id}" class="${n.pinned ? 'on' : ''}" title="固定到上下文（不参与裁剪）"><svg class="ico"><use href="#i-pin"/></svg></button>`,
      `<button data-action="fork" data-node="${id}" title="从此处派生新会话"><svg class="ico"><use href="#i-fork"/></svg> 派生</button>`,
      `<button data-action="fold" data-node="${id}" title="折叠/展开长内容"><svg class="ico"><use href="#i-chevron"/></svg> 折叠</button>`,
      `<button data-action="speak" data-node="${id}" title="${AI.t('speak')}"><svg class="ico"><use href="#i-volume"/></svg></button>`,
      !isUser
        ? `<button data-action="translate" data-node="${id}" title="${AI.t('translate')}"><svg class="ico"><use href="#i-translate"/></svg></button>`
        : '',
      !isUser
        ? `<button data-action="feedback" data-node="${id}" data-extra="up" class="${n.feedback === 'up' ? 'on' : ''}"><svg class="ico"><use href="#i-thumb-up"/></svg></button>`
        : '',
      !isUser
        ? `<button data-action="feedback" data-node="${id}" data-extra="down" class="${n.feedback === 'down' ? 'on' : ''}"><svg class="ico"><use href="#i-thumb-down"/></svg></button>`
        : '',
      `<button data-action="delete-node" data-node="${id}" title="${AI.t('delete')}"><svg class="ico"><use href="#i-trash"/></svg></button>`
    ]
      .filter(Boolean)
      .join('');
    return `<div class="msg-actions">${btns}</div>`;
  };

  /* ---------------- Full message row ---------------- */
  R.message = function (n, conv, opts) {
    opts = opts || {};
    const isUser = n.role === 'user',
      isErr = !!n.error;
    const row = document.createElement('div');
    row.className =
      'msg-row ' + (isUser ? 'user' : 'assistant') + (isErr ? ' error' : '') + (n.pinned ? ' pinned-msg' : '');
    row.dataset.node = n.id;
    if (opts.streaming) row.classList.add('msg-enter');
    const as = AI.state.assistants.find(a => a.id === conv.assistantId) || AI.currentAssistant();
    const st = AI.state.settings;
    const name = isUser ? st.userName || (st.lang === 'en' ? 'You' : '你') : as.name || 'AI';
    const avatar = isUser
      ? st.userEmoji
        ? AI.esc(st.userEmoji)
        : '<svg class="ico"><use href="#i-user"/></svg>'
      : '<svg class="ico"><use href="#i-sparkle"/></svg>';
    const badges = [];
    if (!isUser && n.model) badges.push(`<span class="msg-badge">${AI.esc(n.model)}</span>`);
    if (n.role === 'tool') badges.push(`<span class="msg-badge">tool</span>`);
    if (n.summary) badges.push(`<span class="msg-badge">summary</span>`);
    if (n.pinned) badges.push(`<span class="msg-badge">pinned</span>`);

    row.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-main">
      <div class="msg-head"><b>${AI.esc(name)}</b><span>${AI.fmtTime(n.createdAt)}</span>${badges.join('')}</div>
      <div class="msg-bubble">
        ${R.attachments(n.attachments)}
        ${R.timelineBlocks(n, opts.streaming)}
        ${R.images(n.images)}
        ${R.sources(n.sources)}
        ${(n.truncated || n.stopped) && !isErr ? R.resumeNotice(n) : ''}
        ${isErr ? `<div class="msg-error"><div style="color:var(--err);font-size:12px;margin-top:8px"><svg class="ico"><use href="#i-info"/></svg> ${AI.esc(n.error)}</div><div class="form-actions" style="margin-top:8px"><button class="mini-btn" data-action="retry" data-node="${n.id}">${AI.t('regenerate')}</button><button class="mini-btn" data-action="retry-model" data-node="${n.id}">${AI.state.settings.lang === 'en' ? 'Retry with another model' : '换模型重试'}</button></div></div>` : ''}
        ${R.suggestions((AI.currentAssistant().quickReplies || []).slice(0, 4))}
      </div>
      ${R.stats(n)}
      ${R.actions(n, conv)}
    </div>`;
    row._nodeId = n.id;
    R.setBody(row, n, opts.streaming);
    return row;
  };
  /* Timeline: reasoning, tool calls and text follow their true emission order; interleaved multi-round agent events are no longer collapsed into three blocks. */
  R.textBlocks = function (n) {
    if (Array.isArray(n.timeline) && n.timeline.length) {
      const t = n.timeline.filter(b => b.type === 'text').map(b => b.text || '');
      return t.length ? t : [''];
    }
    return [n.content || ''];
  };
  R.timelineBlocks = function (n, streaming) {
    const st = AI.state.settings;
    const show = st.showReasoning !== false; // When disabled, the reasoning block is not rendered at all.
    const exp = st.reasoningExpanded === true; // v3.3: collapsed by default unless the user explicitly enables expansion.
    const tl = Array.isArray(n.timeline) && n.timeline.length ? n.timeline : null;
    const counts = R.activityCounts(n);
    const blocks = [];
    if (tl) {
      tl.forEach(b => {
        if (b.type === 'reasoning') {
          if (show) blocks.push(R.reasoningBox(b.text || '', false, exp, counts));
        } else if (b.type === 'tool') {
          const c = (n.toolCalls || []).find(x => x.id === b.id) || {
            id: b.id,
            name: b.name || 'tool',
            args: {},
            status: 'done',
            result: ''
          };
          blocks.push(R.toolCard(c, c.status || 'done', c.result || ''));
        } else if (b.type === 'text') {
          blocks.push('<div class="md-holder"></div>');
        }
      });
      if (!blocks.some(x => x.indexOf('md-holder') >= 0)) blocks.push('<div class="md-holder"></div>');
    } else {
      if (show && n.reasoning) blocks.push(R.reasoningBox(n.reasoning, !!streaming, exp, counts));
      (n.toolCalls || []).forEach(t => blocks.push(R.toolCard(t, t.status || 'done', t.result || '')));
      blocks.push('<div class="md-holder"></div>');
    }
    return '<div class="bubble-timeline">' + blocks.join('') + '</div>';
  };
  R.setBody = function (row, n, streaming) {
    const holders = row.querySelectorAll('.bubble-timeline .md-holder');
    if (!holders.length) return;
    const texts = R.textBlocks(n),
      plain = n.role === 'user';
    holders.forEach((h, i) => {
      const seg = texts[i] || '';
      if (streaming) {
        h.innerHTML = R.streamHtml(seg);
        const md = h.querySelector('.md');
        if (md) {
          md._raw = seg;
          md._everRendered = !!seg;
        }
        if (i === holders.length - 1) h.insertAdjacentHTML('beforeend', '<span class="cursor-blink"></span>');
      } else {
        h.innerHTML = plain
          ? `<div class="md msg-text-plain">${AI.esc(seg)}</div>`
          : `<div class="md">${R.markdown(seg)}</div>`;
        R.decorate(h, { streaming: false });
      }
    });
  };
  R.finalize = function (row, n) {
    row.querySelectorAll('.md-holder').forEach(h => R.cancelStreamRender(h));
    if ((n.truncated || n.stopped) && !row.querySelector('.msg-resume') && !row.querySelector('.msg-error')) {
      const b = row.querySelector('.msg-bubble');
      if (b) b.insertAdjacentHTML('beforeend', R.resumeNotice(n));
    }
    // If an upstream failure leaves node.content empty, fall back to the accumulated stream text so no content is lost.
    if (!n.content) {
      let raw = '';
      row.querySelectorAll('.md-holder .md').forEach(md => {
        raw += md._raw || md.textContent || '';
      });
      if (raw) n.content = raw;
    }
    const cur = row.querySelector('.cursor-blink');
    if (cur) cur.remove();
    const oldTl = row.querySelector('.bubble-timeline');
    if (oldTl) {
      const tmp = document.createElement('div');
      tmp.innerHTML = R.timelineBlocks(n, false);
      if (tmp.firstElementChild) oldTl.replaceWith(tmp.firstElementChild);
    }
    R.setBody(row, n, false);
    const stats = row.querySelector('.msg-stats');
    if (n.stats) {
      if (stats) stats.outerHTML = R.stats(n);
      else row.querySelector('.msg-main').insertAdjacentHTML('beforeend', R.stats(n));
    }
  };
  /* ---------------- Incremental streaming Markdown ----------------
   Earlier versions appended plain text nodes during streaming: Markdown was
   never parsed, and the generated .md element lacked white-space:pre-wrap, so
   newlines collapsed into spaces. That produced disordered output until the
   stream finished. Streaming now runs the full Markdown pipeline with adaptive
   throttling by content length; code highlighting and copy affordances are
   deferred to finalize() to avoid per-frame re-decoration. */
  R._streamTimers = new WeakMap();
  R.renderStreamMd = function (h) {
    const md = h.querySelector('.md');
    if (!md || !h.isConnected) return;
    const raw = md._raw || '';
    try {
      md.innerHTML = R.markdown(raw, true);
      md.classList.remove('md-plain');
    } catch (e) {
      // Minimal fallback: at least preserve line breaks.
      md.classList.add('md-plain');
      md.textContent = R.unescapeLiteral(raw);
    }
    md._everRendered = true;
  };
  R.cancelStreamRender = function (h) {
    const t = R._streamTimers.get(h);
    if (t) {
      clearTimeout(t);
      R._streamTimers.delete(h);
    }
  };
  R.scheduleStreamRender = function (h, immediate) {
    const md = h.querySelector('.md');
    if (!md) return;
    if (immediate) {
      R.cancelStreamRender(h);
      R.renderStreamMd(h);
      return;
    }
    if (R._streamTimers.has(h)) return;
    const delay = Math.min(220, Math.max(45, 45 + (md._raw || '').length / 300));
    const t = setTimeout(function () {
      R._streamTimers.delete(h);
      R.renderStreamMd(h);
    }, delay);
    R._streamTimers.set(h, t);
  };
  R.appendText = function (row, text) {
    const s = typeof text === 'string' ? text : '';
    if (!s) return;
    const tl = row.querySelector('.bubble-timeline');
    if (!tl) return;
    let h = tl.lastElementChild;
    if (!h || !h.classList.contains('md-holder')) {
      h = document.createElement('div');
      h.className = 'md-holder';
      tl.appendChild(h);
    }
    let md = h.querySelector('.md');
    if (!md) {
      h.innerHTML = '<div class="md md-stream md-plain"></div>';
      md = h.querySelector('.md');
      md._raw = '';
      md._everRendered = false;
    }
    md._raw = (md._raw || '') + s;
    if (!md._everRendered || !md.innerHTML)
      R.scheduleStreamRender(h, true); // Structure is complete on first paint.
    else R.scheduleStreamRender(h);
    // The caret stays after the text block and outside .md so innerHTML re-renders cannot remove it.
    if (!h.querySelector('.cursor-blink')) h.insertAdjacentHTML('beforeend', '<span class="cursor-blink"></span>');
  };
  R.startTextBlock = function (row) {
    const tl = row.querySelector('.bubble-timeline');
    if (!tl) return;
    const last = tl.lastElementChild;
    if (last && last.classList.contains('md-holder')) return;
    const h = document.createElement('div');
    h.className = 'md-holder';
    h.innerHTML = '<div class="md md-stream md-plain"></div>';
    const md = h.querySelector('.md');
    md._raw = '';
    md._everRendered = false;
    tl.appendChild(h);
  };
  R.appendReasoning = function (row, text) {
    const s = typeof text === 'string' ? text : '';
    if (!s || AI.state.settings.showReasoning === false) return; // When display is disabled, no reasoning node is inserted.
    const tl = row.querySelector('.bubble-timeline');
    if (!tl) return;
    if (!row._activity) row._activity = { reason: 0, tools: 0, search: 0 };
    const last = tl.lastElementChild;
    let box;
    if (last && last.hasAttribute('data-reasoning')) box = last;
    else {
      row._activity.reason++;
      const tmp = document.createElement('div');
      tmp.innerHTML = R.reasoningBox('', true, AI.state.settings.reasoningExpanded === true, row._activity);
      box = tmp.firstElementChild;
      if (!box) return;
      tl.appendChild(box);
      // Nested scrollers stop following after the user scrolls up; following resumes when the bottom is reached again.
      const body0 = box.querySelector('.reasoning-body');
      if (body0) R.bindInnerScroll(body0);
    }
    const body = box.querySelector('.reasoning-body');
    if (body) {
      const t = body.lastChild;
      if (t && t.nodeType === 3) t.nodeValue += s;
      else body.appendChild(document.createTextNode(s));
      // While expanded, the reasoning body follows the stream; collapsed blocks need no scrolling.
      if (!body.hidden && body.dataset.userPinned !== '1') body.scrollTop = body.scrollHeight;
    }
    R.refreshActivity(row);
  };
  /* After the user detaches from a nested scroller, it stays put until they scroll back; no per-frame snapping. */
  R.bindInnerScroll = function (el) {
    if (!el || el._scrollBound) return;
    el._scrollBound = true;
    const mark = () => {
      el.dataset.userPinned = '1';
    };
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('touchmove', mark, { passive: true });
    el.addEventListener(
      'scroll',
      () => {
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) delete el.dataset.userPinned;
      },
      { passive: true }
    );
  };
  R.addToolCard = function (row, call) {
    const tl = row.querySelector('.bubble-timeline');
    if (!tl) return;
    if (!row._activity) row._activity = { reason: 0, tools: 0, search: 0 };
    row._activity.tools++;
    if (R.isSearchTool(call && call.name)) row._activity.search++;
    tl.insertAdjacentHTML('beforeend', R.toolCard(call, 'running'));
    R.refreshActivity(row);
    const b = tl.lastElementChild && tl.lastElementChild.querySelector('.tool-body');
    if (b) R.bindInnerScroll(b);
  };
  R.finishToolCard = function (row, call, result, err) {
    const tl = row.querySelector('.bubble-timeline');
    if (!tl) return;
    const esc = window.CSS && CSS.escape ? CSS.escape(call.id || '') : call.id || '';
    let card = tl.querySelector('[data-tool="' + esc + '"]');
    if (!card) {
      const all = tl.querySelectorAll('.tool-card');
      card = all[all.length - 1];
      if (!card) {
        tl.insertAdjacentHTML('beforeend', R.toolCard(call, 'running'));
        card = tl.lastElementChild;
      }
    }
    if (!card) return;
    const wasOpen = !!(card.querySelector('.tool-body') && !card.querySelector('.tool-body').hidden);
    card.outerHTML = R.toolCard(call, err ? 'fail' : 'done', err ? '错误：' + err : result, wasOpen);
    const fresh = tl.querySelector('[data-tool="' + esc + '"]') || tl.lastElementChild;
    const fb = fresh && fresh.querySelector('.tool-body');
    if (fb) R.bindInnerScroll(fb);
  };
  R.setSources = function (row, list) {
    const bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;
    const old = bubble.querySelector('.sources-row');
    if (old) old.remove();
    bubble.insertAdjacentHTML('beforeend', R.sources(list));
  };
  R.setImages = function (row, list) {
    const bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;
    bubble.insertAdjacentHTML('beforeend', R.images(list));
  };
})();
