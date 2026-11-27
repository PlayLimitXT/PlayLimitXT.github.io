/* Structured mathematical object model.
   The user never edits text: every input is a box node in a row tree. */
(function (global) {
  'use strict';
  var math = global.math;

  function N(t, p) {
    var n = { t: t };
    if (p) for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) n[k] = p[k];
    return n;
  }
  function row(a) { return a || []; }
  function num(v) { return N('num', { v: String(v) }); }
  function sym(v) { return N('sym', { v: String(v) }); }
  function op(v) { return N('op', { v: String(v) }); }
  function punct(v) { return N('punct', { v: String(v) }); }
  function text(v) { return N('text', { v: String(v) }); }
  function frac(a, b) { return N('frac', { a: row(a), b: row(b) }); }
  function pow(a, b) { return N('pow', { a: row(a), b: row(b) }); }
  function radical(a, idx) { return N('sqrt', { a: row(a), idx: idx ? row(idx) : null }); }
  /* fn(name, a, sub): sub is an optional base row, used by log_2(8). */
  function fn(name, a, sub) {
    return N('fn', { name: String(name), a: row(a), sub: sub ? row(sub) : null });
  }
  function paren(a, kind) { return N('paren', { a: row(a), kind: kind || '()' }); }
  function abs(a) { return N('abs', { a: row(a) }); }
  function big(kind, a, lo, hi, v, dv) {
    var isIntegral = kind === 'int' || kind === 'intab';
    return N('big', {
      kind: kind, a: row(a), lo: lo ? row(lo) : null,
      hi: hi ? row(hi) : null, v: v ? row(v) : null,
      /* The displayed differential is part of the structure, not of the
         expression sent to the solver: rowToExpr() only returns n.a. */
      dv: isIntegral ? row(dv || [{ t: 'sym', v: 'd' }, { t: 'sym', v: 'x' }])
                     : (dv ? row(dv) : null)
    });
  }
  function matrix(rows, variant) {
    return N('matrix', {
      rows: rows.map(function (r) { return r.map(function (c) { return row(c); }); }),
      variant: variant || null
    });
  }
  function setNode(a) { return N('set', { a: row(a) }); }
  /* Empty slot shown as a dashed hint box. Serializes to nothing, but marks
     the expression as incomplete so the UI can ask for input politely. */
  function hole(label) { return N('hole', { label: label || '' }); }
  /* A brace-wrapped system of equations, one row per equation. */
  function system(rows) {
    return N('system', {
      rows: (rows && rows.length ? rows : [[], []]).map(function (r) { return row(r); })
    });
  }

  var SYM = {
    pi: '\u03c0', Infinity: '\u221e', infinity: '\u221e', i: 'i', e: 'e',
    theta: '\u03b8', lambda: '\u03bb', Delta: '\u0394', phi: '\u03c6',
    alpha: '\u03b1', beta: '\u03b2', tau: '\u03c4'
  };

  function symRow(name) {
    name = String(name);
    if (Object.prototype.hasOwnProperty.call(SYM, name)) return [sym(SYM[name])];
    return [sym(name)];
  }

  function childRows(n) {
    var out = [];
    ['a', 'b', 'idx', 'sub', 'lo', 'hi', 'v', 'dv'].forEach(function (k) {
      if (n[k] && Array.isArray(n[k])) out.push(n[k]);
    });
    if (n.t === 'matrix') n.rows.forEach(function (r) { r.forEach(function (c) { out.push(c); }); });
    if (n.t === 'system') n.rows.forEach(function (r) { out.push(r); });
    return out;
  }

  function firstBox(n) {
    if (n.t === 'frac' || n.t === 'sqrt' || n.t === 'fn' || n.t === 'paren' ||
        n.t === 'abs' || n.t === 'big' || n.t === 'set') return n.a;
    if (n.t === 'pow') return n.a.length ? n.a : n.b;
    if (n.t === 'matrix' && n.rows.length && n.rows[0].length) return n.rows[0][0];
    if (n.t === 'system' && n.rows.length) return n.rows[0];
    return null;
  }

  function lastBox(n) {
    var kids = childRows(n);
    /* Backspace after an integral belongs to the integrand. Without this
       guard the caret would land in the decorative differential row first. */
    if (n.t === 'big' && (n.kind === 'int' || n.kind === 'intab')) return n.a;
    if (n.t === 'pow') {
      var exp = n.b;
      if (exp.length) return exp;
      return n.a;
    }
    if (!kids.length) return null;
    return kids[kids.length - 1];
  }

  function linkTree(root) {
    root.__p = null;
    function walk(r, parentNode, parentRow, index) {
      r.__p = { node: parentNode, row: parentRow, index: index };
      r.forEach(function (n, i) {
        childRows(n).forEach(function (sub) { walk(sub, n, r, i); });
      });
    }
    walk(root, null, null, 0);
    return root;
  }

  /* ---------- math.js AST -> box tree ---------- */

  function isOne(n) {
    while (n && n.isParenthesisNode) n = n.content;
    return !!(n && n.isConstantNode && Number(n.value) === 1);
  }

  function astToRow(node) {
    if (!node) return row();
    var k;
    if (node.isConstantNode) {
      var v = node.value;
      if (typeof v === 'number') return [num(finiteNum(v))];
      if (v && v.isBigNumber) return [num(v.toString())];
      if (typeof v === 'string') return [text(v)];
      return [num(String(v))];
    }
    if (node.isSymbolNode) return symRow(node.name);
    if (node.isParenthesisNode) {
      var content = node.content;
      while (content && content.isParenthesisNode) content = content.content;
      /* A bracket around a single atom carries no information. */
      if (content && (content.isConstantNode || content.isSymbolNode)) {
        return astToRow(content);
      }
      return [paren(astToRow(content), '()')];
    }
    if (node.isArrayNode) {
      var nested = node.items.some(function (it) { return it && it.isArrayNode; });
      var rows = nested
        ? node.items.map(function (it) {
            return it.isArrayNode
              ? it.items.map(function (c) { return astToRow(c); })
              : [astToRow(it)];
          })
        : [node.items.map(function (c) { return astToRow(c); })];
      return [matrix(rows)];
    }
    if (node.isAssignmentNode) {
      return astToRow(node.object).concat([op('=')], astToRow(node.value));
    }
    if (node.isRelationalNode) {
      var r = [];
      for (k = 0; k < node.args.length; k++) {
        if (k) r.push(op(node.conditionals[k - 1] || '='));
        r = r.concat(astToRow(node.args[k]));
      }
      return r;
    }
    if (node.isFunctionNode) {
      var name = node.name;
      var args = [];
      node.args.forEach(function (a, i) {
        if (i) args.push(punct(','));
        args = args.concat(astToRow(a));
      });
      if (name === 'sqrt') return [radical(args)];
      /* Two-argument combinatorics functions become the compact P/C box. */
      if ((name === 'permutations' || name === 'combinations') &&
          node.args.length === 2) {
        return [fn(name, astToRow(node.args[0]), astToRow(node.args[1]))];
      }
      /* math.js uses log(x, base); render it as log_{base}(x). */
      if (name === 'log' && node.args.length === 2) {
        return [fn('log', astToRow(node.args[0]), astToRow(node.args[1]))];
      }
      if (name === 'log' && node.args.length === 1) return [fn('ln', args)];
      if (name === 'nthRoot' || name === 'root') {
        return [radical(node.args[0] ? astToRow(node.args[0]) : [],
                        node.args[1] ? astToRow(node.args[1]) : [])];
      }
      if (name === 'abs') return [abs(args)];
      return [fn(name, args)];
    }
    if (node.isOperatorNode) {
      var o = node.op, a = node.args;
      if (o === '/' && a.length === 2) return [frac(astToRow(a[0]), astToRow(a[1]))];
      if (o === '^' && a.length === 2) {
        if (a[1].isConstantNode && Number(a[1].value) === 1) return astToRow(a[0]);
        return [pow(astToRow(a[0]), astToRow(a[1]))];
      }
      if (o === '*' && a.length === 2 && (isOne(a[0]) || isOne(a[1]))) {
        return astToRow(isOne(a[0]) ? a[1] : a[0]);
      }
      if (o === '!' && a.length === 1) return astToRow(a[0]).concat([op('!')]);
      if ((o === '+' || o === '-') && a.length === 1) return [op(o)].concat(astToRow(a[0]));
      if (o === '*' && a.length === 2 && node.implicit) {
        return astToRow(a[0]).concat(astToRow(a[1]));
      }
      if (o === '*' && a.length === 2) {
        var left = astToRow(a[0]), right = astToRow(a[1]);
        var numericLeft = left.length === 1 && left[0].t === 'num';
        var symbolicRight = right.length === 1 &&
          ['sym', 'pow', 'sqrt', 'fn', 'paren'].indexOf(right[0].t) >= 0;
        if (numericLeft && symbolicRight) return left.concat(right);
        return left.concat([op('\u00b7')], right);
      }
      if (a.length === 2) {
        var map = { '+': '+', '-': '\u2212', '/': '\u00f7', '^': '^', '%': '%',
                    '<': '<', '>': '>', '<=': '\u2264', '>=': '\u2265',
                    '==': '=', '!=': '\u2260' };
        return astToRow(a[0]).concat([op(map[o] || o)], astToRow(a[1]));
      }
      var r2 = [];
      a.forEach(function (x, i) { if (i) r2.push(op(o)); r2 = r2.concat(astToRow(x)); });
      return r2;
    }
    return [text(node.toString ? node.toString() : String(node))];
  }

  function finiteNum(v) {
    if (!isFinite(v)) return '0';
    if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
    return String(Math.round(v * 1e10) / 1e10);
  }

  /* ---------- controlled string -> box tree ---------- */

  var LITERAL = /^(?:degree \d+|ARITHMETIC|GEOMETRIC|UNCLASSIFIED|unclassified|structured feature set|identity verified|nonzero residual|Simpson quadrature|first_order_linear_homogeneous|direct_integration)$/;

  function splitTop(s, sep) {
    var parts = [], depth = 0, buf = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      if (depth === 0 && c === sep) {
        if (buf.trim()) parts.push(buf.trim());
        buf = ''; continue;
      }
      buf += c;
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts;
  }

  function intervalRow(s) {
    s = String(s).trim();
    if (s.length < 3) return null;
    var open = s.charAt(0), close = s.charAt(s.length - 1);
    if ((open !== '(' && open !== '[') || (close !== ')' && close !== ']')) return null;
    var body = s.slice(1, -1), depth = 0, comma = -1;
    for (var i = 0; i < body.length; i++) {
      var c = body.charAt(i);
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) { comma = i; break; }
    }
    if (comma < 0) return null;
    /* A matrix / vector literal ([1,2,3], [[1,2],[3,4]]) is NOT an interval:
       it has more than one top-level comma or array endpoints. Without this
       guard the box tree would turn it into a paren box and the solver would
       reject the resulting expression. */
    var rest = body.slice(comma + 1), d2 = 0;
    for (var q = 0; q < rest.length; q++) {
      var rc = rest.charAt(q);
      if (rc === '(' || rc === '[' || rc === '{') d2++;
      else if (rc === ')' || rc === ']' || rc === '}') d2 = Math.max(0, d2 - 1);
      else if (rc === ',' && d2 === 0) return null;
    }
    var lo = body.slice(0, comma).trim(), hi = body.slice(comma + 1).trim();
    if (!lo || !hi || /^\[/.test(lo) || /^\[/.test(hi) || /;/.test(lo + hi)) return null;
    /* Endpoints are real expressions, not raw symbol strings: sqrt(29),
       (3 - sqrt(29))/2 and fractions must all render as structured boxes. */
    function bound(t) {
      if (/^[-−]\s*(?:\u221e|Infinity|infinity)$/i.test(t)) {
        return [op('\u2212'), sym('\u221e')];
      }
      if (/^\+?\s*(?:\u221e|Infinity|infinity)$/i.test(t)) {
        return /^\+/.test(t) ? [op('+'), sym('\u221e')] : [sym('\u221e')];
      }
      return parseOne(t);
    }
    var kind = (open === '[' ? '[' : '(') + (close === ']' ? ']' : ')');
    return [paren(bound(lo).concat([punct(',')], bound(hi)), kind)];
  }

  function normalize(s) {
    return String(s)
      .replace(/\u221e/g, 'Infinity')
      .replace(/\binfinity\b/gi, 'Infinity')
      .replace(/\u2212/g, '-')
      .replace(/\u00f7/g, '/')
      .replace(/\u00b7/g, '*')
      .replace(/\u00b1/g, '+')
      .replace(/^-\s*Infinity$/, '-Infinity');
  }

  function splitFirstTop(s, ch) {
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      if (depth === 0 && c === ch) {
        var a = s.slice(0, i).trim(), b = s.slice(i + 1).trim();
        return (a && b) ? [a, b] : null;
      }
    }
    return null;
  }

  function fallbackRow(s) {
    /* A slash is always rendered as a fraction box, never as a glyph. */
    var cut = splitFirstTop(s, '/') || splitFirstTop(s, '\u00f7');
    if (cut) {
      var left = parseOne(cut[0]), right = parseOne(cut[1]);
      if (left.length && right.length) return [frac(left, right)];
    }
    var tokens = s.match(/[A-Za-z\u0394\u03c0\u03bb\u03b8\u221e\u2205\u221a\u222b\u211d\u2124][A-Za-z0-9_]*(?:'[A-Za-z]*)*|\d+\.?\d*(?:[eE][+-]?\d+)?|[+\-*/^=<>(),;|\u2248\u00b1\u2208\u00b7\u222a\u2229]|\S/g) || [];
    return tokens.map(function (t) {
      if (/^\d/.test(t)) return num(t);
      if (/^[A-Za-z\u0394\u03c0\u03bb\u03b8\u221e\u2205\u221a]/.test(t)) {
        if (t === 'Infinity') return sym('\u221e');
        if (t === 'sqrt' || t === '\u221a') return sym('\u221a');
        if (t === '\u0394') return sym('\u0394');
        return sym(t);
      }
      if (t === ';' || t === ',' || t === '\u222a' || t === '\u2229' || t === '\u2208') return punct(t);
      if (t === '(' || t === ')' || t === '[' || t === ']' || t === '|') return punct(t);
      if (t === '\u2248' || t === '\u00b1' || t === '\u00b7') return op(t);
      if (t === '=' || t === '<' || t === '>') return op(t);
      if (t === '+' || t === '-' || t === '*' || t === '^') {
        return op({ '+': '+', '-': '\u2212', '*': '\u00b7', '^': '^' }[t]);
      }
      if (t === '/' || t === '\u00f7') return op('\u00f7');
      return text(t);
    });
  }

  /* Equalities and inequalities are not part of the math.js expression grammar;
     split them here so both sides keep their own box structure. */
  function splitRel(s) {
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      if (depth > 0) continue;
      var two = s.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '!=') {
        var a = s.slice(0, i).trim(), b = s.slice(i + 2).trim();
        if (a && b) return { a: a, b: b, op: { '<=': '\u2264', '>=': '\u2265', '!=': '\u2260' }[two] };
      }
      if (c === '=' && s[i - 1] !== '=' && s[i - 1] !== '!' && s[i - 1] !== '<' && s[i - 1] !== '>' && s[i + 1] !== '=') {
        var l = s.slice(0, i).trim(), r = s.slice(i + 1).trim();
        if (l && r) return { a: l, b: r, op: '=' };
      }
      if ((c === '<' || c === '>') && s[i + 1] !== '=' && s[i + 1] !== c) {
        var l2 = s.slice(0, i).trim(), r2 = s.slice(i + 1).trim();
        if (l2 && r2) return { a: l2, b: r2, op: c };
      }
    }
    return null;
  }

  /* A truncated series ends with an ellipsis, rendered as \\cdots. */
  function ellipsisRow(body, mark) {
    return parseOne(body).concat([op('+'), sym('\u22ef')]);
  }

  /* Bounds of a TeX-style \\sum_{n=0}^{∞}: keep "n = 0" as real nodes. */
  function boundRow(txt) {
    var t = String(txt).trim();
    var m = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(t);
    if (m) return [sym(m[1]), op('='), num(m[2])];
    var ar = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:\\to|\u2192)\s*(-?)(\u221e|Infinity|\d+(?:\.\d+)?)$/.exec(t);
    if (ar) return [sym(ar[1]), op('\u2192')].concat(
      ar[2] ? [op('\u2212'), sym('\u221e')] : parseOne(ar[3]));
    return parseOne(t);
  }

  function parseOne(s) {
    s = s.trim();
    if (!s) return [];
    /* math.parse folds Infinity into a constant that astToRow rendered as 0;
       keep the infinity symbol explicit so limits can display it. */
    /* "no limit" is a mathematical symbol, never a raw English word. */
    if (s === 'undefined' || s === 'DNE' || s === '\u2204') return [sym('\u2204')];
    /* A literal NaN is not the number zero: keep it as a symbol so the
       solver can report the expression as undefined. */
    if (s === 'NaN') return [sym('NaN')];
    if (/^[-−]?(?:∞|Infinity|infinity)$/i.test(s)) {
      return /^[-−]/.test(s) ? [op('\u2212'), sym('\u221e')] : [sym('\u221e')];
    }
    /* An exact integer with more than 15 digits loses every digit if it is
       parsed as a JS Number (100! became 9.33x10^59). Keep the literal
       digit string so BigInt results stay exact end to end. */
    if (/^-?\d+$/.test(s) && s.replace(/^-/, '').length > 15) return [num(s)];
    var approx = /^\s*\u2248\s*(-?\d+\.?\d*)\s*$/.exec(s);
    if (approx) return [op('\u2248'), num(approx[1])];

    /* Truncated infinite series: "x + 1/2*x^2 + ⋯". Keeps the rest of the
       row parseable instead of letting math.js choke on the ellipsis. */
    var ell = /^(.*?)\s*\+\s*(\u22ef|\u2026|\.\.\.|\\cdots|\\dots|\\ldots)\s*$/.exec(s);
    if (ell && ell[1].trim()) return ellipsisRow(ell[1], ell[2]);

    /* Exact summation form: \sum_{n=0}^{∞} x^n/n! — a real big-operator box,
       not a text string. Used for Taylor series and LaTeX round-trips. */
    var sumM = /^\\(?:sum|prod)_\{([^}]*)\}(?:\^\{([^}]*)\})?\s*(.+)$/.exec(s);
    if (sumM) {
      var loR = boundRow(sumM[1]);
      var hiR = sumM[2] ? boundRow(sumM[2]) : null;
      return [big('sum', parseOne(sumM[3]), loR, hiR)];
    }
    var limM = /^\\lim_\{([^}]*)\}\s*(.+)$/.exec(s);
    if (limM) return [big('lim', parseOne(limM[2]), boundRow(limM[1]))];
    var intM = /^\\int_\{([^}]*)\}\^\{([^}]*)\}\s*(.+)$/.exec(s);
    if (intM) return [big('intab', parseOne(intM[3]), boundRow(intM[1]), boundRow(intM[2]))];

    /* "x = 27/13, y = 6/13": comma-separated assignments must not be
       swallowed into a fraction denominator. math.js rejects top-level
       commas, and the old fallback produced x=(27)/(13,y)=(6)/(13). */
    var assigns = splitTop(s, ',');
    if (assigns.length > 1 && assigns.every(function (a) {
      return /^[A-Za-z][A-Za-z0-9_]*\s*=/.test(a.trim());
    })) {
      var body = [];
      assigns.forEach(function (a, i) {
        if (i) body.push(punct(','));
        body = body.concat(parseOne(a));
      });
      return body;
    }

    if (LITERAL.test(s)) return [text(s)];
    if (/^[A-Za-z][A-Za-z0-9_]*'+$/.test(s)) return [sym(s)];
    var rel = splitRel(s);
    if (rel) return parseOne(rel.a).concat([op(rel.op)], parseOne(rel.b));
    var iv = intervalRow(s);
    if (iv) return iv;
    var setM = /^\{(.*)\}$/.exec(s);
    if (setM) {
      var items = splitTop(setM[1], ',');
      var body = [];
      items.forEach(function (it, i) {
        if (i) body.push(punct(','));
        body = body.concat(parseOne(it));
      });
      return [setNode(body)];
    }
    if (s === '\u2205' || s === 'emptyset') return [sym('\u2205')];
    try {
      var ast = math.parse(normalize(s));
      var r = astToRow(ast);
      if (r.length) return r;
    } catch (e) {
      var cut = splitFirstTop(s, '/') || splitFirstTop(s, '\u00f7');
      if (cut) {
        var A = parseOne(cut[0]), B = parseOne(cut[1]);
        if (A.length && B.length) return [frac(A, B)];
      }
    }
    return fallbackRow(s);
  }

  function stringToRow(s) {
    s = String(s === undefined || s === null ? '' : s).trim();
    if (!s) return row();
    var out = [];
    var unions = splitTop(s, '\u222a');
    if (unions.length > 1) {
      unions.forEach(function (u, i) {
        if (i) out.push(punct('\u222a'));
        out = out.concat(stringToRow(u));
      });
      return out;
    }
    var parts = splitTop(s, ';');
    parts.forEach(function (p, i) {
      if (i) out.push(punct(';'));
      out = out.concat(parseOne(p));
    });
    return out;
  }

  /* ---------- box tree -> solver expression ---------- */

  function rowToExpr(r) {
    var pieces = r.map(function (n) {
      switch (n.t) {
        case 'num': case 'sym': return n.v === '\u03c0' ? 'pi' :
          n.v === '\u221e' ? 'Infinity' : n.v === '\u2212\u221e' ? '-Infinity' : n.v;
        case 'text': return n.v;
        case 'op': return {
          '\u00d7': '*', '\u00b7': '*', '\u00f7': '/', '\u2212': '-',
          '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u00b1': '+'
        }[n.v] || n.v;
        case 'punct': return n.v === '\u222a' ? ' ; ' : n.v === ';' ? ' ; ' : n.v;
        case 'frac': return '(' + rowToExpr(n.a) + ')/(' + rowToExpr(n.b) + ')';
        case 'pow': {
          var pa = rowToExpr(n.a), pb = rowToExpr(n.b);
          var sa = n.a.length === 1 && (n.a[0].t === 'num' || n.a[0].t === 'sym');
          var sb = n.b.length === 1 && (n.b[0].t === 'num' || n.b[0].t === 'sym');
          return (sa ? pa : '(' + pa + ')') + '^' + (sb ? pb : '(' + pb + ')');
        }
        case 'sqrt': return n.idx
          ? 'nthRoot((' + rowToExpr(n.a) + '), (' + rowToExpr(n.idx) + '))'
          : 'sqrt(' + rowToExpr(n.a) + ')';
        case 'fn': {
          var fname = n.name === 'ln' ? 'log' : n.name;
          var arg = rowToExpr(n.a);
          /* math.js uses log(x, base); the box shows log_{base}(x). */
          if (n.sub && rowToExpr(n.sub).trim()) {
            if (fname === 'log') return 'log(' + arg + ', ' + rowToExpr(n.sub) + ')';
            return fname + '(' + arg + ', ' + rowToExpr(n.sub) + ')';
          }
          return fname + '(' + arg + ')';
        }
        /* Square brackets are array literals, not parentheses: [1,3] must
           stay parseable instead of degrading to (1,3). */
        case 'paren': return n.kind && n.kind.charAt(0) === '['
          ? '[' + rowToExpr(n.a) + ']' : '(' + rowToExpr(n.a) + ')';
        case 'abs': return 'abs(' + rowToExpr(n.a) + ')';
        case 'set': return '{ ' + rowToExpr(n.a) + ' }';
        case 'hole': return '';
        case 'system': return n.rows.map(rowToExpr)
          .filter(function (x) { return x.trim() !== ''; }).join(' ; ');
        case 'big': return rowToExpr(n.a);
        case 'matrix': {
          var matBody = n.rows.length === 1
            ? '[[' + n.rows[0].map(rowToExpr).join(',') + ']]'
            : '[' + n.rows.map(function (rr) {
                return '[' + rr.map(rowToExpr).join(',') + ']';
              }).join(',') + ']';
          /* The |matrix| template is a determinant, not a bare matrix: wrap
             it so det(A)+1 and det(A)=k keep their meaning. */
          return n.variant === 'det' ? 'det(' + matBody + ')' : matBody;
        }
        default: return '';
      }
    });
    /* Adjacent structural groups mean multiplication: two matrices side by
       side (A B = b), or a bracketed group followed by a matrix. math.js
       would otherwise reject "[[1,2]][[x]]" as a syntax error. */
    var GROUP = ['matrix', 'paren', 'abs', 'set', 'pow', 'sqrt', 'fn', 'frac', 'big', 'system'];
    var out = '';
    for (var ri = 0; ri < r.length; ri++) {
      if (ri > 0 && out && pieces[ri]) {
        var pv = r[ri - 1].t, cv = r[ri].t;
        if (GROUP.indexOf(pv) >= 0 && GROUP.indexOf(cv) >= 0) out += '*';
        else if ((pv === 'num' || pv === 'sym') && cv === 'matrix') out += '*';
      }
      out += pieces[ri];
    }
    return out;
  }

  function toSpec(r, intent) {
    var params = {}, detected = null, incomplete = false;
    var bigNode = null, bigCount = 0, systemNode = null;

    function numOf(rr, fallback) {
      if (!rr) return fallback;
      var txt = rowToExpr(rr).trim();
      if (!txt) return fallback;
      var assign = /^[A-Za-z][A-Za-z0-9_]*\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(txt);
      if (assign) return Number(assign[1]);
      if (/^[-\u2212]?(?:\u221e|Infinity)$/.test(txt)) {
        return /^[-\u2212]/.test(txt) ? -Infinity : Infinity;
      }
      var v = Number(txt);
      return isFinite(v) ? v : fallback;
    }
    /* "x→∞", "x→0", "n→-∞", "∞" and plain numbers are all valid limit
       subscripts. Keep the variable name so the solver can substitute it. */
    function limitRow(rr) {
      var txt = rowToExpr(rr).trim();
      var m = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:->|\u2192|=)\s*([-\u2212]?)(\u221e|Infinity|\d+(?:\.\d+)?)$/.exec(txt);
      if (m) {
        var tok = m[2] + m[3];
        var point = /(?:\u221e|Infinity)$/.test(tok)
          ? (/^[-\u2212]/.test(tok) ? -Infinity : Infinity)
          : Number(tok);
        return { variable: m[1], point: isNaN(point) ? 0 : point };
      }
      return { variable: null, point: numOf(rr, 0) };
    }

    function scan(rr) {
      rr.forEach(function (n) {
        if (n.t === 'hole') incomplete = true;
        if (n.t === 'big') {
          bigCount++;
          if (!bigNode) bigNode = n;
          if (n.kind === 'deriv') {
            var dv = n.lo ? rowToExpr(n.lo).trim() : '';
            if (dv) params.variable = dv;
            detected = 'derivative';
          } else if (n.kind === 'intab') {
            params.lower = numOf(n.lo, 0);
            params.upper = numOf(n.hi, 1);
            detected = 'definite';
          } else if (n.kind === 'lim') {
            var lr = limitRow(n.lo);
            params.point = lr.point;
            if (lr.variable) params.variable = lr.variable;
            var side = n.hi ? rowToExpr(n.hi).trim() : '';
            if (side === '+' || side === '−' || side === '-') {
              params.side = side === '+' ? '+' : '-';
            }
            detected = 'limit';
          } else if (n.kind === 'series') {
            params.point = 0; params.order = 6;
            detected = 'series';
          } else if (n.kind === 'sum') {
            params.lower = numOf(n.lo, 1);
            params.upper = numOf(n.hi, Infinity);
            detected = 'sum';
          } else {
            detected = { deriv: 'derivative', int: 'integral', ode: 'ode' }[n.kind] || detected;
          }
        }
        if (n.t === 'matrix') {
          /* A deleted cell leaves an empty row, which serialises to an
             invalid "[[,2],[3,4]]". Treat it exactly like an unfilled hole. */
          var emptyCell = n.rows.some(function (rr) {
            return !rr.length || rr.some(function (cell) {
              return !cell.length || cell.every(function (q) { return q.t === 'hole'; });
            });
          });
          if (emptyCell) incomplete = true;
          if (!detected) detected = intent === 'vector' ? 'vector' : 'matrix';
          params.variant = n.variant || (intent === 'vector' ? 'cross' : 'inv');
        }
        if (n.t === 'system') { systemNode = n; detected = 'solve'; }
        childRows(n).forEach(scan);
      });
    }
    scan(r);
    if (bigCount > 1) incomplete = true;
    if (!detected && intent && intent !== 'auto') detected = intent;

    var expr;
    if (bigNode && bigNode.kind === 'ode') {
      expr = "y' = " + rowToExpr(bigNode.a);
    } else if (bigNode && ['deriv','int','intab','lim','series','sum'].indexOf(bigNode.kind) >= 0) {
      expr = rowToExpr(bigNode.a);
    } else {
      expr = rowToExpr(r);
    }
    if (systemNode) expr = rowToExpr(r);
    /* An empty formula must not inherit the last template's intent. Without
       this, clearing a matrix made every later "2+3" run as matrix inversion. */
    if (!String(expr).trim() && !systemNode) {
      return { expr: '', op: 'auto', params: {}, incomplete: false };
    }
    return { expr: expr, op: detected || 'auto', params: params, incomplete: incomplete };
  }

  global.PLXT = global.PLXT || {};
  global.PLXT.model = {
    N: N, row: row, num: num, sym: sym, op: op, punct: punct, text: text,
    frac: frac, pow: pow, radical: radical, fn: fn, paren: paren, abs: abs,
    big: big, matrix: matrix, setNode: setNode, hole: hole, system: system,
    astToRow: astToRow, stringToRow: stringToRow, rowToExpr: rowToExpr,
    toSpec: toSpec, linkTree: linkTree, childRows: childRows,
    firstBox: firstBox, lastBox: lastBox
  };
})(typeof window !== 'undefined' ? window : globalThis);
