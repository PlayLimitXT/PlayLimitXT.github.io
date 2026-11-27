/* Application controller. Input is a box tree; detection is implicit.
   A bare function expression is ambiguous, so several readings are solved
   together and shown as tabs instead of forcing one interpretation. */
(function (global) {
  'use strict';
  var doc = global.document;
  var I = global.PLXT.i18n;
  var M = global.PLXT.model;
  var R = global.PLXT.render;
  var K = global.PLXT.solver;
  var KP = global.PLXT.keypad;

  var state = {
    tab: 'basic', keypadOpen: true,
    intents: [], activeKey: null,
    method: 0, showSteps: false, showGraph: false, expanded: {},
    prevTab: 'basic',
    notice: false, error: false, advancedOpen: false
  };
  var editor = null, plot = null, autoTimer = null, toastTimer = null;
  var lastInputAt = 0, idleHandle = null;
  var HAS_IDLE = typeof global.requestIdleCallback === 'function';
  var holdTimer = null, keyPop = null, swipeStart = null, suppressClick = false;
  var matrixVariant = 'inv';
  var KPDEF = KP.def(M), CATS = KPDEF.pages, TOOLS = KPDEF.tools;
  var SYMGROUPS = KPDEF.symbolGroups || [];

  function $(id) { return doc.getElementById(id); }
  function appEl() { return $('app'); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('visible');
    if (toastTimer) global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { t.classList.remove('visible'); }, 1600);
  }

  /* ---------- day / night theme ---------- */
  var THEME_KEY = 'plxt-theme';
  function currentTheme() {
    return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function themeLabel() {
    return I.t(currentTheme() === 'dark' ? 'theme.light' : 'theme.dark');
  }
  var themeDrawPending = false;
  function redrawPlotSoon() {
    if (themeDrawPending || !plot) return;
    themeDrawPending = true;
    global.requestAnimationFrame(function () {
      themeDrawPending = false;
      if (plot) plot.draw();
    });
  }

  function setTheme(mode, persist) {
    mode = mode === 'dark' ? 'dark' : 'light';
    doc.documentElement.setAttribute('data-theme', mode);
    /* Keep the OS/browser UI in sync with the in-app theme as well. */
    var tc = $('themeColor');
    if (tc) tc.setAttribute('content', mode === 'dark' ? '#111721' : '#eef2f8');
    var btn = $('themeBtn');
    if (btn) {
      btn.textContent = mode === 'dark' ? '\u2600' : '\u263e';
      btn.setAttribute('aria-label', I.t('theme.toggle'));
      btn.setAttribute('title', themeLabel());
    }
    if (persist !== false) {
      try { global.localStorage.setItem(THEME_KEY, mode); } catch (e) { /* private mode */ }
    }
    redrawPlotSoon();
  }
  function initTheme() {
    var saved = null;
    try { saved = global.localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
    var prefersDark = !!(global.matchMedia &&
      global.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(saved || (prefersDark ? 'dark' : 'light'), false);
  }

  function applyI18n() {
    var nodes = doc.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = I.t(nodes[i].getAttribute('data-i18n'));
    }
    $('langBtn').textContent = I.lang() === 'zh' ? 'EN' : '\u4e2d\u6587';
    doc.documentElement.lang = I.lang() === 'zh' ? 'zh-CN' : 'en';
    $('keypadLabel').textContent = I.t(state.keypadOpen ? 'keypad.hide' : 'keypad.show');
    $('btnKeypadOpen').textContent = '\u2328 ' + I.t('keypad.show');
    var tb = $('themeBtn');
    if (tb) {
      tb.setAttribute('aria-label', I.t('theme.toggle'));
      tb.setAttribute('title', themeLabel());
    }
    if (state.advancedOpen) renderLatexPreview();
  }

  function setKeypad(open) {
    state.keypadOpen = open;
    appEl().classList.toggle('keypad-hidden', !open);
    $('keypadLabel').textContent = I.t(open ? 'keypad.hide' : 'keypad.show');
    $('btnKeypadOpen').textContent = '\u2328 ' + I.t('keypad.show');
    if (plot && state.showGraph) global.requestAnimationFrame(function () { plot.resize(); });
  }

  /* ---------- keypad ---------- */

  function renderTabs() {
    var host = $('keypadTabs');
    host.innerHTML = '';
    CATS.forEach(function (c) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'keypad-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', c.id);
      b.setAttribute('aria-label', I.t(c.name));
      b.setAttribute('aria-selected', c.id === state.tab ? 'true' : 'false');
      (c.short || [I.t(c.name)]).forEach(function (line) {
        var sp = doc.createElement('span');
        sp.className = 'tab-line';
        sp.textContent = line;
        b.appendChild(sp);
      });
      b.addEventListener('click', function () {
        state.tab = c.id; renderTabs(); renderKeys();
      });
      host.appendChild(b);
    });
    /* Keep the active capsule visible when the strip overflows on a phone. */
    var sel = host.querySelector('[aria-selected="true"]');
    if (sel) {
      var l = sel.offsetLeft, r = l + sel.offsetWidth;
      if (l < host.scrollLeft + 8) host.scrollLeft = Math.max(0, l - 8);
      else if (r > host.scrollLeft + host.clientWidth - 8) {
        host.scrollLeft = r - host.clientWidth + 8;
      }
    }
    updateToolActive();
  }

  function updateToolActive() {
    var list = $('keypadTools').querySelectorAll('.tool-btn');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle('active',
        list[i].textContent === 'abc' && state.tab === 'abc');
    }
  }

  /* Pointer model shared by mouse, pen and touch. Consuming the click that
     follows a long press is tied to the exact button, so a quick tap on a
     different key is never swallowed by a stale global flag. */
  var holdBtn = null;
  var swipeCtx = null;
  var keyPopAlts = null, keyPopBtns = null;

  function bindHold(btn, k) {
    btn.addEventListener('pointerdown', function (ev) {
      cancelHold();
      if (holdBtn && holdBtn !== this) holdBtn = null;
      swipeCtx = { btn: this, k: k, x: ev.clientX, y: ev.clientY,
        opened: false, selecting: false, activeIndex: 0, moved: false,
        lastDx: 0, lastDy: 0 };
      if (!k.alts) return;
      var self = this;
      holdTimer = global.setTimeout(function () {
        holdBtn = self;
        showKeyPop(self, k.alts);
        /* A slow swipe holds the finger >420ms before moving. Previously the
           palette then froze: every later pointermove was swallowed by
           "if (ctx.opened) return". Keep swipe-selection live in both orders. */
        if (swipeCtx) {
          swipeCtx.opened = true;
          if (swipeCtx.moved) {
            swipeCtx.selecting = true;
            updateSwipeSelection(swipeCtx, swipeCtx.lastDx, swipeCtx.lastDy);
          }
        }
      }, 420);
    });
    btn.addEventListener('click', function () {
      /* A completed swipe may still synthesise a click on the same key.
         Consume it once so the chosen alternate is not inserted twice. */
      if (this.__skipClick) { this.__skipClick = false; return; }
      if (holdBtn === this) { holdBtn = null; return; }
      onKey(k);
    });
  }

  function markSkipClick(btn) {
    btn.__skipClick = true;
    /* A synthesised click arrives within a few ms of pointerup; keep the
       guard short so a deliberate tap on the same key is never swallowed. */
    global.setTimeout(function () { btn.__skipClick = false; }, 150);
  }

  function openPaletteFromSwipe(ctx) {
    cancelHold();
    holdBtn = ctx.btn;
    showKeyPop(ctx.btn, ctx.k.alts);
    ctx.opened = true;
    ctx.selecting = true;
    updateSwipeSelection(ctx, ctx.lastDx, ctx.lastDy);
  }

  function onPointerMove(ev) {
    var ctx = swipeCtx;
    if (!ctx) return;
    var dx = ev.clientX - ctx.x, dy = ev.clientY - ctx.y;
    ctx.lastDx = dx; ctx.lastDy = dy;
    if (ctx.selecting) { updateSwipeSelection(ctx, dx, dy); return; }
    if (Math.abs(dx) < 18) return;
    ctx.moved = true;
    if (ctx.k.alts && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (!ctx.opened) openPaletteFromSwipe(ctx);
      else { ctx.selecting = true; updateSwipeSelection(ctx, dx, dy); }
    }
  }

  function onPointerUp(ev) {
    cancelHold();
    var ctx = swipeCtx;
    swipeCtx = null;
    if (!ctx) return;
    var dx = ev.clientX - ctx.x, dy = ev.clientY - ctx.y;
    if (ctx.selecting) {
      var altsNow = keyPopAlts || ctx.k.alts || [];
      if (altsNow.picker === 'matrix') {
        var sizePick = altsNow[ctx.activeIndex] || altsNow[0];
        var mv = matrixVariant;
        closeKeyPop();
        holdBtn = null;
        markSkipClick(ctx.btn);
        insertSizedMatrix(sizePick.rows, sizePick.cols, mv);
        return;
      }
      var chosen = altsNow[ctx.activeIndex] || ctx.k;
      closeKeyPop();
      holdBtn = null;
      markSkipClick(ctx.btn);
      onKey(chosen);
      return;
    }
    if (ctx.opened) return; /* long press with no movement: palette stays for a tap */
    /* Horizontal panning inside the abc panel belongs to the scroll view. */
    if (!ctx.k.alts && Math.abs(dx) > 55 && Math.abs(dy) < 36 &&
        !ctx.btn.closest('.symbol-mode')) {
      holdBtn = ctx.btn;
      editor.move(dx > 0 ? 1 : -1);
      global.setTimeout(function () { if (holdBtn === ctx.btn) holdBtn = null; }, 180);
    }
  }

  function renderTools() {
    var host = $('keypadTools');
    host.innerHTML = '';
    TOOLS.forEach(function (k) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'tool-btn' + (k.alts ? ' has-alts' : '');
      b.textContent = k.label;
      b.setAttribute('aria-label', k.label);
      b.setAttribute('title', k.label);
      bindHold(b, k);
      host.appendChild(b);
    });
  }

  function renderKeys() {
    var host = $('keypadGrid');
    host.innerHTML = '';
    if (state.tab === 'abc') {
      /* One vertical, swipeable panel: meaningful constants at the top,
         then Latin letters, Greek letters and relation/set symbols. */
      host.className = 'keypad-grid symbol-mode';
      SYMGROUPS.forEach(function (g) {
        var sec = doc.createElement('div');
        sec.className = 'symbol-group';
        var title = doc.createElement('div');
        title.className = 'symbol-title';
        title.setAttribute('data-group', g.id);
        title.textContent = I.t(g.name);
        var grid = doc.createElement('div');
        grid.className = 'symbol-grid';
        g.keys.forEach(function (k) {
          var b = doc.createElement('button');
          b.type = 'button';
          b.className = 'key sym-key' + (k.alts ? ' has-alts' : '');
          b.textContent = k.label;
          b.setAttribute('data-key', k.label);
          b.setAttribute('title', k.label);
          bindHold(b, k);
          grid.appendChild(b);
        });
        sec.appendChild(title); sec.appendChild(grid);
        host.appendChild(sec);
      });
      host.scrollTop = 0;
      return;
    }
    host.className = 'keypad-grid';
    var cat = CATS.filter(function (c) { return c.id === state.tab; })[0] || CATS[0];
    cat.keys.forEach(function (k) {
      var b = doc.createElement('button');
      b.type = 'button';
      var small = k.label.length > 3;
      b.className = 'key' + (small ? ' func' : '') + (k.alts ? ' has-alts' : '');
      b.textContent = k.label;
      b.setAttribute('data-key', k.label);
      b.setAttribute('title', k.label);
      bindHold(b, k);
      host.appendChild(b);
    });
  }

  function cancelHold() {
    if (holdTimer) { global.clearTimeout(holdTimer); holdTimer = null; }
  }
  function closeKeyPop() {
    if (keyPop && keyPop.parentNode) keyPop.parentNode.removeChild(keyPop);
    keyPop = null; keyPopAlts = null; keyPopBtns = null;
  }
  /* Build a matrix template of arbitrary size. Every cell is a dashed
     placeholder, so an unfilled matrix is never sent to the solver. */
  function insertSizedMatrix(rows, cols, variant) {
    rows = Math.max(1, Math.min(8, Math.round(Number(rows) || 1)));
    cols = Math.max(1, Math.min(8, Math.round(Number(cols) || 1)));
    var grid = [], ri, ci, line;
    for (ri = 0; ri < rows; ri++) {
      line = [];
      for (ci = 0; ci < cols; ci++) line.push([M.hole('')]);
      grid.push(line);
    }
    editor.insert(M.matrix(grid, variant), 'matrix', { variant: variant });
  }

  function buildMatrixPicker(pop, btn, alts) {
    pop.className = 'key-pop matrix-picker';
    matrixVariant = btn.getAttribute('data-key') === '|2\u00d72|' ? 'det' : 'inv';
    var title = doc.createElement('div');
    title.className = 'mp-title';
    title.textContent = I.t('matrix.size');
    pop.appendChild(title);
    var grid = doc.createElement('div');
    grid.className = 'mp-grid';
    alts.forEach(function (a) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'mp-size';
      b.textContent = a.label;
      b.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var v = matrixVariant;
        closeKeyPop(); holdBtn = null; swipeCtx = null;
        markSkipClick(btn);
        insertSizedMatrix(a.rows, a.cols, v);
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);

    /* The original 2x2 / determinant / vector templates stay reachable from
       the same long-press menu; the size grid only adds new choices. */
    var shortcuts = doc.createElement('div');
    shortcuts.className = 'mp-row mp-shortcuts';
    [
      { label: '2\u00d72', rows: 2, cols: 2, op: null },
      { label: '|2\u00d72|', rows: 2, cols: 2, op: 'det' },
      { label: 'vec', rows: 3, cols: 2, op: 'vector' }
    ].forEach(function (sc) {
      var sb = doc.createElement('button');
      sb.type = 'button'; sb.className = 'mp-shortcut'; sb.textContent = sc.label;
      sb.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        closeKeyPop(); holdBtn = null; swipeCtx = null;
        markSkipClick(btn);
        if (sc.op === 'vector') {
          editor.insert(M.matrix([
            [[M.hole('a')], [M.hole('b')], [M.hole('c')]],
            [[M.hole('d')], [M.hole('e')], [M.hole('f')]]
          ], null), 'vector', { variant: 'cross' });
        } else {
          insertSizedMatrix(sc.rows, sc.cols, sc.op || matrixVariant);
        }
      });
      shortcuts.appendChild(sb);
    });
    pop.appendChild(shortcuts);

    var ops = doc.createElement('div');
    ops.className = 'mp-row';
    var oplab = doc.createElement('span');
    oplab.className = 'mp-label';
    oplab.textContent = I.t('matrix.op');
    var sel = doc.createElement('select');
    sel.className = 'mp-select';
    [['inv', 'matrix.op.inv'], ['det', 'matrix.op.det'],
     ['transpose', 'matrix.op.transpose'], ['rref', 'matrix.op.rref'],
     ['rank', 'matrix.op.rank'], ['trace', 'matrix.op.trace'],
     ['eigen', 'matrix.op.eigen'], ['solve', 'matrix.op.solve']].forEach(function (o) {
      var opt = doc.createElement('option');
      opt.value = o[0]; opt.textContent = I.t(o[1]);
      sel.appendChild(opt);
    });
    sel.value = matrixVariant;
    sel.addEventListener('change', function () { matrixVariant = sel.value; });
    ops.appendChild(oplab); ops.appendChild(sel);
    pop.appendChild(ops);

    var custom = doc.createElement('div');
    custom.className = 'mp-row';
    var clab = doc.createElement('span');
    clab.className = 'mp-label';
    clab.textContent = I.t('matrix.custom');
    var rin = doc.createElement('input');
    rin.type = 'number'; rin.min = '1'; rin.max = '8'; rin.value = '3';
    rin.className = 'mp-num'; rin.setAttribute('aria-label', I.t('matrix.rows'));
    var times = doc.createElement('span');
    times.className = 'mp-times'; times.textContent = '\u00d7';
    var cin = doc.createElement('input');
    cin.type = 'number'; cin.min = '1'; cin.max = '8'; cin.value = '4';
    cin.className = 'mp-num'; cin.setAttribute('aria-label', I.t('matrix.cols'));
    var apply = doc.createElement('button');
    apply.type = 'button'; apply.className = 'mp-apply';
    apply.textContent = I.t('matrix.apply');
    apply.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var v = matrixVariant;
      closeKeyPop(); holdBtn = null; swipeCtx = null;
      markSkipClick(btn);
      insertSizedMatrix(rin.value, cin.value, v);
    });
    custom.appendChild(clab); custom.appendChild(rin);
    custom.appendChild(times); custom.appendChild(cin); custom.appendChild(apply);
    pop.appendChild(custom);
  }

  function showKeyPop(btn, alts) {
    closeKeyPop();
    var rect = btn.getBoundingClientRect();
    var pop = doc.createElement('div');
    pop.className = 'key-pop';
    pop.style.left = '0px';
    pop.style.top = (rect.top - 10) + 'px';
    pop.style.visibility = 'hidden';
    var isPicker = !!(alts && alts.picker === 'matrix');
    if (isPicker) {
      buildMatrixPicker(pop, btn, alts);
    } else {
      alts.forEach(function (a) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        b.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          onKey(a); closeKeyPop(); holdBtn = null; swipeCtx = null;
        });
        pop.appendChild(b);
      });
    }
    doc.body.appendChild(pop);
    keyPopAlts = alts;
    keyPopBtns = isPicker
      ? [].slice.call(pop.querySelectorAll('.mp-size'))
      : [].slice.call(pop.querySelectorAll('button'));
    /* The left template column sits near the viewport edge: without clamping,
       the palette is half off-screen and its first choices cannot be tapped. */
    var w = pop.offsetWidth || 120, h = pop.offsetHeight || 44;
    var cx = Math.max(w / 2 + 6, Math.min(rect.left + rect.width / 2,
      (global.innerWidth || doc.documentElement.clientWidth) - w / 2 - 6));
    var cy = Math.max(h + 8, Math.min(rect.top - 10,
      (global.innerHeight || doc.documentElement.clientHeight) - 8));
    pop.style.left = cx + 'px';
    pop.style.top = cy + 'px';
    pop.style.visibility = '';
    keyPop = pop;
    return pop;
  }

  /* A horizontal swipe selects an alternate directly: distance from the key
     picks the index, the palette highlights it, and pointer-up inserts it. */
  function updateSwipeSelection(ctx, dx, dy) {
    if (!keyPopBtns || !keyPopAlts) return;
    var idx;
    if (keyPopAlts.picker === 'matrix') {
      /* A 5x5 grid: horizontal displacement picks the column, vertical
         displacement picks the row, so a swipe can select any size. */
      var col = Math.floor((Math.abs(dx) - 18) / 34);
      var row = Math.floor((Math.abs(dy || 0) - 12) / 28);
      col = Math.max(0, Math.min(4, col));
      row = Math.max(0, Math.min(4, row));
      idx = row * 5 + col;
    } else {
      idx = Math.floor((Math.abs(dx) - 18) / 34);
    }
    idx = Math.max(0, Math.min(keyPopBtns.length - 1, idx));
    ctx.activeIndex = idx;
    for (var q = 0; q < keyPopBtns.length; q++) {
      keyPopBtns[q].classList.toggle('active', q === idx);
    }
  }

  function onKey(k) {
    if (k.act) {
      switch (k.act) {
        case 'back': editor.backspace(); break;
        case 'undo': editor.undo(); break;
        case 'redo': editor.redo(); break;
        case 'left': editor.move(-1); break;
        case 'right': editor.move(1); break;
        case 'next': editor.nextBox(); break;
        case 'newline': editor.newLine(); break;
        case 'clear': editor.clear(); break;
        case 'system': editor.insertSystem(); break;
        case 'pow2': editor.suffixPower([M.num(2)]); break;
        case 'pow3': editor.suffixPower([M.num(3)]); break;
        case 'pown': editor.suffixPower([M.hole('n')], true); break;
        case 'solve': solveNow(); break;
        case 'letters':
          if (state.tab === 'abc') state.tab = state.prevTab || 'basic';
          else { state.prevTab = state.tab; state.tab = 'abc'; }
          renderTabs(); renderKeys(); break;
        case 'greek': state.tab = 'greek'; renderTabs(); renderKeys(); break;
        case 'trig': state.tab = 'trig'; renderTabs(); renderKeys(); break;
      }
      return;
    }
    /* Big-operator templates carry their meaning in the box tree. Keeping a
       global intent would leak into unrelated expressions. */
    var BIG_INTENTS = ['derivative','integral','definite','limit','series','sum','ode'];
    var intent = (k.intent && BIG_INTENTS.indexOf(k.intent) >= 0) ? null : k.intent;
    editor.insert(k.make(), intent, k.params);
  }

  /* ---------- solving ---------- */

  function cleanExpr(e) {
    /* Never silently delete relation symbols: "x ≈ 2" used to collapse into
       "x2". Approximate equality is solved as equality; domain/empty-set
       glyphs are kept so the kernel can reject them cleanly. */
    return String(e)
      .replace(/\u2248/g, '=')
      .replace(/\s+/g, '')
      .replace(/,\s*,/g, ',')
      .trim();
  }

  function vectorExpr(e) {
    var m = /^\[\[(.*)\],\[(.*)\]\]$/.exec(e);
    if (m) return '[' + m[1] + '];[' + m[2] + ']';
    return e;
  }

  function hasVariable(e) {
    /* math.js models a function name as a SymbolNode in some builds. A
       constant such as permutations(5,2) or sin(1) has no free variable and
       must not fan out into zeros / derivative / function-intent tabs. */
    var KNOWN = ('pi e i Infinity NaN true false sin cos tan cot sec csc ' +
      'asin acos atan acot asec acsc sinh cosh tanh coth sech csch ' +
      'asinh acosh atanh log ln exp sqrt abs sign conj permutations combinations ' +
      'gamma nthRoot mod round floor ceil min max mean sum prod re im ' +
      'det inv transpose cross norm').split(' ');
    try {
      var node = global.math.parse(e), found = false;
      node.traverse(function (n) {
        if (n.isSymbolNode && KNOWN.indexOf(n.name) < 0) found = true;
      });
      return found;
    } catch (x) { return /\bx\b/.test(e); }
  }

  function runOne(op, expr, params) {
    try {
      var r = K.solve({ op: op, expr: expr, params: params || {} });
      return r && r.ok ? r : null;
    } catch (e) { return null; }
  }

  var MULTI = [
    { key: 'simplify', op: 'simplify' },
    { key: 'zeros', op: 'zeros' },
    { key: 'derivative', op: 'derivative' },
    { key: 'integral', op: 'integral' },
    { key: 'series', op: 'series', params: { order: 5, point: 0 } },
    { key: 'function', op: 'function' }
  ];

  function buildIntents(spec, expr) {
    var explicit = (spec.op && spec.op !== 'auto') ? spec.op
      : (editor.intent && editor.intent !== 'auto' ? editor.intent : null);
    var baseParams = spec.params || {};

    /* A matrix equality is a linear system. Never fan it out into
       simplify/zeros/derivative tabs: those would report a meaningless
       empty set instead of the actual solution. */
    if (/\[/.test(expr) && /=/.test(expr)) {
      var meq = runOne('matrix', expr, baseParams);
      return meq ? [{ key: 'matrix_eq', op: 'matrix', result: meq }] : [];
    }

    /* Radix conversion is a single-purpose topic; do not fan it out into
       simplify/zeros/derivative intents. */
    if (/^(?:bin|hex|oct|dec|base)\s*\(|^0[bBoOxX][0-9a-fA-F]+$/.test(expr)) {
      var rb = runOne('base', expr, baseParams);
      return rb ? [{ key: 'radix', op: 'base', result: rb }] : [];
    }
    /* A pair of vectors exposes every standard operation as a tab. */
    var vectorPair = /\[[^\]]+\]\s*[;|]\s*\[[^\]]+\]/.test(expr) ||
      /\([^)]+,[^)]+\)\s*;\s*\([^)]+,[^)]+\)/.test(expr);
    /* The box model may label a bracket row pair as "matrix"; the pair is
       still a vector expression, so offer the vector operations anyway. */
    if (vectorPair && (!explicit || explicit === 'vector' || explicit === 'auto' ||
        explicit === 'matrix')) {
      var vout = [];
      ['dot', 'cross', 'add', 'sub', 'norm', 'angle'].forEach(function (v) {
        var vr = runOne('vector', expr, Object.assign({}, baseParams, { variant: v }));
        if (vr) vout.push({ key: 'vector_' + v, op: 'vector', result: vr });
      });
      if (vout.length) return vout;
    }

    if (explicit) {
      var one = runOne(explicit, expr, baseParams);
      if (!one && explicit === 'vector') one = runOne('vector', vectorExpr(expr), baseParams);
      return one ? [{ key: 'result', op: explicit, result: one }] : [];
    }
    if (!/[=<>]/.test(expr) && expr.indexOf(';') < 0 && hasVariable(expr)) {
      var out = [];
      MULTI.forEach(function (c) {
        var params = Object.assign({}, baseParams, c.params || {});
        var r = runOne(c.op, expr, params);
        if (!r && c.key === 'series') {
          r = runOne('series', expr, Object.assign({}, params, { point: 1 }));
        }
        if (r) out.push({ key: c.key, op: c.op, result: r });
      });
      if (out.length) return out;
    }
    var auto = runOne('auto', expr, baseParams);
    if (!auto && /;/.test(expr)) auto = runOne('solve', expr, baseParams);
    return auto ? [{ key: 'result', op: 'auto', result: auto }] : [];
  }

  var lastSolveSig = null;
  function solveNow() {
    if (autoTimer) { global.clearTimeout(autoTimer); autoTimer = null; }
    if (idleHandle !== null) {
      if (HAS_IDLE) global.cancelIdleCallback(idleHandle);
      else global.clearTimeout(idleHandle);
      idleHandle = null;
    }
    var spec = editor.spec();
    /* Switching tabs, themes, folding the keypad or merely moving the caret
       must not re-run the whole symbolic pipeline and rebuild the DOM. */
    var sig = null;
    try { sig = JSON.stringify([spec.expr, spec.op, spec.params, spec.incomplete, I.lang()]); }
    catch (e) { sig = null; } /* non-serialisable params: never cache */
    if (sig && sig === lastSolveSig && state.intents.length) return;
    lastSolveSig = sig;
    var expr = cleanExpr(spec.expr);
    var incomplete = !!spec.incomplete;
    state.notice = incomplete;
    state.error = false;

    /* A template with any unfilled hole must never be solved. "sqrt()" is a
       non-empty string but still has an empty radicand. */
    if (incomplete) {
      state.intents = []; state.activeKey = null;
      state.notice = true; state.error = false; state.errorKey = 'err.generic';
      renderResult();
      return;
    }

    if (!expr) {
      state.intents = [];
      state.activeKey = null;
      if (incomplete) { state.notice = true; renderResult(); }
      else showEmpty();
      return;
    }

    var params = Object.assign({}, spec.params);
    if (spec.op === 'vector') expr = vectorExpr(expr);
    if (spec.op === 'matrix' && !params.variant) params.variant = 'inv';
    if (spec.op === 'vector' && !params.variant) params.variant = 'cross';
    if (spec.op === 'geometry' && !params.variant) params.variant = 'circle';

    var hadResult = state.intents.length > 0;
    var prevKey = state.activeKey;
    var list = buildIntents({ expr: expr, op: spec.op, params: params }, expr);
    state.intents = list;
    if (!state.activeKey || !list.some(function (x) { return x.key === state.activeKey; })) {
      state.activeKey = list.length ? list[0].key : null;
    }
    /* Typing a new character must not collapse the steps the user opened,
       nor hide a graph they deliberately expanded. Only the first result
       for a fresh expression chooses the default visibility. */
    if (!hadResult && list.length) {
      /* An equality is most useful as two curves meeting at the solution;
         an inequality as a sign plot. Show it without an extra tap. */
      state.showGraph = (list.length > 1 || state.activeKey === 'function' ||
        /[=<>]/.test(expr));
    }
    if (prevKey !== state.activeKey) state.method = 0;
    state.expanded = {};
    if (!list.length) {
      var classifyOp = (editor.intent && editor.intent !== 'auto') ? editor.intent : spec.op;
      var code = failureCode(expr, classifyOp, params);
      if (code === 'undefined') {
        state.error = false;
        state.intents = [{ key: 'undefined', op: 'auto', result: undefinedResult() }];
        state.activeKey = 'undefined';
        state.showGraph = false;
      } else {
        state.error = !incomplete;
        state.errorKey = code === 'invalid' ? 'err.invalid' : 'err.unsolved';
      }
    } else state.errorKey = 'err.generic';
    renderResult();
  }

  function scheduleSolve() {
    var now = Date.now();
    /* Rapid key repeat (backspace held down, fast typing) must not trigger
       the full symbolic pipeline between keystrokes. A single keystroke
       settles quickly; a burst settles only after the burst ends. */
    var rapid = now - lastInputAt < 200;
    lastInputAt = now;
    if (autoTimer) { global.clearTimeout(autoTimer); autoTimer = null; }
    if (idleHandle !== null) {
      if (HAS_IDLE) global.cancelIdleCallback(idleHandle);
      else global.clearTimeout(idleHandle);
      idleHandle = null;
    }
    var delay = rapid ? 220 : 120;
    autoTimer = global.setTimeout(function () {
      autoTimer = null;
      var run = function () { idleHandle = null; solveNow(); };
      /* Yield to the compositor: a 700ms rebuild must never run inside the
         same task as a key event on a throttled mobile CPU. */
      if (HAS_IDLE) idleHandle = global.requestIdleCallback(run, { timeout: 120 });
      else idleHandle = global.setTimeout(run, 0);
    }, delay);
  }

  function showEmpty() {
    state.intents = []; state.activeKey = null;
    state.notice = false; state.error = false; state.errorKey = 'err.generic';
    renderResult();
  }

  /* A mathematically undefined expression is a real answer, not an error. */
  function undefinedResult() {
    return {
      ok: true, topic: 'undefined', level: 'L1',
      answer: 'Undefined', plainAnswer: 'Undefined',
      methods: [], graph: null, summary: { steps: 0, verified: 0 },
      notes: [], detail: '', decimal: ''
    };
  }

  /* Re-run the kernel once to learn WHY it failed. Syntax problems keep the
     "check your brackets" notice; a supported-but-unsolved topic says so
     explicitly; undefined mathematics shows Undefined. */
  function failureCode(expr, op, params) {
    try {
      var r = K.solve({ op: op || 'auto', expr: expr, params: params || {} });
      return r && !r.ok ? r.code : 'noresult';
    } catch (e) { return 'invalid'; }
  }

  function current() {
    return state.intents.filter(function (x) { return x.key === state.activeKey; })[0] ||
           state.intents[0] || null;
  }

  /* ---------- formula helpers ---------- */

  /* Long answers (notably truncated Taylor polynomials) live in a scrollable
     box. A purely horizontal scroll hides the trailing "⋯", which is exactly
     the information the user needs. Scale the formula down until the whole
     row fits, keeping a readable floor; the scroll stays as a last resort. */
  /* Measure every box first, then write every font-size. Interleaving reads
     and writes used to force a synchronous layout for each formula. */
  function fitAllFormulas() {
    var items = [[$('answerMath'), 15], [$('answerApprox'), 12], [$('answerSeries'), 13]];
    var jobs = [], i, el, scroll, base, avail, need;
    for (i = 0; i < items.length; i++) {
      el = items[i][0];
      if (!el || el.hidden) continue;
      scroll = el.querySelector('.m-scroll');
      if (!scroll) continue;
      base = parseFloat(global.getComputedStyle(el).fontSize) || 32;
      avail = el.clientWidth;
      if (!avail) continue;
      need = scroll.scrollWidth;
      if (need > avail + 1) jobs.push([el, Math.max(items[i][1], base * (avail - 6) / need)]);
    }
    for (i = 0; i < jobs.length; i++) {
      jobs[i][0].style.fontSize = jobs[i][1].toFixed(1) + 'px';
    }
  }

  /* Any dynamic text interpolated into innerHTML goes through esc(). Math
     itself is rendered by htmlRow(), which builds DOM nodes rather than
     parsing HTML, so it must NOT be escaped. */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function htmlRow(str) {
    var d = doc.createElement('span');
    R.formula(d, M.stringToRow(str));
    return d.innerHTML;
  }

  function fmtCoord(v) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 1e-9) return '0';
    return String(Math.round(v * 1000) / 1000);
  }

  function graphOf(r, expr) {
    if (r && r.topic === 'undefined') return null;
    /* A brace system draws one curve per side of every line (two or more
       curves), so the geometry of the system is visible at a glance. */
    if (expr.indexOf(';') >= 0) {
      var parts = expr.split(/[;\n]/).map(function (x) { return x.trim(); })
        .filter(Boolean);
      var vlist = (K.detectVariables(expr) || []);
      var vx = vlist[0] || 'x';
      /* A multivariate system has no literal "y = x+y" curve: substitute
         the solved values of the other variables so each side becomes a
         genuine function of the horizontal variable. */
      var sol = {};
      if (r && r.answer) {
        var solRe = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^,;{}]+)/g, sm;
        while ((sm = solRe.exec(String(r.answer))) !== null) {
          var raw = sm[2].trim().replace(/\bt\d+\b/g, '0');
          try {
            var sv = global.math.evaluate(raw);
            if (isFinite(sv)) sol[sm[1]] = sv;
          } catch (e) { /* parameter symbol: leave it for the 0 fallback */ }
        }
      }
      function subst(txt) {
        var out = String(txt);
        Object.keys(sol).forEach(function (k) {
          if (k === vx) return;
          out = out.replace(new RegExp('\\b' + k + '\\b', 'g'), '(' + sol[k] + ')');
        });
        return out.replace(/\bt\d+\b/g, '0');
      }
      var series = [];
      parts.forEach(function (part, i) {
        var rel = null;
        try { rel = K.splitRelation(part); } catch (e) { rel = null; }
        if (rel && rel.op === '=') {
          series.push({ expr: subst(rel.lhs), label: 'L' + (i + 1) + ': ' + subst(rel.lhs) });
          series.push({ expr: subst(rel.rhs), label: 'R' + (i + 1) + ': ' + subst(rel.rhs) });
        } else {
          series.push({ expr: subst(part), label: 'y = ' + subst(part) });
        }
      });
      if (series.length > 1) {
        var pts = [];
        if (isFinite(sol[vx])) {
          var y0 = K.evalAtVar(series[0].expr, sol[vx], vx);
          if (isFinite(y0)) pts.push({ x: sol[vx], y: y0 });
        }
        return { expr: series[0].expr, secondary: '', series: series,
          variable: vx, roots: [], critical: [], intersections: pts,
          label: expr, isEquation: true };
      }
    }
    /* Equalities are solved graphically: draw y = lhs and y = rhs as two
       separate curves and mark every intersection as a solution. */
    var eq = null;
    try { eq = K.splitRelation(expr); } catch (e) { eq = null; }
    if (eq && eq.op === '=' && eq.lhs && eq.rhs &&
        expr.indexOf(';') < 0 && !/\[/.test(expr)) {
      var ev = (K.detectVariables(expr) || [])[0] || 'x';
      var xr = [];
      if (r && r.graph && Array.isArray(r.graph.roots)) xr = r.graph.roots.slice();
      if (!xr.length && r && r.answer) {
        var nums = String(r.answer).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || [];
        nums.forEach(function (q) {
          var t = Number(q);
          if (!isFinite(t) && /\//.test(q)) {
            var ab = q.split('/'); t = Number(ab[0]) / Number(ab[1]);
          }
          if (isFinite(t)) xr.push(t);
        });
      }
      if (!xr.length) {
        try { xr = K.scanRootsVar('(' + eq.lhs + ')-(' + eq.rhs + ')', ev) || []; }
        catch (e2) { xr = []; }
      }
      var seen = [], pts = [];
      xr.forEach(function (x) {
        if (!isFinite(x)) return;
        if (seen.some(function (u) { return Math.abs(u - x) < 1e-6; })) return;
        seen.push(x);
        var y = K.evalAtVar(eq.lhs, x, ev);
        if (!isFinite(y)) y = K.evalAtVar(eq.rhs, x, ev);
        pts.push({ x: x, y: isFinite(y) ? y : 0 });
      });
      return { expr: eq.lhs, secondary: eq.rhs, variable: ev,
        roots: [], critical: [], intersections: pts,
        lhs: eq.lhs, rhs: eq.rhs, label: expr, isEquation: true };
    }
    if (r.graph) {
      if (!r.graph.variable) r.graph.variable = 'x';
      return r.graph;
    }
    try {
      var v = (K.detectVariables(expr) || [])[0] || 'x';
      return { expr: expr, variable: v,
        roots: K.scanRootsVar(expr, v) || [], critical: [], label: expr };
    } catch (e) { return null; }
  }

  /* Evidence is language-neutral: {0} placeholders are filled with numbers,
     @RULE ids with localised rule names and #CHECK ids with localised checks. */
  function evText(item) {
    var tpl = I.t(item.k), args = item.a || [];
    return tpl.replace(/\{(\d+)\}/g, function (all, idx) {
      var v = String(args[Number(idx)] === undefined ? '' : args[Number(idx)]);
      if (v.charAt(0) === '@') return I.rule(v.slice(1));
      if (v.charAt(0) === '#') return I.check(v.slice(1));
      return v;
    });
  }

  function evidenceHTML(step) {
    var ev = (step.payload && step.payload.evidence) || [];
    if (!ev.length) return '';
    return '<div class="step-evidence">' + ev.map(function (e) {
      return '<div class="ev-line">' + esc(evText(e)) + '</div>';
    }).join('') + '</div>';
  }

  function stepDetailHTML(step) {
    var rows = [];
    rows.push('<span class="kv"><b>' + esc(I.t('steps.cert')) + '</b> ' +
      esc(I.t('cert.' + step.cert)) + '</span>');
    rows.push('<span class="kv"><b>' + esc(I.t('steps.rule')) + '</b> ' +
      esc(I.rule(step.rule)) + '</span>');
    var dot = '<span class="verified-dot' + (step.payload.verified ? '' : ' no') + '"></span>';
    rows.push('<span class="kv">' + dot +
      esc(I.t(step.payload.verified ? 'steps.verified' : 'steps.unverified')) + '</span>');
    if (step.payload.check) {
      rows.push('<span class="kv"><b>' + esc(I.t('steps.check')) + '</b> ' +
        esc(I.check(step.payload.check)) + '</span>');
    }
    (step.guard || []).forEach(function (g) {
      rows.push('<span class="kv"><b>' + esc(I.t('steps.guard')) + '</b> ' +
        esc(I.t('guard.' + g.kind)) + ' ' + htmlRow(g.expr) + '</span>');
    });
    return '<div class="kv" style="gap:7px 16px">' + rows.join('') + '</div>';
  }

  function substepsHTML(step) {
    if (!step.children || !step.children.length) return '';
    return '<div class="substeps">' + step.children.map(function (c) {
      return '<div class="substep">' + esc(I.rule(c.rule)) + ' ' + htmlRow(c.before) +
        ' \u2192 ' + htmlRow(c.after) + '</div>';
    }).join('') + '</div>';
  }

  function renderSteps(r) {
    var sec = $('stepsSection');
    var visible = state.showSteps && r;
    var ssig = [r && r.answer, state.method, state.showSteps, I.lang(),
      JSON.stringify(state.expanded)].join('|');
    if (sec.dataset.sig === ssig) { sec.hidden = !visible; return; }
    sec.dataset.sig = ssig;
    sec.hidden = !visible;
    if (!visible) { sec.innerHTML = ''; return; }
    var vm = (r.methods || []).filter(function (m) { return !m.machine; });
    var steps = ((vm[state.method] && vm[state.method].steps) || [])
      .filter(function (s) {
        return !(String(s.before).trim() === String(s.after).trim() &&
                 !s.children.length && !s.guard.length);
      });
    if (!steps.length) { sec.hidden = true; sec.innerHTML = ''; return; }
    var html = '<div class="section-title">' + esc(I.t('btn.steps')) + '</div>';
    html += steps.map(function (s, i) {
      var open = !!state.expanded[i];
      var arrow = '<span class="step-arrow">\u2192</span>';
      return '<div class="step" style="--i:' + i + '">' +
        '<div class="step-num">' + (i + 1) + '</div>' +
        '<div>' +
          '<div class="step-rule">' + esc(I.rule(s.rule)) + '</div>' +
          '<div class="step-eq">' + htmlRow(s.before) + arrow + htmlRow(s.after) + '</div>' +
          evidenceHTML(s) +
          substepsHTML(s) +
          '<button type="button" class="step-toggle" data-step="' + i + '">' +
            esc(I.t(open ? 'steps.detail.hide' : 'steps.detail')) + '</button>' +
          (open ? '<div class="step-detail">' + stepDetailHTML(s) + '</div>' : '') +
        '</div></div>';
    }).join('');
    sec.innerHTML = html;
    var toggles = sec.querySelectorAll('[data-step]');
    for (var k = 0; k < toggles.length; k++) {
      toggles[k].addEventListener('click', function () {
        var idx = Number(this.getAttribute('data-step'));
        state.expanded[idx] = !state.expanded[idx];
        renderSteps(r);
      });
    }
  }

  function legendHTML(g) {
    var PAL = (global.PLXT.plot && global.PLXT.plot.PALETTE) ||
      ['#1b4fd8', '#b06000', '#16734a', '#8b5cf6', '#c2410c', '#0891b2'];
    if (g.series && g.series.length > 1) {
      return g.series.map(function (q, i) {
        return '<span class="legend-item"><span class="legend-swatch" style="background:' +
          PAL[i % PAL.length] + '"></span>' + esc(q.label || q.expr) + '</span>';
      }).join('');
    }
    return '<span class="legend-item"><span class="legend-swatch" style="background:#1b4fd8"></span>' +
      esc(I.t('graph.curveLeft')) + ' ' + esc(g.expr) + '</span>' +
      '<span class="legend-item" id="legendSecondary" ' + (g.secondary ? '' : 'hidden') +
      '><span class="legend-swatch" style="background:#b06000"></span>' +
      esc(I.t('graph.curveRight')) + ' ' + esc(g.secondary || '') + '</span>';
  }

  function renderGraph(r, expr) {
    var sec = $('graphSection');
    var g = graphOf(r, expr);
    var visible = state.showGraph && !!g;
    var gsig = [expr, r && r.answer, state.showGraph, I.lang(),
      doc.documentElement.getAttribute('data-theme') || ''].join('|');
    if (visible && sec.dataset.sig === gsig && plot && !sec.hidden) return;
    if (!visible) sec.dataset.sig = '';
    else sec.dataset.sig = gsig;
    sec.hidden = !visible;
    if (!visible) { sec.innerHTML = ''; return; }
    sec.innerHTML =
      '<div class="section-title">' + esc(I.t('graph.caption')) + '</div>' +
      '<div class="graph-card">' +
        '<div class="graph-toolbar">' +
          '<button type="button" class="chip" id="btnGrid" aria-pressed="true">' + esc(I.t('graph.grid')) + '</button>' +
          '<button type="button" class="chip" id="btnRoots" aria-pressed="true">' +
            esc(I.t(g.isEquation ? 'graph.intersections' : 'graph.roots')) + '</button>' +
          '<button type="button" class="chip" id="btnZoomOut" title="' + esc(I.t('graph.zoomOut')) + '">−</button>' +
          '<button type="button" class="chip" id="btnZoomIn" title="' + esc(I.t('graph.zoomIn')) + '">+</button>' +
          '<button type="button" class="chip" id="btnResetView">' + esc(I.t('graph.reset')) + '</button>' +
          '<input id="overlayInput" class="overlay-input" type="text" spellcheck="false" placeholder="' +
            esc(I.t('graph.overlay')) + '">' +
        '</div>' +
        '<div class="graph-frame"><canvas id="plotCanvas"></canvas></div>' +
        '<div class="graph-coord" id="graphCoord" hidden></div>' +
        '<div class="graph-legend">' + legendHTML(g) + '</div>' +
        (g.isEquation ? '<div class="graph-eq-hint">' + esc(I.t('graph.eqHint')) + '</div>' : '') +
        '<div class="graph-hint">' + esc(I.t('graph.hint')) + '</div>' +
      '</div>';
    try {
      plot = global.PLXT.plot.create($('plotCanvas'));
      plot.setGraph(g, g.secondary || '');
      function showCoord(pt) {
        var badge = $('graphCoord');
        if (!badge) return;
        if (!pt) { badge.hidden = true; badge.innerHTML = ''; return; }
        var label = I.t('graph.pt.' + pt.kind);
        badge.hidden = false;
        badge.innerHTML = '<b>' + esc(label) + '</b> ' + esc(I.t('graph.coord')) +
          ': (' + fmtCoord(pt.x) + ', ' + fmtCoord(pt.y) + ')';
      }
      plot.onPick = showCoord;
      /* On desktop a mouse hover shows the live coordinate; a tap still wins. */
      plot.onHover = function (pt) {
        if (plot.state && plot.state.pick) return;
        showCoord(pt ? { x: pt.x, y: pt.y, kind: 'point' } : null);
      };
    } catch (e) {
      plot = null;
      sec.innerHTML = '<div class="section-title">' + esc(I.t('graph.caption')) + '</div>' +
        '<div class="notice-card">' + esc(I.t('err.generic')) + '</div>';
      return;
    }
    $('btnGrid').addEventListener('click', function () {
      var on = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      plot.state.showGrid = on; plot.draw();
    });
    $('btnRoots').addEventListener('click', function () {
      var on = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      plot.state.showRoots = on; plot.draw();
    });
    $('btnResetView').addEventListener('click', function () { plot.reset(); });
    $('btnZoomIn').addEventListener('click', function () { plot.zoom(1 / 1.3); });
    $('btnZoomOut').addEventListener('click', function () { plot.zoom(1.3); });
    $('overlayInput').addEventListener('input', function () {
      plot.state.secondary = this.value.trim();
      $('legendSecondary').hidden = !plot.state.secondary;
      plot.draw();
    });
  }

  function renderIntents() {
    var bar = $('intentsBar');
    var multi = state.intents.length > 1;
    bar.hidden = !multi;
    $('intentTitle').hidden = !multi;
    $('intentHint').hidden = !multi;
    if (!multi) { bar.innerHTML = ''; return; }
    bar.innerHTML = state.intents.map(function (x) {
      var label = esc(I.t('intent.' + x.key));
      return '<button type="button" class="intent-chip" data-key="' + esc(x.key) + '" ' +
        'aria-selected="' + (x.key === state.activeKey ? 'true' : 'false') + '">' + label + '</button>';
    }).join('');
    $('intentTitle').textContent = I.t('intent.' + state.activeKey);
    $('intentHint').textContent = I.t('intent.multi');
    var chips = bar.querySelectorAll('[data-key]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        state.activeKey = this.getAttribute('data-key');
        state.method = 0; state.expanded = {};
        state.showSteps = false;
        state.showGraph = state.intents.length > 1 || state.activeKey === 'function';
        $('resultScroll').scrollTop = 0;
        renderResult();
      });
    }
  }

  function renderResult() {
    var cur = current(), r = cur && cur.result;
    var expr = editor ? cleanExpr(editor.spec().expr) : '';

    $('answerCard').hidden = !r;
    $('errorCard').hidden = !!r || !state.error;
    $('noticeCard').hidden = !state.notice;
    $('actions').hidden = !r;
    $('methodRow').hidden = !r;
    $('btnReuse').hidden = !r || (r.topic === 'undefined');

    if (state.notice) {
      $('noticeCard').innerHTML = '<b>' + esc(I.t('notice.title')) + '</b><br>' +
        esc(I.t('notice.fill'));
    }
    if (!r) {
      if (state.error) $('errorCard').textContent = I.t(state.errorKey || 'err.generic');
      $('intentsBar').hidden = true; $('intentTitle').hidden = true; $('intentHint').hidden = true;
      $('answerMath').innerHTML = '';
      $('methodRow').hidden = true;
      $('stepsSection').hidden = true; $('graphSection').hidden = true;
      return;
    }
    renderIntents();

    /* Clear any auto-fit applied to the previous result before measuring. */
    $('answerMath').style.fontSize = '';
    $('answerApprox').style.fontSize = '';
    $('answerSeries').style.fontSize = '';
    $('answerMath').classList.remove('plain-answer');
    R.formula($('answerMath'), M.stringToRow(r.answer));
    var card = $('answerCard');
    var answerText = String(r.answer);
    if (card.dataset.rendered !== answerText) {
      card.dataset.rendered = answerText;
      card.style.animation = 'none';
      global.requestAnimationFrame(function () { card.style.animation = ''; });
    }
    var ansLen = String(r.answer).length;
    $('answerMath').style.fontSize = ansLen > 40 ? '22px' :
      (ansLen > 26 ? '26px' : (ansLen > 18 ? '29px' : ''));
    var approx = $('answerApprox');
    var approxText = r.decimal || (((r.notes || []).indexOf('approx') >= 0 && r.detail)
      ? String(r.detail) : '');
    if (r.baseNote) {
      approx.hidden = false;
      approx.classList.add('base-note');
      approx.textContent = r.baseNote;
    } else if (approxText) {
      approx.hidden = false;
      approx.classList.remove('base-note');
      approx.innerHTML = htmlRow(approxText);
    } else {
      approx.hidden = true; approx.classList.remove('base-note'); approx.innerHTML = '';
    }
    var seriesNote = $('answerSeries');
    if ((r.notes || []).indexOf('series') >= 0 && r.detail) {
      seriesNote.hidden = false;
      seriesNote.innerHTML = '<span class="answer-note-label">' + esc(I.t('result.seriesForm')) +
        '</span><span class="answer-note-eq">' + htmlRow(String(r.detail)) + '</span>';
    } else { seriesNote.hidden = true; seriesNote.innerHTML = ''; }
    global.requestAnimationFrame(fitAllFormulas);

    /* Purely machine-produced derivations (sampling plans, bisection,
       Newton iterations) are not shown as worked steps. */
    var methods = (r.methods || []).filter(function (m) { return !m.machine; });
    if (state.method > methods.length - 1) {
      state.method = Math.max(0, methods.length - 1);
    }
    var visibleSteps = methods.reduce(function (n, m) {
      return n + (m.steps || []).length;
    }, 0);
    var meta = [I.t('result.topic') + ' ' + I.topic(r.topic)];
    var noteKeys = { numerical: 'result.numerical', parametric: 'result.parametric',
      exact: 'result.exact', complete: 'result.complete' };
    (r.notes || []).forEach(function (n) {
      if (noteKeys[n]) meta.push(I.t(noteKeys[n]));
    });
    if (methods.length > 1) meta.push(I.t('result.methodCount').replace('{n}', methods.length));
    if (visibleSteps > 0) meta.push(I.t('result.steps').replace('{n}', visibleSteps));
    var checked = r.summary.steps > 0 && r.summary.verified === r.summary.steps;
    $('answerMeta').innerHTML = meta.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') +
      (checked ? '<span class="meta-ok">' + esc(I.t('result.checked')) + '</span>' : '');

    $('methodRow').hidden = methods.length < 2;
    if (methods.length > 1) {
      $('methodSelect').innerHTML = methods.map(function (m, i) {
        return '<option value="' + i + '">' + esc(I.method(m.id)) + '</option>';
      }).join('');
      $('methodSelect').value = String(state.method);
    } else $('methodSelect').innerHTML = '';

    var steps = ((methods[state.method] && methods[state.method].steps) || [])
      .filter(function (s) {
        return !(String(s.before).trim() === String(s.after).trim() &&
                 !s.children.length && !s.guard.length);
      });
    $('btnSteps').hidden = !steps.length;
    $('btnSteps').textContent = I.t(state.showSteps ? 'btn.steps.hide' : 'btn.steps') +
      (steps.length ? ' \u00b7 ' + steps.length : '');
    $('btnSteps').setAttribute('aria-expanded', state.showSteps ? 'true' : 'false');
    $('btnGraph').hidden = !graphOf(r, expr);
    $('btnGraph').textContent = I.t(state.showGraph ? 'btn.graph.hide' : 'btn.graph');
    $('btnGraph').setAttribute('aria-expanded', state.showGraph ? 'true' : 'false');
    renderSteps(r);
    renderGraph(r, expr);
  }

  /* ---------- advanced LaTeX panel ----------
     Collapsed by default. Expanding only reveals the textarea; it never calls
     focus(), so no system/on-screen keyboard is raised on mobile. */
  function renderLatexPreview() {
    var ta = $('latexInput');
    if (!ta) return;
    var v = global.PLXT.latex.validate(ta.value);
    var st = $('latexStatus'), pv = $('latexPreview');
    st.textContent = v.ok ? I.t('advanced.valid') : I.t('advanced.invalid');
    st.className = 'latex-status ' + (v.ok ? 'ok' : 'bad');
    pv.innerHTML = v.ok ? v.html : '';
  }

  function latexFromEditor() {
    return editor ? global.PLXT.latex.toLatex(editor.root) : '';
  }

  var latexFrame = null;
  function refreshLatex() {
    if (!state.advancedOpen || !editor) return;
    if (latexFrame !== null) return;
    latexFrame = global.requestAnimationFrame(function () {
      latexFrame = null;
      refreshLatexNow();
    });
  }
  function refreshLatexNow() {
    var ta = $('latexInput');
    if (doc.activeElement === ta) return; /* never overwrite active typing */
    ta.value = latexFromEditor();
    renderLatexPreview();
  }

  function setAdvanced(open) {
    state.advancedOpen = !!open;
    $('advancedPanel').hidden = !state.advancedOpen;
    var btn = $('btnAdvanced');
    btn.setAttribute('aria-expanded', state.advancedOpen ? 'true' : 'false');
    var caret = btn.querySelector('.adv-caret');
    if (caret) caret.textContent = state.advancedOpen ? '\u25be' : '\u25b8';
    if (state.advancedOpen) refreshLatex();
  }

  function applyLatex() {
    var tex = $('latexInput').value;
    var v = global.PLXT.latex.validate(tex);
    if (!v.ok) { renderLatexPreview(); toast(I.t('advanced.invalid')); return; }
    try {
      var row = global.PLXT.latex.fromLatex(tex);
      editor.loadRow(row, null, {});
      setKeypad(true);
      $('resultScroll').scrollTop = 0;
      toast(I.t('toast.applied'));
    } catch (e) { toast(I.t('advanced.invalid')); }
  }

  function writeClipboard(text, okMsg) {
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch (e) { /* clipboard unavailable */ }
      doc.body.removeChild(ta);
      toast(okMsg);
    }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () { toast(okMsg); }).catch(fallback);
    } else fallback();
  }

  function copyLatex() { writeClipboard($('latexInput').value, I.t('toast.copiedLatex')); }
  function pasteLatex() {
    var nav = global.navigator;
    if (nav && nav.clipboard && nav.clipboard.readText) {
      nav.clipboard.readText().then(function (t) {
        $('latexInput').value = t; renderLatexPreview();
      }).catch(function () { toast(I.t('advanced.pasteUnavailable')); });
    } else toast(I.t('advanced.pasteUnavailable'));
  }

  /* ---------- bootstrap ---------- */

  function reuseAnswer() {
    var cur = current(), res = cur && cur.result;
    if (!res || !res.answer) return;
    var text = String(res.answer || '').trim();
    if (!text) return;
    editor.load(text, null, {});
    setKeypad(true);
    $('resultScroll').scrollTop = 0;
    global.requestAnimationFrame(function () {
      if ($('display') && $('display').scrollTo) $('display').scrollTo({ top: 0 });
    });
    toast(I.t('toast.reused'));
  }

  function copyExpr() {
    var text = editor.spec().expr;
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch (e) { /* clipboard unavailable */ }
      doc.body.removeChild(ta);
      toast(I.t('toast.copied'));
    }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () { toast(I.t('toast.copied')); }).catch(fallback);
    } else fallback();
  }

  function scrollToSection(id) {
    var sec = $(id), sc = $('resultScroll');
    if (!sec || sec.hidden) return;
    global.requestAnimationFrame(function () {
      sc.scrollTop = sec.getBoundingClientRect().top -
        sc.getBoundingClientRect().top + sc.scrollTop - 10;
    });
  }

  function bind() {
    $('btnSolve').addEventListener('click', solveNow);
    $('btnSteps').addEventListener('click', function () {
      state.showSteps = !state.showSteps; renderResult();
      if (state.showSteps) { setKeypad(false); scrollToSection('stepsSection'); }
      else setKeypad(true);
    });
    $('btnGraph').addEventListener('click', function () {
      state.showGraph = !state.showGraph; renderResult();
      if (state.showGraph) { setKeypad(false); scrollToSection('graphSection'); }
      else setKeypad(true);
    });
    $('btnCopy').addEventListener('click', copyExpr);
    $('btnReuse').addEventListener('click', reuseAnswer);
    $('btnAdvanced').addEventListener('click', function () { setAdvanced(!state.advancedOpen); });
    $('btnLatexApply').addEventListener('click', applyLatex);
    $('btnLatexCopy').addEventListener('click', copyLatex);
    $('btnLatexPaste').addEventListener('click', pasteLatex);
    $('btnLatexRefresh').addEventListener('click', function () {
      $('latexInput').value = latexFromEditor(); renderLatexPreview();
    });
    $('latexInput').addEventListener('input', renderLatexPreview);
    $('latexInput').addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); applyLatex(); }
    });
    $('methodSelect').addEventListener('change', function () {
      state.method = Number(this.value); state.expanded = {}; renderResult();
    });
    $('btnKeypad').addEventListener('click', function () { setKeypad(!state.keypadOpen); });
    $('themeBtn').addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
    /* Desktop users can wheel the capsule strip horizontally. */
    $('keypadTabs').addEventListener('wheel', function (ev) {
      if (this.scrollWidth <= this.clientWidth + 2) return;
      var d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      if (!d) return;
      this.scrollLeft += d;
      ev.preventDefault();
    }, { passive: false });
    global.addEventListener('resize', function () {
      global.requestAnimationFrame(fitAllFormulas);
    });
    $('btnKeypadOpen').addEventListener('click', function () { setKeypad(true); });
    $('display').addEventListener('click', function () { if (!state.keypadOpen) setKeypad(true); });
    $('langBtn').addEventListener('click', function () {
      I.setLang(I.lang() === 'zh' ? 'en' : 'zh');
      applyI18n(); renderTabs(); renderKeys(); renderResult();
    });
    doc.addEventListener('keydown', function (ev) {
      var tag = ev.target && ev.target.tagName;
      /* Typing in the LaTeX box or the graph overlay must not insert math
         into the editor. This also covers PC keyboard use in both fields. */
      if (tag === 'INPUT' || tag === 'TEXTAREA' ||
          (ev.target && ev.target.isContentEditable)) return;
      if (ev.key === 'ArrowLeft') { editor.move(-1); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { editor.move(1); ev.preventDefault(); }
      else if (ev.key === 'Backspace') { editor.backspace(); ev.preventDefault(); }
      else if (ev.key === 'Tab') { editor.nextBox(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { solveNow(); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { editor.undo(); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' ||
               (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { editor.redo(); ev.preventDefault(); }
      else if (/^[0-9]$/.test(ev.key)) { editor.insert(M.num(ev.key)); ev.preventDefault(); }
      else if (ev.key === '+') { editor.insert(M.op('+')); ev.preventDefault(); }
      else if (ev.key === '-') { editor.insert(M.op('\u2212')); ev.preventDefault(); }
      else if (ev.key === '*') { editor.insert(M.op('\u00d7')); ev.preventDefault(); }
      else if (ev.key === '/') { editor.insert(M.frac([M.hole('a')], [M.hole('b')])); ev.preventDefault(); }
      else if (ev.key === '^') { editor.suffixPower([M.hole('n')]); ev.preventDefault(); }
      else if (ev.key === '=' || ev.key === '<' || ev.key === '>') {
        editor.insert(M.op(ev.key)); ev.preventDefault();
      } else if (/^[A-Za-z]$/.test(ev.key)) {
        editor.insert(M.sym(ev.key)); ev.preventDefault();
      } else if (ev.key === '(' || ev.key === ')' ||
                 ev.key === '[' || ev.key === ']') {
        editor.insert(M.punct(ev.key)); ev.preventDefault();
      } else if (ev.key === ',') {
        editor.insert(M.punct(',')); ev.preventDefault();
      } else if (ev.key === '!') {
        editor.insert(M.op('!')); ev.preventDefault();
      }
    });
  }

  function init() {
    initTheme();
    applyI18n();
    renderTabs();
    renderTools();
    renderKeys();
    bind();
    doc.addEventListener('pointerdown', function (e) {
      if (keyPop && !keyPop.contains(e.target) && !e.target.closest('.has-alts')) {
        closeKeyPop(); holdBtn = null;
      }
    }, true);
    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('pointercancel', function () {
      /* Some browsers cancel the pointer stream when a gesture is reclassified.
         Commit the highlighted alternate instead of silently losing it. */
      var ctx = swipeCtx;
      if (ctx && ctx.selecting) {
        var chosen = (keyPopAlts || ctx.k.alts || [])[ctx.activeIndex] || ctx.k;
        markSkipClick(ctx.btn);
        onKey(chosen);
      }
      cancelHold(); swipeCtx = null; holdBtn = null; closeKeyPop();
    });
    /* Long-press must not raise the OS selection / copy menu on mobile. */
    doc.addEventListener('contextmenu', function (e) {
      var tag = e.target && e.target.tagName;
      /* PC users still need the native menu to copy/paste inside text fields. */
      if (tag === 'TEXTAREA' || tag === 'INPUT' || (e.target && e.target.isContentEditable)) return;
      if (e.target && e.target.closest && e.target.closest(
        '.keypad, .key-pop, .topbar, .actions, .advanced, .graph-toolbar')) e.preventDefault();
    });
    editor = new global.PLXT.Editor($('editorHost'), function () {
      $('displayEmpty').hidden = !editor.isEmpty();
      refreshLatex();
      scheduleSolve();
    });
    editor.load('x^2 - 3*x - 4 = 0');
    solveNow();
    global.__PLXT_TEST__ = {
      load: function (str, op, params) {
        editor.load(str, op === 'auto' ? null : (op || null), params || {});
        solveNow();
      },
      editor: function () { return editor; },
      solve: solveNow,
      keypad: setKeypad,
      plot: function () { return plot; },
      latex: function () { return global.PLXT.latex; },
      advanced: setAdvanced
    };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
