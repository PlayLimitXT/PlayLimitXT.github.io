/* LaTeX bridge for the box tree.

   toLatex  : box row -> a single KaTeX-compatible source string.
   fromLatex: LaTeX source -> box row, using KaTeX's own parse tree so the
              accepted syntax is exactly what the bundled renderer accepts.

   The advanced panel is the only place that calls these; the editor itself
   never shows raw text. */
(function (global) {
  'use strict';
  var M = global.PLXT.model;
  var R = global.PLXT.render;
  var katex = global.katex;

  /* KaTeX leaf text -> box leaf. */
  var LEAF = {
    '\\pi': ['sym', '\u03c0'], '\\infty': ['sym', '\u221e'],
    '\\theta': ['sym', '\u03b8'], '\\lambda': ['sym', '\u03bb'],
    '\\Delta': ['sym', '\u0394'], '\\varphi': ['sym', '\u03c6'],
    '\\phi': ['sym', '\u03c6'], '\\alpha': ['sym', '\u03b1'],
    '\\beta': ['sym', '\u03b2'], '\\tau': ['sym', '\u03c4'],
    '\\partial': ['sym', '\u2202'], '\\varnothing': ['sym', '\u2205'],
    '\\emptyset': ['sym', '\u2205'], '\\nexists': ['sym', '\u2204'],
    '\\@cdots': ['sym', '\u22ef'], '\\cdots': ['sym', '\u22ef'],
    '\\ldots': ['sym', '\u2026'], '\\dots': ['sym', '\u22ef'],
    '\\square': ['hole', ''], '\\Box': ['hole', ''],
    '\\times': ['op', '\u00d7'], '\\div': ['op', '\u00f7'],
    '\\cdot': ['op', '\u00b7'], '\\pm': ['op', '\u00b1'],
    '\\le': ['op', '\u2264'], '\\leq': ['op', '\u2264'],
    '\\ge': ['op', '\u2265'], '\\geq': ['op', '\u2265'],
    '\\ne': ['op', '\u2260'], '\\neq': ['op', '\u2260'],
    '\\to': ['op', '\u2192'], '\\rightarrow': ['op', '\u2192'],
    '\\approx': ['op', '\u2248'], '\\equiv': ['op', '\u2261'],
    '\\cup': ['op', '\u222a'], '\\cap': ['op', '\u2229'],
    '\\in': ['op', '\u2208'], '\\mathbb{R}': ['sym', '\u211d'],
    '\\mathbb{Z}': ['sym', '\u2124'], '\\mathbb{N}': ['sym', '\u2115'],
    '\\sin': ['fn', 'sin'], '\\cos': ['fn', 'cos'], '\\tan': ['fn', 'tan'],
    '\\cot': ['fn', 'cot'], '\\sec': ['fn', 'sec'], '\\csc': ['fn', 'csc'],
    '\\ln': ['fn', 'ln'], '\\log': ['fn', 'log'], '\\exp': ['fn', 'exp'],
    '\\arcsin': ['fn', 'asin'], '\\arccos': ['fn', 'acos'],
    '\\arctan': ['fn', 'atan'], '\\sinh': ['fn', 'sinh'],
    '\\cosh': ['fn', 'cosh'], '\\tanh': ['fn', 'tanh']
  };
  var FN = {
    '\\plxtP': 'permutations', '\\plxtC': 'combinations',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\cot': 'cot',
    '\\sec': 'sec', '\\csc': 'csc', '\\ln': 'ln', '\\log': 'log',
    '\\exp': 'exp', '\\arcsin': 'asin', '\\arccos': 'acos',
    '\\arctan': 'atan', '\\sinh': 'sinh', '\\cosh': 'cosh', '\\tanh': 'tanh',
    '\\coth': 'coth', '\\sech': 'sech', '\\csch': 'csch',
    '\\arccot': 'acot', '\\arcsec': 'asec', '\\arccsc': 'acsc',
    '\\arsinh': 'asinh', '\\arcosh': 'acosh', '\\artanh': 'atanh',
    '\\arcoth': 'acoth', '\\arsech': 'asech', '\\arcsch': 'acsch',
    '\\operatorname{sech}': 'sech', '\\operatorname{csch}': 'csch',
    '\\operatorname{asech}': 'asech', '\\operatorname{acsch}': 'acsch',
    '\\operatorname{acoth}': 'acoth', '\\operatorname{acot}': 'acot',
    '\\operatorname{asec}': 'asec', '\\operatorname{acsc}': 'acsc'
  };
  /* Strip a trailing differential ("dx", "\,dt", "d\theta", ...) from an
     integral body. LaTeX spacing commands may appear as extra text nodes,
     so walk backwards over those first. Returns the variable name. */
  function stripDifferential(rest) {
    var arr = rest.slice(), i, n, keep = [];
    var spacing = function (q) {
      return q && (q.t === 'text' || q.t === 'punct') &&
        /^[\s,;\\]*$/.test(String(q.v || ''));
    };
    for (i = 0; i < arr.length; i++) if (!spacing(arr[i])) keep.push(i);
    if (keep.length < 2) return { body: rest, variable: 'x' };
    var vi = keep[keep.length - 1], di = keep[keep.length - 2];
    var last = arr[vi], dNode = arr[di];
    var isD = dNode && (dNode.t === 'sym' || dNode.t === 'text') &&
      String(dNode.v || '').replace(/\s/g, '') === 'd';
    var varName = null;
    if (last && (last.t === 'sym' || last.t === 'text')) {
      var v = String(last.v || '').trim();
      if (/^[A-Za-z]$|^[\u0391-\u03c9]$|^\\[a-zA-Z]+$/.test(v)) varName = v;
    }
    if (!isD || !varName) return { body: rest, variable: 'x' };
    var body = arr.slice(0, di);
    while (body.length && spacing(body[body.length - 1])) body.pop();
    return { body: body, variable: varName };
  }

  var BIGOP = { '\\sum': 'sum', '\\prod': 'sum', '\\int': 'intab',
    '\\iint': 'intab', '\\oint': 'intab', '\\lim': 'lim' };

  function leafFromText(text, font) {
    if (font === '\\mathbb') {
      var bb = { R: '\u211d', Z: '\u2124', N: '\u2115', Q: '\u211a', C: '\u2102' };
      if (bb[text]) return M.sym(bb[text]);
      return M.sym(text);
    }
    var hit = LEAF[text];
    if (hit) return hit[0] === 'hole' ? M.hole('') : M[hit[0]](hit[1]);
    if (/^\d+(?:\.\d+)?$/.test(text)) return M.num(text);
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(text)) return M.sym(text);
    if (text === '\u2212' || text === '-') return M.op('\u2212');
    if (text === '+' || text === '=' || text === '<' || text === '>' ||
        text === '*' || text === '/' || text === '!') return M.op(text === '*' ? '\u00d7' : text);
    if (text === '(' || text === ')' || text === '[' || text === ']' || text === '|') return M.punct(text);
    if (text === ',' || text === ';') return M.punct(text);
    if (text === '\\{') return M.punct('{');
    if (text === '\\}') return M.punct('}');
    if (text === '\\,') return M.text(' ');
    return M.sym(text.replace(/^\\/, ''));
  }

  function isLeaf(n) {
    return n && ['mathord', 'textord', 'atom', 'op', 'bin', 'rel', 'open',
      'close', 'inner', 'punct', 'spacing', 'operatorname'].indexOf(n.type) >= 0;
  }

  function childrenOf(n) {
    if (n.type === 'ordgroup' || n.type === 'styling' || n.type === 'font' ||
        n.type === 'color' || n.type === 'sizing' || n.type === 'leftright' ||
        n.type === 'phantom' || n.type === 'enclose' || n.type === 'horizBrace') {
      return n.body || [];
    }
    if (n.type === 'text') return n.body || [];
    return [];
  }

  /* Consume the argument that follows a function operator. Accepts
     \left(...\right), a brace group, a single atom, or plain ( ... ). */
  function swallowArg(list, start) {
    if (start >= list.length) return { arg: [], next: start };
    var nx = list[start];
    if (nx.type === 'leftright' || nx.type === 'ordgroup' || nx.type === 'styling') {
      return { arg: convertList([nx]), next: start + 1 };
    }
    if (nx.type === 'supsub' && nx.base &&
        (nx.base.type === 'leftright' || nx.base.type === 'ordgroup')) {
      /* \sin\left(x\right)^2: the exponent belongs to the whole function. */
      return { arg: convertList([nx.base]), next: start + 1, sup: nx.sup };
    }
    if (isLeaf(nx) && (nx.text === '(' || nx.text === '\\(')) {
      var inner = [], j = start + 1, sup = null;
      while (j < list.length) {
        var z = list[j];
        if (isLeaf(z) && (z.text === ')' || z.text === '\\)')) { j++; break; }
        if (z.type === 'supsub' && z.base && isLeaf(z.base) &&
            (z.base.text === ')' || z.base.text === '\\)')) {
          sup = z.sup; j++; break; /* \sin(x)^2 */
        }
        inner.push(z); j++;
      }
      return { arg: convertList(inner), next: j, sup: sup };
    }
    if (isLeaf(nx)) return { arg: convertList([nx]), next: start + 1 };
    return { arg: [], next: start };
  }

  /* Convert a list of KaTeX nodes into a box row. A depth budget prevents a
     pathological nested LaTeX source from exhausting the JS stack. */
  var DEPTH = 0;
  function convertList(list) {
    if (++DEPTH > 90) { DEPTH--; throw new Error('latex_too_deep'); }
    var out = [];
    var i = 0;
    while (i < list.length) {
      var n = list[i];
      if (!n) { i++; continue; }

      /* \text{...}: keep as one text box. */
      if (n.type === 'text') {
        var txt = (n.body || []).map(function (x) { return x.text || ''; }).join('');
        out.push(M.text(txt)); i++; continue;
      }
      if (n.type === 'font' && n.font === '\\mathbb') {
        var bt = (n.body || []).map(function (x) { return x.text || ''; }).join('');
        out.push(leafFromText(bt, '\\mathbb')); i++; continue;
      }
      if (n.type === 'styling' || n.type === 'color' || n.type === 'sizing' ||
          n.type === 'phantom' || n.type === 'enclose' || n.type === 'horizBrace') {
        out = out.concat(convertList(childrenOf(n))); i++; continue;
      }

      /* \frac, \binom, \sqrt, \stackrel ... */
      if ((n.type === 'genfrac' || n.type === 'frac' || n.type === 'binom') && n.numer && n.denom) {
        out.push(M.frac(convertList([n.numer]), convertList([n.denom]))); i++; continue;
      }
      if (n.type === 'sqrt') {
        var idx = n.index ? convertList([n.index]) : null;
        out.push(M.radical(convertList([n.body]), idx)); i++; continue;
      }
      if (n.type === 'leftright') {
        /* \begin{cases} / \begin{bmatrix} wrap an array; recognise the
           environment before treating the outer delimiter as a bracket. */
        var envArr = (childrenOf(n).filter(function (x) { return x.type === 'array'; })[0]);
        var isCasesEnv = (n.left === '\\{' || n.left === '\\lbrace') && n.right === '.';
        var isDetEnv = n.left === '|' && n.right === '|';
        if (envArr) { out.push(convertArray(envArr, isCasesEnv, isDetEnv ? 'det' : null)); i++; continue; }
        var inner = convertList(childrenOf(n));
        var l = n.left, r = n.right;
        if (l === '(' || l === '[') out.push(M.paren(inner, l === '[' ? '[]' : '()'));
        else if (l === '|' || l === '\\|') out.push(M.abs(inner));
        else if (l === '\\{' || l === '\\lbrace') out.push(M.setNode(inner));
        else if (l === '.') {
          /* cases / matrix environments */
          var arr = (childrenOf(n).filter(function (x) { return x.type === 'array'; })[0]);
          /* A delimiter-less array is a matrix environment, not cases. */
          if (arr) out.push(convertArray(arr, false));
          else out = out.concat(inner);
        } else out = out.concat(inner);
        i++; continue;
      }
      if (n.type === 'array') { out.push(convertArray(n)); i++; continue; }

      /* Function operators: \sin(x), \sec(x), \ln x. KaTeX marks some of
         these as plain atoms, so accept any leaf whose text is a known name. */
      var fnName = FN[n.name || n.text];
      if (n.type === 'operatorname' && n.body) {
        var opTxt = (n.body || []).map(function (z) { return z.text || ''; }).join('');
        fnName = FN['\\' + opTxt] || FN['\\operatorname{' + opTxt + '}'] || fnName;
      }
      if ((n.type === 'op' && fnName) || (isLeaf(n) && fnName) ||
          (n.type === 'operatorname' && fnName)) {
        var sw = swallowArg(list, i + 1);
        i = sw.next;
        /* P/C LaTeX carries both parameters in one bracket. Split them back
           into the two editable rows of the compact template. */
        if (fnName === 'permutations' || fnName === 'combinations') {
          var pcArgs = sw.arg;
          if (pcArgs.length === 1 && pcArgs[0].t === 'paren') pcArgs = pcArgs[0].a;
          var pcComma = -1;
          for (var pcq = 0; pcq < pcArgs.length; pcq++) {
            if (pcArgs[pcq].t === 'punct' && pcArgs[pcq].v === ',') { pcComma = pcq; break; }
          }
          if (pcComma >= 0) {
            out.push(M.fn(fnName, pcArgs.slice(0, pcComma), pcArgs.slice(pcComma + 1)));
            continue;
          }
        }
        var fnNode = M.fn(fnName, sw.arg.length ? sw.arg : [M.hole('x')]);
        out.push(sw.sup ? M.pow([fnNode], convertList([sw.sup])) : fnNode);
        continue;
      }

      /* \sin^2(x) */
      if (n.type === 'supsub' && n.sup && !n.sub && n.base &&
          FN[n.base.name || n.base.text]) {
        var swPow = swallowArg(list, i + 1);
        i = swPow.next;
        var fnPow = M.fn(FN[n.base.name || n.base.text],
          swPow.arg.length ? swPow.arg : [M.hole('x')]);
        out.push(M.pow([fnPow], convertList([n.sup])));
        continue;
      }

      /* Big operators with optional bounds. The remainder of the current
         list becomes the operator body (matching \sum_{n}^{∞} a_n). */
      if (n.type === 'supsub' && n.base && n.base.type === 'op' && BIGOP[n.base.name]) {
        var kind = BIGOP[n.base.name];
        var lo = n.sub ? convertList([n.sub]) : null;
        var hi = n.sup ? convertList([n.sup]) : null;
        var rest = convertList(list.slice(i + 1));
        var stripped = { body: rest, variable: 'x' };
        if (kind === 'intab' || kind === 'int') stripped = stripDifferential(rest);
        if (kind === 'lim') kind = 'lim';
        out.push(M.big(kind, stripped.body, lo, hi, null,
          [{ t: 'sym', v: 'd' }, { t: 'sym', v: stripped.variable }]));
        DEPTH--; return out;
      }
      if (n.type === 'op' && BIGOP[n.name]) {
        var bare = n.name === '\\lim' ? 'lim'
          : (n.name === '\\sum' || n.name === '\\prod') ? 'sum' : 'int';
        var tailList = convertList(list.slice(i + 1));
        var dvRow = null;
        if (bare === 'int') {
          var st = stripDifferential(tailList);
          tailList = st.body;
          dvRow = [{ t: 'sym', v: 'd' }, { t: 'sym', v: st.variable }];
        }
        out.push(M.big(bare, tailList, null, null, null, dvRow));
        DEPTH--; return out;
      }

      /* "(a+b)^2": TeX attaches the exponent to the closing bracket, but the
         user means the whole parenthesised group. Rebuild it as a real box. */
      if (n.type === 'supsub' && n.sup && n.base && isLeaf(n.base) &&
          (n.base.text === ')' || n.base.text === ']')) {
        var openIdx = -1;
        for (var q = out.length - 1; q >= 0; q--) {
          if (out[q].t === 'punct' && (out[q].v === '(' || out[q].v === '[')) { openIdx = q; break; }
        }
        if (openIdx >= 0) {
          var inner = out.slice(openIdx + 1);
          var wrap = M.paren(inner, out[openIdx].v === '[' ? '[]' : '()');
          out = out.slice(0, openIdx);
          out.push(M.pow([wrap], convertList([n.sup])));
          i++; continue;
        }
      }

      /* \log_{2}(8): a subscript attached to a function operator is the
         logarithm base, not a free subscript symbol. */
      if (n.type === 'supsub' && n.sub && n.base &&
          FN[n.base.name || n.base.text]) {
        var baseRow = convertList([n.sub]);
        var swBase = swallowArg(list, i + 1);
        i = swBase.next;
        out.push(M.fn(FN[n.base.name || n.base.text],
          swBase.arg.length ? swBase.arg : [M.hole('x')], baseRow));
        continue;
      }

      /* Superscripts / subscripts. */
      if (n.type === 'supsub' && n.base) {
        var baseRow = convertList([n.base]);
        if (n.sup) {
          /* Always wrap the converted base; mutating the previous node would
             turn "a + b^2" into "a + (plus)^2". */
          out.push(M.pow(baseRow, convertList([n.sup])));
        } else if (n.sub && out.length) {
          /* x_1 -> a symbol with a subscript, rendered by leafTex. */
          var subTxt = n.sub.type === 'ordgroup'
            ? (n.sub.body || []).map(function (x) { return x.text || ''; }).join('')
            : (n.sub.text || '');
          var prev = out[out.length - 1];
          if (prev && prev.t === 'sym' && /^[A-Za-z]+$/.test(prev.v)) prev.v = prev.v + '_' + subTxt;
          else out.push(M.sym('_' + subTxt));
        }
        i++; continue;
      }

      if (isLeaf(n)) {
        out.push(leafFromText(n.text || '', n.font)); i++; continue;
      }
      if (n.type === 'ordgroup') { out = out.concat(convertList(n.body || [])); i++; continue; }
      if (n.type === 'kern' || n.type === 'rule' || n.type === 'tag') { i++; continue; }
      if (childrenOf(n).length) { out = out.concat(convertList(childrenOf(n))); i++; continue; }
      i++;
    }
    DEPTH--;
    return out;
  }

  function convertArray(arr, isCases, variant) {
    var rows = [];
    (arr.body || []).forEach(function (row) {
      var cells = [];
      (row || []).forEach(function (cell) {
        if (cell && cell.type === 'styling') cells.push(convertList(cell.body || []));
        else if (cell && Array.isArray(cell)) cells.push(convertList(cell));
        else if (cell && cell.body) cells.push(convertList(cell.body));
        else if (cell) cells.push(convertList([cell]));
        else cells.push([]);
      });
      rows.push(cells);
    });
    /* Only a cases environment with one column is a system of equations.
       A single-column bmatrix is a column vector (e.g. [[x],[y]]) and must
       stay a matrix, otherwise A*x=b imports as "x ; y = 5 ; 6". */
    if (isCases && rows.length && rows.every(function (r) { return r.length === 1; })) {
      return M.system(rows.map(function (r) { return r[0]; }));
    }
    return M.matrix(rows, variant || null);
  }

  /* ---------------- box row -> LaTeX ---------------- */
  function seqTex(row) {
    return (row || []).map(nodeTex).join('');
  }
  function nodeTex(n) {
    switch (n.t) {
      case 'num': case 'sym': case 'op':
        return R.leafTex(n);
      case 'punct': {
        var pv = String(n.v);
        if (pv === '{' || pv === '}') return '\\' + pv;
        if (/^[()\[\]|]$/.test(pv)) return pv;
        if (pv === ',') return ',';
        if (pv === ';') return ';';
        return R.leafTex(n);
      }
      case 'text': {
        var tv = String(n.v);
        var tm = {
          '\u2192': '\\to', '\u2211': '\\sum', '\u220f': '\\prod',
          '\u222b': '\\int', '\u221a': '\\sqrt', '\u221e': '\\infty',
          '\u22ef': '\\cdots', '\u2026': '\\ldots', '\u2248': '\\approx',
          '\u2264': '\\le', '\u2265': '\\ge', '\u2260': '\\ne',
          '\u00d7': '\\times', '\u00f7': '\\div', '\u00b7': '\\cdot',
          '\u00b1': '\\pm', '\u2212': '-', '\u03c0': '\\pi'
        };
        return tm[tv] || R.leafTex(n);
      }
      case 'hole': return '\\square';
      case 'frac': return '\\frac{' + seqTex(n.a) + '}{' + seqTex(n.b) + '}';
      case 'pow': return '{' + seqTex(n.a) + '}^{' + seqTex(n.b) + '}';
      case 'sqrt': return n.idx
        ? '\\sqrt[' + seqTex(n.idx) + ']{' + seqTex(n.a) + '}'
        : '\\sqrt{' + seqTex(n.a) + '}';
      case 'fn': {
        var fname = n.name;
        if (fname === 'permutations' || fname === 'combinations') {
          return '{}_{' + seqTex(n.a) + '}\\mathrm{' +
            (fname === 'permutations' ? 'P' : 'C') + '}' +
            (n.sub ? '_{' + seqTex(n.sub) + '}' : '');
        }
        var cmd = {
          sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot',
          sec: '\\sec', csc: '\\csc', ln: '\\ln', log: '\\log', exp: '\\exp',
          asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
          sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
          coth: '\\coth', sech: '\\operatorname{sech}', csch: '\\operatorname{csch}',
          acot: '\\arccot', asec: '\\arcsec', acsc: '\\arccsc',
          asinh: '\\arsinh', acosh: '\\arcosh', atanh: '\\artanh',
          acoth: '\\operatorname{acoth}', asech: '\\operatorname{asech}',
          acsch: '\\operatorname{acsch}'
        }[n.name];
        var args = seqTex(n.a), body = args;
        var base = n.sub ? seqTex(n.sub) : '';
        var comma = args.lastIndexOf(',');
        if (!base && fname === 'log' && comma > 0) {
          body = args.slice(0, comma);
          base = args.slice(comma + 1).trim();
        }
        return (cmd || '\\operatorname{' + n.name + '}') +
          (base ? '_{' + base + '}' : '') +
          '\\left(' + body + '\\right)';
      }
      case 'paren': return n.kind === '[]'
        ? '\\left[' + seqTex(n.a) + '\\right]'
        : '\\left(' + seqTex(n.a) + '\\right)';
      case 'abs': return '\\left|' + seqTex(n.a) + '\\right|';
      case 'set': return '\\left\\{' + seqTex(n.a) + '\\right\\}';
      case 'big': {
        var body = seqTex(n.a), lo = n.lo ? seqTex(n.lo) : '', hi = n.hi ? seqTex(n.hi) : '';
        switch (n.kind) {
          case 'lim': return '\\lim_{' + lo + '}' + body;
          case 'sum': case 'series': return '\\sum_{' + lo + '}^{' + hi + '}' + body;
          case 'intab': case 'int': {
            var dvTex = 'x';
            if (n.dv && n.dv.length) {
              var parts = n.dv.filter(function (q) {
                return !(q.t === 'text' && /^\s*$/.test(String(q.v)));
              });
              if (parts.length) dvTex = seqTex(parts.slice(1).length ? parts.slice(1) : parts);
              if (/^d/.test(dvTex)) dvTex = dvTex.slice(1);
              if (!dvTex) dvTex = 'x';
            }
            var head = n.kind === 'intab'
              ? '\\int_{' + lo + '}^{' + hi + '}' : '\\int ';
            return head + body + '\\,d' + dvTex;
          }
          case 'deriv': {
            var dv = n.lo ? seqTex(n.lo) : '';
            return '\\frac{d}{d' + (dv || 'x') + '}\\left(' + body + '\\right)';
          }
          case 'ode': return "y' = " + body;
          default: return body;
        }
      }
      case 'system': return '\\begin{cases}' +
        (n.rows || []).map(function (r) { return seqTex(r); }).join('\\\\') +
        '\\end{cases}';
      case 'matrix': {
        var env = n.variant === 'det' ? 'vmatrix' : 'bmatrix';
        return '\\begin{' + env + '}' +
          (n.rows || []).map(function (r) {
            return (r || []).map(function (c) { return seqTex(c); }).join('&');
          }).join('\\\\') + '\\end{' + env + '}';
      }
      default: return String(n.v || '');
    }
  }

  function toLatex(row) { return seqTex(row); }

  function fromLatex(tex) {
    var src = String(tex || '').trim();
    /* Plain-text log_2(...) / log_{2}(...) is accepted alongside \log_{2};
       KaTeX otherwise loses the "g" and yields "lo_2". */
    src = src.replace(/\blog_\{?(\d+)\}?\s*\(/g, '\\log_{$1}(');
    /* Our exported P/C notation is compact LaTeX; normalise it back to the
       function form before KaTeX parses it, so round-trips are lossless. */
    src = src.replace(/\{\}_\s*\{([^{}]*)\}\s*\\mathrm\{P\}\s*_\s*\{([^{}]*)\}/g,
        '\\operatorname{plxtP}\\left($1,$2\\right)')
      .replace(/\{\}_\s*\{([^{}]*)\}\s*\\mathrm\{C\}\s*_\s*\{([^{}]*)\}/g,
        '\\operatorname{plxtC}\\left($1,$2\\right)');
    if (!src) return M.row();
    if (src.length > 3000) throw new Error('latex_too_long');
    DEPTH = 0;
    /* Templates emitted by toLatex that KaTeX cannot express as a single node. */
    var der = /^\\frac\{d\}\{d([A-Za-z][A-Za-z0-9_]*)\}\\left\(([\s\S]*)\\right\)$/.exec(src);
    if (der) return [M.big('deriv', fromLatex(der[2]), [M.sym(der[1])])];
    var ode = /^y(?:\^\{\\prime\}|')\s*=\s*([\s\S]+)$/.exec(src);
    if (ode) return [M.big('ode', fromLatex(ode[1]))];
    var tree = katex.__parse(src, {
      throwOnError: true, strict: 'ignore', trust: false, maxExpand: 200, maxSize: 200
    });
    var list = Array.isArray(tree) ? tree : [tree];
    return convertList(list);
  }

  function validate(tex) {
    var src = String(tex || '');
    /* The preview and the box converter share a length budget: otherwise a
       pasted source of thousands of glyphs would render but crash Apply. */
    if (src.length > 3000) return { ok: false, message: 'latex_too_long' };
    if (/<script|<img|<iframe|javascript:|\son[a-z]+\s*=/i.test(src)) {
      return { ok: false, message: 'unsafe source' };
    }
    try {
      /* Prove the structured converter can handle the same source. */
      fromLatex(src);
      var html = katex.renderToString(src, {
        displayMode: true, throwOnError: true, strict: 'ignore', output: 'html',
        trust: false, maxExpand: 200, maxSize: 200
      });
      /* Defence in depth: the preview writes this HTML into the page, so
         reject anything resembling executable markup even if a future KaTeX
         version starts emitting it. */
      if (/<script|javascript:|\son[a-z]+\s*=|href\s*=/i.test(html)) {
        return { ok: false, message: 'unsafe output' };
      }
      return { ok: true, html: html };
    } catch (e) { return { ok: false, message: String(e.message || e) }; }
  }

  global.PLXT.latex = { toLatex: toLatex, fromLatex: fromLatex, validate: validate };
})(typeof window !== 'undefined' ? window : globalThis);
