/* Box-tree renderer. Fractions, radicals, limits and systems are real DOM boxes.
   Every rendered row is addressable, so a tap anywhere lands in the right box. */
(function (global) {
  'use strict';
  var doc = global.document;
  var katex = global.katex;

  var LEAF = {
    '\u00d7': '\\times', '\u00b7': '\\cdot', '\u00f7': '\\div',
    '\u2212': '-', '\u2264': '\\le', '\u2265': '\\ge',
    '\u2260': '\\ne', '\u00b1': '\\pm', '\u221e': '\\infty',
    '\u03c0': '\\pi', '\u03b8': '\\theta', '\u03bb': '\\lambda',
    '\u0394': '\\Delta', '\u2205': '\\varnothing', '\u2204': '\\nexists',
    '\u222a': '\\cup', '\u2229': '\\cap', '\u2208': '\\in',
    '\u2192': '\\to', '\u2248': '\\approx', '\u2261': '\\equiv',
    '\u22ef': '\\cdots', '\u2026': '\\ldots', '\u22ee': '\\vdots', '\u22f1': '\\ddots',
    '!=': '\\ne', '<=': '\\le', '>=': '\\ge',
    '\u211d': '\\mathbb{R}', '\u2124': '\\mathbb{Z}', '\u2115': '\\mathbb{N}',
    '\u2202': '\\partial', '\u221a': '\\surd', '\u03c6': '\\varphi',
    '\u03b1': '\\alpha', '\u03b2': '\\beta', '\u03c4': '\\tau'
  };

  function safeTex(tex) {
    try {
      var html = katex.renderToString(tex, {
        displayMode: false, throwOnError: true, output: 'html', strict: 'ignore',
        trust: false, maxExpand: 100, maxSize: 100
      });
      /* The typeset leaf is written into the page. Reject executable markup
         even if a future KaTeX build were to emit it. */
      if (/<script|javascript:|\son[a-z]+\s*=|href\s*=/i.test(html)) return null;
      return html;
    } catch (e) { return null; }
  }

  function leafTex(n) {
    if (n.t === 'num') {
      /* A plain "8.1e-9" leaf would be tokenised as `8.1 · e − 9`; render
         it as proper scientific notation instead. */
      var sci = /^(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(String(n.v));
      if (sci) return sci[1] + ' \\times 10^{' + sci[2] + '}';
      return String(n.v);
    }
    if (n.t === 'text') return '\\text{' + String(n.v).replace(/[{}]/g, '') + '}';
    var v = String(n.v);
    if (v === '-\u221e') return '-\\infty';
    if (LEAF[v]) return LEAF[v];
    if (n.t === 'punct' && v === ';') return '\\;';
    if (n.t === 'punct' && v === ',') return ',';
    if (n.t === 'punct' && /^[()\[\]|{}]$/.test(v)) return '\\' + v;
    if (/^[A-Za-z\u0394\u03c0\u03bb\u03b8\u221e\u2205\u03c6][A-Za-z0-9_']*$/.test(v)) {
      var m = /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(v);
      if (m) return m[1] + '_{' + m[2] + '}';
      var d = /^([A-Za-z]+)(\d+)$/.exec(v);
      if (d) return d[1] + '_{' + d[2] + '}';
      if (/'/.test(v)) return v.replace(/'/g, '\\prime');
      return v;
    }
    return v;
  }

  function el(tag, cls, txt) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function leafEl(n) {
    var out = safeTex(leafTex(n));
    var inner = el('span', 'm-leaf-inner');
    if (out) inner.innerHTML = out;
    else inner.textContent = String(n.v).replace(/\\/g, '');
    var e = el('span', 'm-leaf');
    e.appendChild(inner);
    return e;
  }

  function bracket(pair) {
    var s = el('span', 'm-bracket');
    s.textContent = pair;
    return s;
  }

  function renderRow(r, ctx, isRoot) {
    var wrap = el('span', 'm-row' + (isRoot ? ' m-row-root' : ''));
    var rid = 'r' + (++ctx.rid);
    wrap.setAttribute('data-rid', rid);
    ctx.rows[rid] = r;

    if (ctx.caretRow === r && ctx.caretIndex === 0) wrap.appendChild(el('span', 'm-caret'));
    r.forEach(function (n, i) {
      var nodeEl = el('span', 'm-node mk-' + n.t);
      if (n.t === 'punct' && (n.v === ',' || n.v === ';')) {
        nodeEl.className += ' m-comma';
      }
      var uid = 'n' + (++ctx.uid);
      nodeEl.setAttribute('data-uid', uid);
      ctx.map[uid] = { node: n, row: r, index: i };
      if (ctx.selected === n) nodeEl.classList.add('m-selected');
      nodeEl.appendChild(renderNode(n, ctx));
      wrap.appendChild(nodeEl);
      if (ctx.caretRow === r && ctx.caretIndex === i + 1) wrap.appendChild(el('span', 'm-caret'));
    });
    if (!r.length) {
      wrap.appendChild(ctx.interactive
        ? el('span', 'm-hole m-hole-empty', '□')
        : el('span', 'm-row-empty'));
    }

    if (ctx.interactive) {
      wrap.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var rowEl = ev.target.closest('.m-row');
        if (!rowEl) return;
        /* Tapping a container's chrome (fraction bar, radical vinculum,
           bracket padding) lands inside the nearest child box. */
        var chrome = ev.target.closest(
          '.m-frac-n, .m-frac-d, .m-frac-bar, .m-radicand, .m-radical, ' +
          '.m-root-idx, .m-pow-base, ' +
          '.m-pow-exp, .m-big-body, .m-limit, .m-cell, .m-system-line, ' +
          '.m-paren, .m-abs, .m-set, .m-fn, .m-matrix');
        if (chrome) {
          var inner = chrome.querySelector('.m-row[data-rid]');
          /* The fraction bar and the SVG radical hook carry no row of their
             own; route a tap on them into the numerator / radicand. */
          if (!inner) {
            var owner = chrome.closest('.m-frac, .m-sqrt');
            if (owner) inner = owner.querySelector(
              '.m-frac-n .m-row[data-rid], .m-radicand .m-row[data-rid]');
          }
          if (inner) rowEl = inner;
        }
        var nodes = [];
        for (var c = 0; c < rowEl.children.length; c++) {
          if (rowEl.children[c].classList.contains('m-node')) nodes.push(rowEl.children[c]);
        }
        var index = nodes.length;
        for (var k = 0; k < nodes.length; k++) {
          var box = nodes[k].getBoundingClientRect();
          if (ev.clientX < box.left + box.width / 2) { index = k; break; }
        }
        var leafElHit = ev.target.closest(
          '.m-node.mk-num, .m-node.mk-sym, .m-node.mk-op, .m-node.mk-punct, ' +
          '.m-node.mk-text, .m-node.mk-hole');
        ctx.onPick({
          row: ctx.rows[rowEl.getAttribute('data-rid')],
          index: index,
          leafUid: leafElHit ? leafElHit.getAttribute('data-uid') : null,
          onChrome: !!chrome
        });
      });
    }
    return wrap;
  }

  function rowHasArrow(rr) {
    return !!(rr && rr.some(function (n) {
      return (n.t === 'op' || n.t === 'sym' || n.t === 'text' || n.t === 'punct') &&
        String(n.v).indexOf('\u2192') >= 0;
    }));
  }

  function limitEl(ctx, rr, which, kind) {
    var e = el('span', 'm-limit m-limit-' + which);
    if (kind === 'lim' && which === 'lo' && !rowHasArrow(rr)) {
      e.appendChild(doc.createTextNode('x\u2192'));
    }
    e.appendChild(renderRow(rr, ctx));
    return e;
  }

  function limitsEl(ctx, hi, lo, kind) {
    var limits = el('span', 'm-limits');
    if (hi) limits.appendChild(limitEl(ctx, hi, 'hi', kind));
    if (lo) limits.appendChild(limitEl(ctx, lo, 'lo', kind));
    return limits;
  }

  function renderNode(n, ctx) {
    var box, a, b, s, g, i, j;
    switch (n.t) {
      case 'num': case 'sym': case 'op': case 'punct': case 'text':
        return leafEl(n);

      case 'hole':
        box = el('span', 'm-hole', n.label || '\u25a1');
        return box;

      case 'frac':
        box = el('span', 'm-frac');
        a = el('span', 'm-frac-n'); a.appendChild(renderRow(n.a, ctx));
        var fbar = el('span', 'm-frac-bar');
        b = el('span', 'm-frac-d'); b.appendChild(renderRow(n.b, ctx));
        box.appendChild(a); box.appendChild(fbar); box.appendChild(b);
        return box;

      case 'pow':
        box = el('span', 'm-pow');
        a = el('span', 'm-pow-base'); a.appendChild(renderRow(n.a, ctx));
        b = el('span', 'm-pow-exp'); b.appendChild(renderRow(n.b, ctx));
        box.appendChild(a); box.appendChild(b);
        return box;

      case 'sqrt':
        box = el('span', 'm-sqrt');
        if (n.idx) {
          var ix = el('span', 'm-root-idx');
          ix.appendChild(renderRow(n.idx, ctx));
          box.appendChild(ix);
        }
        /* A glyph √ carries its own short vinculum, which visually breaks
           against the radicand's top rule. Draw only the hook as SVG; the
           horizontal rule comes solely from .m-radicand's border-top. */
        var hook = el('span', 'm-radical');
        hook.innerHTML = '<svg viewBox="0 0 12 24" preserveAspectRatio="none" ' +
          'aria-hidden="true"><path d="M0.7 14.2 L4.8 23 L9.4 0.9" fill="none" ' +
          'stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" ' +
          'vector-effect="non-scaling-stroke"/></svg>' +
          '<span class="m-radical-glyph">\u221a</span>';
        box.appendChild(hook);
        var body = el('span', 'm-radicand');
        body.appendChild(renderRow(n.a, ctx));
        box.appendChild(body);
        return box;

      case 'fn':
        /* nPr / nCr: render a capital letter with the two parameters as
           left and right subscripts (e.g. 5 P 2), not "permutations(5,2)".
           n.a and n.sub are real editable rows, never sliced copies. */
        if ((n.name === 'permutations' || n.name === 'combinations') && n.sub) {
          var pc = el('span', 'm-permcomb');
          var pcLeft = el('span', 'm-pc-sub');
          pcLeft.appendChild(renderRow(n.a, ctx));
          var pcLetter = el('span', 'm-pc-letter',
            n.name === 'permutations' ? 'P' : 'C');
          var pcRight = el('span', 'm-pc-sub');
          pcRight.appendChild(renderRow(n.sub, ctx));
          pc.appendChild(pcLeft); pc.appendChild(pcLetter); pc.appendChild(pcRight);
          return pc;
        }
        box = el('span', 'm-fn');
        box.appendChild(el('span', 'm-fn-name', n.name));
        if (n.sub) {
          var subBox = el('span', 'm-fn-sub');
          subBox.appendChild(renderRow(n.sub, ctx));
          box.appendChild(subBox);
        }
        box.appendChild(bracket('('));
        box.appendChild(renderRow(n.a, ctx));
        box.appendChild(bracket(')'));
        return box;

      case 'paren':
        box = el('span', 'm-paren');
        var pp = { '[]': ['[', ']'], '[)': ['[', ')'], '(]': ['(', ']'] }[n.kind]
          || ['(', ')'];
        box.appendChild(bracket(pp[0]));
        box.appendChild(renderRow(n.a, ctx));
        box.appendChild(bracket(pp[1]));
        return box;

      case 'abs':
        box = el('span', 'm-abs');
        box.appendChild(bracket('|'));
        box.appendChild(renderRow(n.a, ctx));
        box.appendChild(bracket('|'));
        return box;

      case 'set':
        box = el('span', 'm-set');
        box.appendChild(bracket('{'));
        box.appendChild(renderRow(n.a, ctx));
        box.appendChild(bracket('}'));
        return box;

      case 'big':
        box = el('span', 'm-big kind-' + n.kind);
        var head = el('span', 'm-big-sign');
        if (n.kind === 'deriv') {
          /* d/dx is a fraction box, not a flat "d/dx" label. */
          var df = el('span', 'm-frac m-deriv-head');
          var dn = el('span', 'm-frac-n');
          dn.appendChild(renderRow([{ t: 'sym', v: 'd' }], ctx));
          var dd = el('span', 'm-frac-d');
          var den = [{ t: 'sym', v: 'd' }].concat(
            n.lo && n.lo.length ? n.lo : [{ t: 'sym', v: 'x' }]);
          dd.appendChild(renderRow(den, ctx));
          df.appendChild(dn); df.appendChild(dd);
          head.appendChild(df);
        } else {
          head.textContent = {
            ode: "y\u2032 =", lim: 'lim',
            series: '\u2211', sum: '\u2211', intab: '\u222b', int: '\u222b'
          }[n.kind] || '\u222b';
        }
        var bodyBig = el('span', 'm-big-body');
        bodyBig.appendChild(renderRow(n.a, ctx));
        if (n.kind === 'int' || n.kind === 'intab') {
          var diff = el('span', 'm-differential');
          diff.appendChild(renderRow(n.dv && n.dv.length
            ? n.dv : [{ t: 'sym', v: 'd' }, { t: 'sym', v: 'x' }], ctx));
          bodyBig.appendChild(diff);
        }
        /* lim puts its subscript directly below the word; sum/series put
           their bounds directly above and below the sigma. Inline integrals
           keep the conventional right-hand super/subscript pair. */
        if (n.kind === 'lim' || n.kind === 'sum' || n.kind === 'series') {
          var stack = el('span', 'm-big-stack');
          if (n.kind !== 'lim' && n.hi) stack.appendChild(limitEl(ctx, n.hi, 'hi', n.kind));
          if (n.kind === 'lim' && n.hi) {
            var side = el('span', 'm-lim-side');
            side.appendChild(renderRow(n.hi, ctx));
            head.appendChild(side);
          }
          stack.appendChild(head);
          if (n.lo) stack.appendChild(limitEl(ctx, n.lo, 'lo', n.kind));
          box.appendChild(stack);
          box.appendChild(bodyBig);
        } else {
          box.appendChild(head);
          if (n.lo || n.hi) box.appendChild(limitsEl(ctx, n.hi, n.lo, n.kind));
          box.appendChild(bodyBig);
        }
        return box;

      case 'system':
        box = el('span', 'm-system');
        var brace = el('span', 'm-system-brace');
        brace.textContent = '{';
        brace.style.fontSize = (1.05 * n.rows.length + 0.55) + 'em';
        box.appendChild(brace);
        var stack = el('span', 'm-system-rows');
        n.rows.forEach(function (rr) {
          var line = el('span', 'm-system-line');
          line.appendChild(renderRow(rr, ctx));
          stack.appendChild(line);
        });
        box.appendChild(stack);
        return box;

      case 'matrix':
        /* A determinant template uses vertical bars; a plain matrix uses
           square brackets. The two keys must never look identical. */
        var isDet = n.variant === 'det';
        box = el('span', 'm-matrix' + (isDet ? ' m-matrix-det' : ''));
        box.appendChild(bracket(isDet ? '|' : '['));
        g = el('span', 'm-matrix-grid');
        g.style.gridTemplateColumns = 'repeat(' +
          Math.max.apply(null, n.rows.map(function (r) { return Math.max(1, r.length); })) + ', auto)';
        for (i = 0; i < n.rows.length; i++) {
          for (j = 0; j < n.rows[i].length; j++) {
            var cell = el('span', 'm-cell');
            cell.appendChild(renderRow(n.rows[i][j], ctx));
            g.appendChild(cell);
          }
        }
        box.appendChild(g);
        box.appendChild(bracket(isDet ? '|' : ']'));
        return box;

      default:
        return el('span', 'm-leaf', String(n.v || ''));
    }
  }

  function makeCtx(options) {
    return {
      uid: 0, rid: 0, map: {}, rows: {},
      caretRow: options && options.caretRow,
      caretIndex: options && options.caretIndex,
      interactive: !!(options && options.onPick),
      onPick: options && options.onPick,
      selected: options && options.selected
    };
  }

  function into(container, r, options) {
    var ctx = makeCtx(options);
    container.innerHTML = '';
    container.appendChild(renderRow(r, ctx, true));
    return { map: ctx.map, rows: ctx.rows };
  }

  function formula(container, r) {
    /* Tall nested fractions / matrices stay fully visible; the wrapper can
       scroll instead of clipping the formula to the card's line height. */
    var scroll = el('span', 'm-scroll');
    into(scroll, r, {});
    container.innerHTML = '';
    container.appendChild(scroll);
    return scroll;
  }

  global.PLXT = global.PLXT || {};
  global.PLXT.render = { into: into, formula: formula, leafTex: leafTex, safeTex: safeTex };
})(typeof window !== 'undefined' ? window : globalThis);
