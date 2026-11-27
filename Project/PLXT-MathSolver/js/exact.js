/* Exact-mathematics enhancement layer.
   Adds complex arithmetic, exact large-integer arithmetic, degree input,
   inverse-trigonometric reduction, closed-form improper integrals, symbolic
   FTC for oscillatory integrals, radix conversion and a universal decimal
   companion to exact answers. All results still carry certified steps. */
(function (global) {
  'use strict';
  var math = global.math;
  var mk = null;
  function kernel() {
    if (!mk) mk = global.PLXT.solver.__mk;
    return mk;
  }
  function hasExact() { return !!(global.PLXT && global.PLXT.exact); }
  function R(topic, answer, steps, notes, detail, extra) {
    var k = kernel();
    var r = k.result(topic, 'L2', answer,
      [{ id: 'EXACT_COMPUTATION', steps: steps || [] }], null, notes || [], detail || '');
    if (extra) for (var x in extra) r[x] = extra[x];
    return r;
  }
  function Step(rule, before, after, cert, opts) {
    return kernel().S(rule, before, after, cert, opts);
  }
  function O(rule, before, after, check, payload) {
    return kernel().OStep(rule, before, after, check, payload);
  }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function evalN(e, scope) { return kernel().evalNum(e, scope || {}); }

  /* ------------------------------------------------------------------ *
   * 1. Input normalisation: degrees and portable inverse-trig names
   * ------------------------------------------------------------------ */
  /* LaTeX \left( \right) nested around function arguments yields
     acos((cos((5)))) and log((-1)). Collapse one redundant layer at a time
     so the exact-form rules still recognise the mathematical expression. */
  function collapseParens(src) {
    var t = src, changed = true, guard = 0;
    while (changed && guard++ < 24) {
      changed = false;
      for (var i = 0; i < t.length - 1; i++) {
        if (t[i] !== '(' || t[i + 1] !== '(') continue;
        var depth = 0, end = -1;
        for (var j = i; j < t.length; j++) {
          if (t[j] === '(') depth++;
          else if (t[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end <= i + 2 || t[end - 1] !== ')') continue;
        var d2 = 0, innerEnd = -1;
        for (var k = i + 1; k < t.length; k++) {
          if (t[k] === '(') d2++;
          else if (t[k] === ')') { d2--; if (d2 === 0) { innerEnd = k; break; } }
        }
        if (innerEnd !== end - 1) continue;
        t = t.slice(0, i) + t.slice(i + 1, end) + t.slice(end + 1);
        changed = true;
        break;
      }
    }
    return t;
  }

  function normalize(s) {
    var t = String(s == null ? '' : s);
    /* DMS: 12°30′15″ -> ((12 + 30/60 + 15/3600) * pi / 180) */
    t = t.replace(/(\d+(?:\.\d+)?)\s*\u00b0\s*(\d+(?:\.\d+)?)\s*[\u2032']\s*(\d+(?:\.\d+)?)\s*(?:\u2033|''|")/g,
      function (_, d, m, sec) {
        return '((' + d + '+' + m + '/60+' + sec + '/3600)*pi/180)';
      });
    t = t.replace(/(\d+(?:\.\d+)?)\s*\u00b0\s*(\d+(?:\.\d+)?)\s*[\u2032']/g,
      function (_, d, m) { return '((' + d + '+' + m + '/60)*pi/180)'; });
    /* A bare degree suffix on any parenthesised or numeric quantity. */
    t = t.replace(/(\d+(?:\.\d+)?|\))(?=\s*\u00b0)/g, '$1');
    t = t.replace(/(\d+(?:\.\d+)?|\))\s*\u00b0/g, function (_, q) {
      return '(' + q + '*pi/180)';
    });
    /* Portable names used by LaTeX and by some textbooks. */
    var names = {
      arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot',
      arcsec: 'asec', arccsc: 'acsc', arcsinh: 'asinh', arccosh: 'acosh',
      arctanh: 'atanh', arccoth: 'acoth', arcsech: 'asech', arccsch: 'acsch'
    };
    Object.keys(names).forEach(function (a) {
      t = t.replace(new RegExp('\\b' + a + '\\s*\\(', 'g'), names[a] + '(');
    });
    return collapseParens(t);
  }

  /* ------------------------------------------------------------------ *
   * 2. Exact rational arithmetic with BigInt (no floating point loss)
   * ------------------------------------------------------------------ */
  function babs(a) { return a < 0n ? -a : a; }
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1n; }
  function rat(n, d) {
    if (d === 0n) return null;
    if (d < 0n) { n = -n; d = -d; }
    var g = bgcd(n, d);
    return { n: n / g, d: d / g };
  }
  function rmul(a, b) { return rat(a.n * b.n, a.d * b.d); }
  function rdiv(a, b) { return b.n === 0n ? null : rat(a.n * b.d, a.d * b.n); }
  function radd(a, b) { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
  function rsub(a, b) { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
  function rpow(a, e) {
    if (e < 0n) { a = rat(a.d, a.n); e = -e; }
    if (e > 4096n) return null;
    var r = { n: 1n, d: 1n }, base = a, k = e;
    while (k > 0n) {
      if (k & 1n) r = rmul(r, base);
      base = rmul(base, base);
      k >>= 1n;
      if (base.n.toString().length > 900 || base.d.toString().length > 900) return null;
    }
    return r;
  }
  function parseDecimal(txt) {
    var m = /^(\d+)(?:\.(\d+))?$/.exec(txt);
    if (!m) return null;
    var frac = m[2] || '', d = 10n ** BigInt(frac.length);
    return rat(BigInt(m[1] + frac), d);
  }
  /* Recursive descent over  + - * / ^ ( ) digits .  */
  function exactArithmetic(src) {
    var s = String(src).replace(/\s+/g, '');
    if (!s || !/^[\d.+\-*/^()]+$/.test(s)) return null;
    if (!/\d/.test(s)) return null;
    var i = 0, bad = false;
    function expr() {
      var v = term();
      while (i < s.length && (s[i] === '+' || s[i] === '-')) {
        var op = s[i++], w = term();
        if (!v || !w) { bad = true; return null; }
        v = op === '+' ? radd(v, w) : rsub(v, w);
      }
      return v;
    }
    function term() {
      var v = unary();
      while (i < s.length && (s[i] === '*' || s[i] === '/')) {
        var op = s[i++], w = unary();
        if (!v || !w) { bad = true; return null; }
        v = op === '*' ? rmul(v, w) : rdiv(v, w);
      }
      return v;
    }
    function unary() {
      var sign = 1;
      while (i < s.length && (s[i] === '+' || s[i] === '-')) {
        if (s[i] === '-') sign = -sign;
        i++;
      }
      var v = power();
      return sign < 0 && v ? rat(-v.n, v.d) : v;
    }
    function power() {
      var v = primary();
      if (v && i < s.length && s[i] === '^') {
        i++;
        var e = unary();
        if (!e || e.d !== 1n) { bad = true; return null; }
        v = rpow(v, e.n);
      }
      return v;
    }
    function primary() {
      if (i >= s.length) { bad = true; return null; }
      if (s[i] === '(') {
        i++;
        var v = expr();
        if (i >= s.length || s[i] !== ')') { bad = true; return null; }
        i++;
        return v;
      }
      var j = i;
      while (i < s.length && /[\d.]/.test(s[i])) i++;
      if (j === i) { bad = true; return null; }
      return parseDecimal(s.slice(j, i));
    }
    var v = expr();
    if (bad || !v || i !== s.length) return null;
    if (v.n.toString().length > 900 || v.d.toString().length > 900) return null;
    return v.d === 1n ? v.n.toString() : v.n + '/' + v.d;
  }

  /* ------------------------------------------------------------------ *
   * 3. Recognise exact constants from floating point values
   * ------------------------------------------------------------------ */
  function ratStr(v) {
    var q = kernel().rationalize(v);
    return q.exact ? q.s : null;
  }
  var PI = Math.PI;
  function exactConstant(v) {
    if (!finite(v)) return null;
    if (Math.abs(v) < 1e-12) return '0';
    var int = Math.round(v);
    if (Math.abs(v - int) < 1e-11) return String(int);
    var q = ratStr(v);
    if (q && Math.abs(v - evalN(q, {})) < 1e-11) return q;
    /* Rational multiples and fractions of pi. */
    for (var d = 1; d <= 12; d++) for (var n = -24; n <= 24; n++) {
      if (!n) continue;
      var cand = n * PI / d;
      if (Math.abs(v - cand) < 1e-9 * (1 + Math.abs(v))) {
        var body = Math.abs(n) === 1 ? 'pi' : Math.abs(n) + '*pi';
        var s = (n < 0 ? '-' : '') + body;
        return d === 1 ? s : s + '/' + d;
      }
    }
    var surds = [[2, 'sqrt(2)'], [3, 'sqrt(3)'], [5, 'sqrt(5)'], [6, 'sqrt(6)'],
      [7, 'sqrt(7)'], [10, 'sqrt(10)'], [17, 'sqrt(17)'], [PI / 2, 'sqrt(pi)/2'],
      [PI, 'sqrt(pi)'], [PI * PI / 6, 'pi^2/6'], [Math.log(2), 'log(2)'],
      [Math.E, 'e'], [1 / Math.E, '1/e']];
    for (var j = 0; j < surds.length; j++) {
      if (Math.abs(Math.abs(v) - surds[j][0]) < 1e-9) return (v < 0 ? '-' : '') + surds[j][1];
      for (var k = 2; k <= 12; k++) if (Math.abs(Math.abs(v) - surds[j][0] / k) < 1e-9)
        return (v < 0 ? '-' : '') + surds[j][1] + '/' + k;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 4. Complex numbers
   * ------------------------------------------------------------------ */
  function complexString(c) {
    if (!c || typeof c !== 'object') return null;
    var re = c.re, im = c.im;
    if (typeof re !== 'number' || typeof im !== 'number') return null;
    if (!finite(re) || !finite(im)) return null;
    if (Math.abs(im) < 1e-11) return exactConstant(re) || String(Math.round(re * 1e8) / 1e8);
    if (Math.abs(re) < 1e-11) {
      var u = exactConstant(Math.abs(im)) || String(Math.round(Math.abs(im) * 1e8) / 1e8);
      var sign = im < 0 ? '-' : '';
      if (u === '1') return sign + 'i';
      if (u === 'pi') return sign + 'i*pi';
      if (/^pi\//.test(u)) return sign + 'i*' + u;
      /* Numeric coefficients use implicit multiplication: 2i, not 2*i. */
      return sign + (/^[\d.]+$/.test(u) ? u + 'i' : u + '*i');
    }
    var a = exactConstant(re) || String(Math.round(re * 1e8) / 1e8);
    if (Math.abs(Math.abs(im) - 1) < 1e-11) return a + (im > 0 ? '+i' : '-i');
    var b = exactConstant(Math.abs(im)) || String(Math.round(Math.abs(im) * 1e8) / 1e8);
    var tail = /^[\d.]+$/.test(b) ? b + 'i' : b + '*i';
    return a + (im > 0 ? '+' : '-') + tail;
  }
  function isComplexInput(s) {
    return /(^|[^A-Za-z0-9_])i([^A-Za-z0-9_]|$)/.test(s) ||
      /sqrt\s*\(\s*-/.test(s) || /log\s*\(\s*-/.test(s) ||
      /\(\s*-1\s*\)\s*\^/.test(s) || /exp\s*\(\s*i/.test(s) ||
      /\b(conj|arg|imag|real)\s*\(/.test(s) || /-\s*\d+\s*\*?\s*i\b/.test(s);
  }
  var COMPLEX_RULES = [
    [/^log\s*\(\s*-1\s*\)$/i, 'i*pi', 'LOG_NEGATIVE_ONE'],
    [/^ln\s*\(\s*-1\s*\)$/i, 'i*pi', 'LOG_NEGATIVE_ONE'],
    [/^log\s*\(\s*i\s*\)$/i, 'i*pi/2', 'LOG_IMAGINARY_UNIT'],
    [/^sqrt\s*\(\s*-1\s*\)$/i, 'i', 'SQRT_NEGATIVE_ONE'],
    [/^exp\s*\(\s*i\s*\*\s*pi\s*\)$/i, '-1', 'EULER_IDENTITY'],
    [/^i\s*\^\s*2$/i, '-1', 'IMAGINARY_UNIT_SQUARE'],
    [/^i\s*\^\s*3$/i, '-i', 'IMAGINARY_UNIT_POWER'],
    [/^i\s*\^\s*4$/i, '1', 'IMAGINARY_UNIT_POWER']
  ];
  function complexExact(raw) {
    var s = String(raw).trim();
    if (!isComplexInput(s)) return null;
    for (var i = 0; i < COMPLEX_RULES.length; i++) {
      if (COMPLEX_RULES[i][0].test(s)) {
        return { answer: COMPLEX_RULES[i][1], rule: COMPLEX_RULES[i][2] };
      }
    }
    /* sqrt(-n) keeps an exact surd factor instead of a decimal. */
    var neg = /^sqrt\s*\(\s*-(\d+(?:\.\d+)?)\s*\)$/i.exec(s);
    if (neg) {
      var v = Number(neg[1]), root = Math.sqrt(v);
      var near = Math.round(root);
      var fac = Math.abs(root - near) < 1e-10 ? String(near) : 'sqrt(' + v + ')';
      return { answer: (fac === '1' ? '' : fac) + 'i', rule: 'SQRT_NEGATIVE' };
    }
    try {
      var value = math.evaluate(s);
      var str = complexString(value && value.constructor && typeof value.re === 'number' ? value : null) ||
        (typeof value === 'number' ? exactConstant(value) : null);
      if (str && str.replace(/\s/g, '') !== s.replace(/\s/g, '')) {
        return { answer: str, rule: 'COMPLEX_ARITHMETIC' };
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 5. Inverse trigonometric reduction to exact pi-linear form
   * ------------------------------------------------------------------ */
  function linPi(s) {
    var txt = String(s).replace(/\s+/g, '');
    var parts = txt.match(/[+-]?[^+-]+/g) || [];
    var a = 0, b = 0, ok = true;
    parts.forEach(function (term) {
      if (!term) return;
      var neg = term[0] === '-';
      var body = term.replace(/^[+-]/, '');
      if (/\bpi\b/.test(body)) {
        var coeff = body.replace(/\bpi\b/g, '1').replace(/^\*/, '').replace(/\*$/, '');
        try {
          var av = math.evaluate(coeff);
          if (!finite(av)) ok = false; else a += (neg ? -av : av);
        } catch (e) { ok = false; }
      } else {
        try {
          var bv = math.evaluate(body);
          if (!finite(bv)) ok = false; else b += (neg ? -bv : bv);
        } catch (e) { ok = false; }
      }
    });
    return ok ? { a: a, b: b } : null;
  }
  function linPiString(o) {
    var a = o.a, b = o.b;
    var qa = kernel().rationalize(a), qb = kernel().rationalize(b);
    if (!qa.exact || !qb.exact) return null;
    function coeff(q) {
      if (q.n === 1 && q.d === 1) return 'pi';
      if (q.n === -1 && q.d === 1) return '-pi';
      if (q.d === 1) return q.n + '*pi';
      return q.d === 1 ? q.n + '*pi' : q.n + '*pi/' + q.d;
    }
    var as = qa.n === 0 ? '' : coeff(qa);
    var bs = qb.n === 0 ? '' : qb.s;
    if (!as) return bs || '0';
    if (!bs) return as;
    /* Prefer 5-2*pi over -2*pi+5, and 2*pi-5 over -5+2*pi. */
    if (qa.n < 0 && qb.n > 0) return bs + as;
    if (bs[0] === '-') return as + bs;
    return as + '+' + bs;
  }
  function inverseTrig(raw) {
    var m = /^(acos|asin|atan)\s*\(\s*(cos|sin|tan)\s*\(\s*(.+?)\s*\)\s*\)$/i.exec(String(raw).trim());
    if (!m) return null;
    var outer = m[1].toLowerCase(), inner = m[2].toLowerCase();
    if ((outer === 'acos' && inner !== 'cos') ||
        (outer === 'asin' && inner !== 'sin') ||
        (outer === 'atan' && inner !== 'tan')) return null;
    var lp = linPi(m[3]);
    if (!lp) return null;
    var r = lp.a * PI + lp.b;
    var a, b;
    if (outer === 'acos') {
      var k = Math.floor(r / (2 * PI));
      var r1a = lp.a - 2 * k, r1b = lp.b;
      if (r1a * PI + r1b > PI + 1e-12) { a = 2 - r1a; b = -r1b; }
      else { a = r1a; b = r1b; }
    } else if (outer === 'asin') {
      var k2 = Math.floor((r + PI / 2) / (2 * PI));
      var s2a = lp.a - 2 * k2, s2b = lp.b;
      if (s2a * PI + s2b > PI / 2 + 1e-12) { a = 1 - s2a; b = -s2b; }
      else { a = s2a; b = s2b; }
    } else {
      var k3 = Math.round(r / PI);
      a = lp.a - k3; b = lp.b;
      while (a * PI + b > PI / 2 + 1e-12) { a -= 1; }
      while (a * PI + b < -PI / 2 - 1e-12) { a += 1; }
    }
    var str = linPiString({ a: a, b: b });
    if (!str || str === String(raw).replace(/\s/g, '')) return null;
    /* Verify the reduced principal value numerically. */
    var v = evalN(String(raw).trim(), {});
    var back = evalN(str, {});
    if (!finite(v) || !finite(back) || Math.abs(v - back) > 1e-8) return null;
    return { answer: str, rule: 'INVERSE_TRIG_PRINCIPAL_VALUE' };
  }

  /* ------------------------------------------------------------------ *
   * 6. Closed-form definite integrals
   * ------------------------------------------------------------------ */
  function sameFunction(f, g) {
    /* Compare only where both sides are real and finite. sqrt(1-x^2) and
       log(x) have restricted domains; a single outside point used to make
       every such closed-form integral fail to match. */
    var pts = [0.17, 0.31, 0.63, 0.87, -0.29, -0.61, 1.13, 1.27, 2.11, 3.07];
    var compared = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = evalN(f, { x: pts[i] }), b = evalN(g, { x: pts[i] });
      if (!finite(a) || !finite(b)) continue;
      if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(a) + Math.abs(b))) return false;
      compared++;
    }
    return compared >= 3;
  }
  function sameEnd(a, b) {
    if (a === Infinity && b === Infinity) return true;
    if (a === -Infinity && b === -Infinity) return true;
    return finite(a) && finite(b) && Math.abs(a - b) < 1e-9;
  }
  var SPECIAL_INTEGRALS = [
    { f: 'exp(-x^2)', a: 0, b: Infinity, v: 'sqrt(pi)/2', name: 'GAUSSIAN_HALF' },
    { f: 'exp(-x^2)', a: -Infinity, b: Infinity, v: 'sqrt(pi)', name: 'GAUSSIAN_FULL' },
    { f: '-log(x)/(1-x)', a: 0, b: 1, v: 'pi^2/6', name: 'EULER_ZETA_TWO' },
    { f: 'log(x)/(x-1)', a: 0, b: 1, v: 'pi^2/6', name: 'EULER_ZETA_TWO' },
    { f: 'sin(x)/x', a: 0, b: Infinity, v: 'pi/2', name: 'DIRICHLET_INTEGRAL' },
    { f: '1/(1+x^2)', a: 0, b: Infinity, v: 'pi/2', name: 'ARCTANGENT_INTEGRAL' },
    { f: '1/(1+x^2)', a: -Infinity, b: Infinity, v: 'pi', name: 'CAUCHY_INTEGRAL' },
    { f: '1/sqrt(1-x^2)', a: 0, b: 1, v: 'pi/2', name: 'ARCSINE_INTEGRAL' },
    { f: 'log(sin(x))', a: 0, b: PI / 2, v: '-pi*log(2)/2', name: 'LOG_SINE_INTEGRAL' },
    { f: 'x*exp(-x)', a: 0, b: Infinity, v: '1', name: 'GAMMA_TWO' },
    { f: 'x^2*exp(-x)', a: 0, b: Infinity, v: '2', name: 'GAMMA_THREE' },
    { f: 'exp(-x)', a: 0, b: Infinity, v: '1', name: 'EXPONENTIAL_DECAY' },
    { f: 'log(x)', a: 0, b: 1, v: '-1', name: 'LOG_INTEGRAL' },
    { f: '1/sqrt(x)', a: 0, b: 1, v: '2', name: 'ROOT_RECIPROCAL' },
    { f: 'sqrt(x)', a: 0, b: 1, v: '2/3', name: 'SQRT_INTEGRAL' },
    { f: 'sqrt(1-x^2)', a: -1, b: 1, v: 'pi/2', name: 'SEMICIRCLE_INTEGRAL' },
    { f: 'x/sqrt(1-x^2)', a: 0, b: 1, v: '1', name: 'ARCSINE_DERIVATIVE' },
    { f: 'sin(x)^2', a: 0, b: PI, v: 'pi/2', name: 'SIN_SQUARED' },
    { f: 'cos(x)^2', a: 0, b: PI, v: 'pi/2', name: 'COS_SQUARED' },
    { f: 'x*sin(x)', a: 0, b: PI, v: 'pi', name: 'X_SIN_X' },
    { f: '1/(1+x^2)', a: 0, b: 1, v: 'pi/4', name: 'ARCTAN_QUARTER' },
    { f: '1/(1+x^2)', a: -1, b: 1, v: 'pi/2', name: 'ARCTAN_SYMMETRIC' },
    { f: 'exp(x)', a: 0, b: 1, v: 'e-1', name: 'EXP_UNIT' }
  ];
  function endLabel(k, v) {
    if (v === Infinity) return '\u221e';
    if (v === -Infinity) return '-\u221e';
    return k.rationalize(v).s;
  }

  function specialIntegral(raw, a, b) {
    for (var i = 0; i < SPECIAL_INTEGRALS.length; i++) {
      var s = SPECIAL_INTEGRALS[i];
      if (!sameEnd(a, s.a) || !sameEnd(b, s.b)) continue;
      if (!sameFunction(raw, s.f)) continue;
      var exact = evalN(s.v, {});
      if (!finite(exact)) continue;
      return { answer: s.v, value: exact, name: s.name };
    }
    return null;
  }
  /* Symbolic fundamental theorem for long or oscillatory intervals. */
  var FTC_TABLE = [
    { f: 'sin(x)', sym: function (A, B) { return 'cos(' + A + ')-cos(' + B + ')'; } },
    { f: 'cos(x)', sym: function (A, B) { return 'sin(' + B + ')-sin(' + A + ')'; } },
    { f: 'exp(x)', sym: function (A, B) { return 'exp(' + B + ')-exp(' + A + ')'; } },
    { f: 'sinh(x)', sym: function (A, B) { return 'cosh(' + B + ')-cosh(' + A + ')'; } },
    { f: 'cosh(x)', sym: function (A, B) { return 'sinh(' + B + ')-sinh(' + A + ')'; } }
  ];
  /* sin(0), cos(0), exp(0) are exact endpoint values. Keeping them
     unevaluated produced answers such as "sin(1000)-sin(0)". */
  function cleanEndpoints(sym) {
    var s = sym
      .replace(/sin\(0\)/g, '0').replace(/tan\(0\)/g, '0')
      .replace(/cos\(0\)/g, '1').replace(/exp\(0\)/g, '1')
      .replace(/sinh\(0\)/g, '0').replace(/cosh\(0\)/g, '1');
    s = s.replace(/\+\s*0(?=\b|$)/g, '').replace(/-\s*0(?=\b|$)/g, '')
         .replace(/^0\+/, '').replace(/^0-/, '');
    return s || sym;
  }

  function symbolicFTC(raw, a, b) {
    if (!finite(a) || !finite(b)) return null;
    if (Math.abs(b) < 20 && Math.abs(a) < 20) return null;
    for (var i = 0; i < FTC_TABLE.length; i++) {
      if (!sameFunction(raw, FTC_TABLE[i].f)) continue;
      var A = kernel().rationalize(a), B = kernel().rationalize(b);
      if (!A.exact || !B.exact) continue;
      var sym = FTC_TABLE[i].sym(A.s, B.s);
      var v = evalN(sym, {});
      if (!finite(v)) continue;
      var q = kernel().rationalize(v);
      if (q.exact && !/[a-z]/i.test(q.s)) return { answer: q.s, value: v, sym: sym };
      /* Keep a closed form with exact endpoints, e.g. 1-cos(1000). */
      var compact = cleanEndpoints(sym);
      var cv = evalN(compact, {});
      if (!finite(cv) || Math.abs(cv - v) > 1e-6 * (1 + Math.abs(v))) compact = sym;
      return { answer: compact, value: v, sym: compact };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 7. Radix conversion
   * ------------------------------------------------------------------ */
  function parseIntegerToken(t) {
    t = String(t).trim();
    var m = /^0([bBoOxX])([0-9a-fA-F]+)$/.exec(t);
    if (m) {
      var base = ({ b: 2, o: 8, x: 16 })[m[1].toLowerCase()];
      try { return { n: BigInt('0' + (base === 16 ? 'x' : base === 8 ? 'o' : 'b') + m[2]), base: base }; }
      catch (e) { return null; }
    }
    if (/^-?\d+$/.test(t)) { try { return { n: BigInt(t), base: 10 }; } catch (e) { return null; } }
    return null;
  }
  function toBase(n, base) {
    if (n < 0n) return '-' + toBase(-n, base);
    var digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', out = '';
    if (n === 0n) return '0';
    var B = BigInt(base);
    while (n > 0n) { out = digits[Number(n % B)] + out; n /= B; }
    return out;
  }
  function baseConvert(raw) {
    var s = String(raw).trim();
    var m = /^(bin|hex|oct|dec|base)\s*\((.+)\)$/i.exec(s);
    var target = null, token = null;
    if (m) {
      var fn = m[1].toLowerCase(), args = m[2].split(',');
      token = parseIntegerToken(args[0]);
      if (fn === 'bin') target = 2;
      else if (fn === 'hex') target = 16;
      else if (fn === 'oct') target = 8;
      else if (fn === 'dec') target = 10;
      else if (fn === 'base' && args[1]) {
        target = Number(args[1].trim());
        if (!Number.isInteger(target) || target < 2 || target > 36) target = null;
      }
    } else {
      var lit = /^0([bBoOxX])([0-9a-fA-F]+)$/.exec(s);
      if (lit) {
        token = parseIntegerToken(s);
        target = 10;
      }
    }
    if (!token || !target) return null;
    var n = token.n;
    var prefixes = { 2: '0b', 8: '0o', 10: '', 16: '0x' };
    var answer = (prefixes[target] !== undefined ? prefixes[target] : '(' + target + ')') + toBase(n, target);
    var note = 'DEC ' + n.toString() + '  =  BIN ' + toBase(n, 2) +
      '  =  OCT ' + toBase(n, 8) + '  =  HEX ' + toBase(n, 16);
    return { answer: answer, note: note, value: n.toString() };
  }

  /* ------------------------------------------------------------------ *
   * 8. Universal decimal companion for exact answers
   * ------------------------------------------------------------------ */
  var CONST_NAMES = { pi: 1, e: 1, i: 1, Infinity: 1, NaN: 1, true: 1, false: 1, phi: 1 };
  function fmt8(v) {
    /* Ten significant digits: 1/123456789 must not collapse to
       "0.00000001" (a 19% error) in the decimal note. */
    if (!isFinite(v)) return String(v);
    return String(Number(v.toPrecision(10)));
  }
  function scalarApprox(v) {
    if (typeof v === 'number') {
      if (!finite(v)) return '';
      /* Use a tolerance relative to the value itself: an absolute 1e-12
         swallowed 1/2^40 (9.1e-13) as if it were the integer 0. */
      if (Math.abs(v - Math.round(v)) < 1e-12 * Math.abs(v)) return '';
      return '\u2248 ' + fmt8(v);
    }
    if (v && typeof v === 'object' && typeof v.re === 'number') {
      var re = v.re, im = v.im;
      if (Math.abs(im) < 1e-12) return scalarApprox(re);
      /* 5+i and 2i are already exact and readable; no decimal line needed. */
      if (Math.abs(re - Math.round(re)) < 1e-12 * Math.max(1, Math.abs(re)) &&
          Math.abs(Math.abs(im) - Math.round(Math.abs(im))) <
            1e-12 * Math.max(1, Math.abs(im))) return '';
      if (Math.abs(re) < 1e-12) {
        if (Math.abs(Math.abs(im) - Math.round(Math.abs(im))) < 1e-11) return '';
        return '\u2248 ' + (im < 0 ? '-' : '') + fmt8(Math.abs(im)) + 'i';
      }
      return '\u2248 ' + fmt8(re) + (im > 0 ? '+' : '-') + fmt8(Math.abs(im)) + 'i';
    }
    return '';
  }
  /* math.js exposes built-ins such as sqrt/cos/log as SymbolNodes used as
     function heads. Only symbols that are neither constants nor function
     heads are genuine free variables. */
  function hasFreeVariable(nd) {
    var heads = {}, free = false;
    nd.traverse(function (n) {
      if (n.isFunctionNode && n.fn && n.fn.name) heads[n.fn.name] = 1;
    });
    nd.traverse(function (n) {
      if (n.isSymbolNode && !CONST_NAMES[n.name] && !heads[n.name]) free = true;
    });
    return free;
  }

  function decimalApprox(answer) {
    var s = String(answer == null ? '' : answer).trim();
    if (!s || s === '\u221e' || s === '-\u221e' || s === '\u2204') return '';
    /* Solution sets: attach one approximation per root. */
    var set = /^\{(.*)\}$/.exec(s);
    if (set) {
      var parts = set[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      var vals = [];
      for (var i = 0; i < parts.length; i++) {
        try {
          var node = math.parse(parts[i]);
          if (hasFreeVariable(node)) return '';
          var v = math.evaluate(parts[i]);
          var a = scalarApprox(v);
          vals.push(a ? a.replace(/^\u2248\s*/, '') : parts[i]);
        } catch (e) { return ''; }
      }
      if (!vals.some(function (x) { return /^\d/.test(x) && x.indexOf('.') >= 0; })) return '';
      return '\u2248 { ' + vals.join(' , ') + ' }';
    }
    /* Variable assignments such as "x = -4 , y = 9/2": keep the exact
       integers and attach a decimal to the non-integer components. */
    var assigns = s.split(/\s*[,;]\s*/).filter(Boolean);
    if (assigns.length > 1 && assigns.every(function (a) {
      return /^[A-Za-z][A-Za-z0-9_]*\s*=\s*\S/.test(a);
    })) {
      var pieces = [], found = false;
      for (var q = 0; q < assigns.length; q++) {
        var mm = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(assigns[q]);
        if (!mm) return '';
        try {
          var nd2 = math.parse(mm[2]);
          if (hasFreeVariable(nd2)) return '';
          var ap = scalarApprox(math.evaluate(mm[2]));
          if (ap) { pieces.push(mm[1] + ' ' + ap); found = true; }
          else pieces.push(mm[1] + ' = ' + mm[2]);
        } catch (e) { return ''; }
      }
      return found ? pieces.join(' , ') : '';
    }
    try {
      var nd = math.parse(s);
      if (hasFreeVariable(nd)) return '';
      return scalarApprox(math.evaluate(s));
    } catch (e) { return '';
    }
  }

  /* ------------------------------------------------------------------ *
   * 9. Entry point called from the certified kernel
   * ------------------------------------------------------------------ */
  function preSolve(op, expr, params, original) {
    var k = kernel();
    var raw = String(expr || '').trim();
    if (!raw) return null;
    var p = params || {};
    var low = raw.toLowerCase().replace(/\s+/g, '');

    /* Named constants and undefined special functions must never be echoed
       back as if they were a simplified answer. */
    if (low === 'zeta(2)' || low === 'sum(1/n^2)' || low === 'sum(1/n^2,n,1,inf)') {
      return R('special_constant', 'pi^2/6',
        [O('EULER_ZETA_TWO', String(original || raw), 'pi^2/6', 'constant_recount',
          { payload: { verified: true, numeric: Math.PI * Math.PI / 6 } })],
        [], '');
    }
    var gm = /^gamma\(\s*(-?\d+)\s*\)$/.exec(low);
    if (gm && Number(gm[1]) <= 0) return k.failure('undefined', raw);
    if (/^gamma\(\s*0\s*\)$/.test(low)) return k.failure('undefined', raw);

    /* Factorials are exact integers, never floating-point approximations.
       BigInt keeps all 158 digits of 100! intact. */
    if (op === 'simplify' || op === 'auto' || op === 'evaluate') {
      var fm = /^(\d+)!$/.exec(low);
      if (fm && Number(fm[1]) <= 1000) {
        var nn = Number(fm[1]), acc = 1n;
        for (var i2 = 2n; i2 <= BigInt(nn); i2++) acc *= i2;
        var fstr = acc.toString();
        return R('expression_simplification', fstr,
          [O('EXACT_FACTORIAL', String(original || raw), fstr, 'bigint_recount',
            { payload: { verified: true, digits: fstr.length } })],
          [], '');
      }
    }

    /* Radix conversion has its own topic and a plain-text answer. */
    var bc = baseConvert(raw);
    if (bc && (op === 'base' || op === 'auto' || op === 'simplify')) {
      return R('radix_conversion', bc.answer,
        [O('RADIX_CONVERSION', String(original || raw), bc.answer, 'integer_recount',
          { payload: { verified: true, decimal: bc.value } })],
        [], bc.note, { plainAnswer: bc.answer, baseNote: bc.note });
    }

    /* Definite integrals: exact closed forms before quadrature. */
    if (op === 'definite' || op === 'improper') {
      var a = Number(p.lower), b = Number(p.upper);
      if (isNaN(a)) a = 0;
      if (isNaN(b)) b = 1;
      var sp = specialIntegral(raw, a, b);
      if (sp) {
        return R('definite_integral', sp.answer,
          [Step('SPECIAL_INTEGRAL', raw + ' ; [' + endLabel(k, a) + ',' +
            endLabel(k, b) + ']', sp.answer, 'oracle',
            { payload: { verified: true, check: 'closed_form_integral', name: sp.name } }),
           O('EXACT_INTEGRAL_VALUE', sp.answer, sp.answer, 'symbolic_identity',
             { payload: { verified: true, numeric: sp.value } })],
          [], '', { integralExact: true });
      }
      var ftc = symbolicFTC(raw, a, b);
      if (ftc) {
        return R('definite_integral', ftc.answer,
          [O('FUNDAMENTAL_THEOREM_OF_CALCULUS', raw, ftc.sym || ftc.answer,
            'antiderivative_recount', { payload: { verified: true, numeric: ftc.value } }),
           O('EXACT_ENDPOINT_EVALUATION', ftc.sym || ftc.answer, ftc.answer,
             'endpoint_recount', { payload: { verified: true } })],
          [], '', { integralExact: true });
      }
      return null;
    }

    /* Pure-arithmetic exactness (large integers, 0.1+0.2, cancellation). */
    if (op === 'simplify' || op === 'auto' || op === 'evaluate') {
      var ar = exactArithmetic(raw);
      if (ar !== null && ar.replace(/\s/g, '') !== raw.replace(/\s/g, '')) {
        var av = evalN(ar, {});
        return R('expression_simplification', ar,
          [O('EXACT_ARITHMETIC', String(original || raw), ar, 'bigint_recount',
            { payload: { verified: finite(av), numeric: av } })],
          [], '');
      }
    }

    /* Exact constant folding: sin(pi/2)+cos(0) must print 2, not "(1) + (1)".
       Complex powers such as (-2+2i)^2 must print -8i, not the unevaluated
       square. Restricted to expressions without free variables. */
    if (op === 'simplify' || op === 'auto' || op === 'evaluate') {
      try {
        var nd = math.parse(raw), free = false, hasI = false;
        nd.traverse(function (n) {
          if (!n.isSymbolNode) return;
          var nm = n.name;
          if (nm === 'i') hasI = true;
          if (nm === 'pi' || nm === 'e' || nm === 'i' ||
              nm === 'Infinity' || nm === 'NaN') return;
          /* math.parse exposes sin/cos/log/... names as SymbolNodes too. */
          if (typeof math[nm] === 'function') return;
          free = true;
        });
        if (!free) {
          var cv = math.evaluate(raw);
          if (typeof cv === 'number' && finite(cv) &&
              Math.abs(cv - Math.round(cv)) < 1e-10 && Math.abs(cv) < 1e14 &&
              raw.replace(/\s/g, '') !== String(Math.round(cv)) &&
              /[a-z]\s*\(/.test(raw)) {
            return R('expression_simplification', String(Math.round(cv)),
              [O('EXACT_CONSTANT_FOLD', String(original || raw), String(Math.round(cv)),
                'numeric_recount', { payload: { verified: true, numeric: cv } })],
              [], '');
          }
          if (/\^/.test(raw) && hasI && cv &&
              typeof cv === 'object' && typeof cv.re === 'number' &&
              typeof cv.im === 'number' && Math.abs(cv.im) > 1e-9) {
            var cstr = complexString(cv);
            if (cstr && cstr.replace(/\s/g, '') !== raw.replace(/\s/g, '')) {
              return R('expression_simplification', cstr,
                [O('COMPLEX_POWER_FOLD', String(original || raw), cstr,
                  'complex_recount', { payload: { verified: true } })],
                [], '');
            }
          }
        }
      } catch (eFold) { /* fall through to the symbolic kernel */ }
    }

    if (op !== 'simplify' && op !== 'auto' && op !== 'evaluate' &&
        op !== 'expression_simplification') return null;

    /* Complex arithmetic and exact constants of complex expressions. */
    var cx = complexExact(raw);
    if (cx) {
      return R('complex_arithmetic', cx.answer,
        [O(cx.rule, String(original || raw), cx.answer, 'complex_identity',
          { payload: { verified: true } })], [], '');
    }

    /* Principal-value reduction of inverse trigonometric compositions. */
    var it = inverseTrig(raw);
    if (it) {
      return R('inverse_trigonometric_reduction', it.answer,
        [O(it.rule, String(original || raw), it.answer, 'principal_value_recount',
          { payload: { verified: true } })], [], '');
    }

    /* Degree-aware trigonometric values: sin(360 deg) -> 0, cos(180 deg) -> -1. */
    if (/\u00b0/.test(String(original || '')) && math) {
      try {
        var v = evalN(raw, {});
        if (finite(v)) {
          var exact = exactConstant(v);
          if (exact) {
            return R('trigonometric_evaluation', exact,
              [O('DEGREE_TO_RADIAN', String(original), raw, 'angle_conversion',
                { payload: { verified: true } }),
               O('EXACT_TRIGONOMETRIC_VALUE', raw, exact, 'constant_recount',
                 { payload: { verified: true, numeric: v } })], [], '');
          }
        }
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  global.PLXT = global.PLXT || {};
  global.PLXT.exact = {
    normalize: normalize,
    preSolve: preSolve,
    decimalApprox: decimalApprox,
    exactArithmetic: exactArithmetic,
    complexExact: complexExact,
    inverseTrig: inverseTrig,
    specialIntegral: specialIntegral,
    baseConvert: baseConvert,
    sameFunction: sameFunction
  };
})(typeof window !== 'undefined' ? window : globalThis);
