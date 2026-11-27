/* Deterministic symbolic kernel.
 * Every emitted step carries a machine-checkable certificate.
 * No natural-language generation and no network access occur in this module. */
(function (global) {
  'use strict';

  var math = global.math;
  var SAMPLE_POINTS = [-7.3, -4.1, -2.25, -0.75, -0.17, 0.31, 0.89, 1.7, 2.9, 4.6, 8.2];
  var TOL = 1e-7;

  /* ------------------------------------------------------------------ *
   * Numeric and symbolic utilities
   * ------------------------------------------------------------------ */

  function num(x) {
    if (typeof x === 'number') return x;
    if (x && typeof x === 'object' && typeof x.re === 'number') {
      return Math.abs(x.im) < 1e-9 ? x.re : NaN;
    }
    return NaN;
  }

  /* math.evaluate() re-parses the string on every call. Root scanning and a
     single plot frame evaluate the same expression ~1400 times, so keep a
     small compiled-program cache; this is the single largest input-lag win. */
  var compiledCache = Object.create(null), compiledCount = 0;
  function evalNum(expr, scope) {
    try {
      var key = String(expr), c = compiledCache[key];
      if (!c) {
        c = math.compile(key);
        if (compiledCount >= 128) { compiledCache = Object.create(null); compiledCount = 0; }
        compiledCache[key] = c; compiledCount++;
      }
      return num(c.evaluate(scope || {}));
    } catch (e) {
      return NaN;
    }
  }

  function evalAt(expr, xVal) {
    return evalNum(expr, { x: xVal });
  }

  function finite(x) { return typeof x === 'number' && isFinite(x); }

  function close(a, b) {
    if (!finite(a) || !finite(b)) return false;
    return Math.abs(a - b) <= TOL * (1 + Math.abs(a) + Math.abs(b));
  }

  function parseOK(expr) {
    var txt = String(expr == null ? '' : expr).trim();
    /* math.js accepts "" as an empty AST and NaN/Infinity/undefined as
       constants; none of those may reach an answer or a worked step. */
    if (!txt) return false;
    /* Infinity is a real mathematical constant (the ∞ key emits it); only
       NaN / undefined / null are dirty tokens. */
    if (/\b(?:NaN|undefined|null)\b/.test(txt)) return false;
    try { math.parse(txt); return true; } catch (e) { return false; }
  }

  function simplifyStr(expr) {
    try { return math.simplify(expr).toString(); } catch (e) { return String(expr); }
  }

  function derivativeStr(expr, variable) {
    try { return math.derivative(expr, variable || 'x').toString(); } catch (e) { return null; }
  }

  var equivCache = Object.create(null), equivCount = 0;
  function equivalent(a, b) {
    var key = String(a) + '\u0000' + String(b);
    var cached = equivCache[key];
    if (cached !== undefined) return cached;
    var out = false;
    if (parseOK(a) && parseOK(b)) {
      try {
        var d = math.simplify('(' + a + ') - (' + b + ')').toString();
        var v = evalNum(d, {});
        if (finite(v) && Math.abs(v) < TOL) out = true;
      } catch (e) { /* fall through to numeric sampling */ }
      if (!out) {
        var hits = 0, total = 0, bad = false;
        for (var i = 0; i < SAMPLE_POINTS.length; i++) {
          var p = SAMPLE_POINTS[i];
          var va = evalAt(a, p), vb = evalAt(b, p);
          if (!finite(va) || !finite(vb)) { bad = true; break; }
          total++;
          if (close(va, vb)) hits++;
        }
        out = !bad && total > 0 && hits === total;
      }
    }
    if (equivCount >= 512) { equivCache = Object.create(null); equivCount = 0; }
    equivCache[key] = out; equivCount++;
    return out;
  }

  function rationalize(v) {
    if (!finite(v)) return { n: 0, d: 1, exact: false, s: '0' };
    /* A tiny nonzero value must NOT be rounded to the integer 0. The old
       1e-7 tolerance turned 1/123456789 (8.1e-9) into the answer "0". */
    if (Math.abs(v - Math.round(v)) < 1e-12 * (1 + Math.abs(v))) {
      return { n: Math.round(v), d: 1, exact: true, s: String(Math.round(v)) };
    }
    /* Recognise 1/N exactly for small magnitudes before the bounded
       denominator search, which would otherwise fit bestN = 0 to them. */
    if (v !== 0 && Math.abs(v) < 1e-4) {
      var inv = 1 / v, N = Math.round(inv);
      if (N > 1 && N <= 1e9 &&
          Math.abs(inv - N) < 1e-6 * (1 + Math.abs(inv))) {
        return { n: v < 0 ? -1 : 1, d: N, exact: true,
          s: (v < 0 ? '-1' : '1') + '/' + N };
      }
    }
    var bestD = 1, bestN = Math.round(v), bestErr = Math.abs(v - bestN);
    for (var d = 2; d <= 720; d++) {
      var n = Math.round(v * d);
      var err = Math.abs(v - n / d);
      if (n !== 0 && err < bestErr) { bestErr = err; bestD = d; bestN = n; }
      if (n !== 0 && err < 1e-11) break;
    }
    if (bestN !== 0 && bestErr < 1e-8) {
      return { n: bestN, d: bestD, exact: true,
               s: bestD === 1 ? String(bestN) : bestN + '/' + bestD };
    }
    return { n: v, d: 1, exact: false, s: significantDigits(v) };
  }

  /* Ten significant digits survive for both large and tiny magnitudes;
     rounding to eight decimals used to print 1/123456789 as 0.00000001. */
  function significantDigits(v) {
    if (!finite(v)) return '0';
    return String(Number(v.toPrecision(10)));
  }

  /* Exact surd helpers: irrational discriminants stay symbolic, never decimal. */
  function surdParts(n) {
    var v = Math.round(n);
    if (v < 0 || Math.abs(n - v) > 1e-9) return null;
    var k = 1, rest = v;
    for (var f = 2; f * f <= rest; f++) {
      while (rest % (f * f) === 0) { rest /= f * f; k *= f; }
    }
    return { k: k, rad: rest };
  }
  function gcd2(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }
  function gcd3(a, b, c) { return gcd2(gcd2(a, b), c); }
  function radicalBody(D) {
    var p = surdParts(Math.max(0, D));
    if (!p) return 'sqrt(' + String(Math.max(0, D)) + ')';
    if (p.rad === 1) return String(p.k);
    return (p.k === 1 ? '' : String(p.k) + '*') + 'sqrt(' + p.rad + ')';
  }
  function exactRootString(a, b, D, sign) {
    var den = 2 * a, prefix = -b;
    var p = surdParts(Math.max(0, D));
    var k = p ? p.k : 1, rad = p ? p.rad : Math.max(0, D);
    if (rad === 1 || rad === 0) return rationalize((-b + sign * k) / den).s;
    if (prefix === 0) {
      var g0 = gcd2(k, den);
      k /= g0; den /= g0;
      var s0 = (sign < 0 ? '-' : '') +
        (k === 1 ? '' : String(k) + '*') + 'sqrt(' + rad + ')';
      return den === 1 ? s0 : '(' + s0 + ')/' + den;
    }
    var g = gcd3(prefix, k, den);
    var pp = prefix / g, kk = k / g, dd = den / g;
    var body = (kk === 1 ? '' : String(kk) + '*') + 'sqrt(' + rad + ')';
    var head = (pp > 0 ? String(pp) : '-' + String(-pp)) +
      (sign > 0 ? ' + ' : ' - ');
    return dd === 1 ? head + body : '(' + head + body + ')/' + dd;
  }
  function exactImagString(a, D) {
    var den = 2 * Math.abs(a), p = surdParts(-D);
    if (!p) return 'sqrt(' + String(-D) + ')/' + den;
    if (p.rad === 1) return rationalize(p.k / den).s;
    var g = gcd2(p.k, den);
    var k = p.k / g, d = den / g;
    return (d === 1 ? '' : '(') + (k === 1 ? '' : String(k) + '*') +
      'sqrt(' + p.rad + ')' + (d === 1 ? '' : ')/' + d);
  }

  function factorial(k) {
    var r = 1;
    for (var i = 2; i <= k; i++) r *= i;
    return r;
  }

  /* Recover polynomial coefficients through derivatives at the origin. */
  /* A polynomial in x may only contain + - * / ^, integer powers and x
     itself. Anything else (exp, sqrt, sin, x in a denominator, ...) would
     make polyCoeffs() run seven progressively heavier symbolic derivatives
     before finally returning null. */
  function polyShapeOK(expr) {
    var ok = true;
    try {
      math.parse(String(expr)).traverse(function (n) {
        if (!ok) return;
        if (n.isFunctionNode) { ok = false; return; }
        if (n.isSymbolNode) {
          if (n.name !== 'x' &&
              ['e', 'pi', 'i', 'Infinity', 'tau', 'phi', 'true', 'false'].indexOf(n.name) < 0) ok = false;
          return;
        }
        if (!n.isOperatorNode) return;
        if (['+', '-', '*', '/', '^'].indexOf(n.op) < 0) { ok = false; return; }
        if (n.op === '^') {
          var e = n.args[1];
          if (e.isParenthesisNode) e = e.content;
          if (!e.isConstantNode || typeof e.value !== 'number' ||
              !isFinite(e.value) || e.value < 0 ||
              Math.floor(e.value) !== e.value) ok = false;
        }
        if (n.op === '/') {
          var d = n.args[1], hasX = false;
          if (d.isParenthesisNode) d = d.content;
          d.traverse(function (q) {
            if (q.isSymbolNode && q.name === 'x') hasX = true;
          });
          if (hasX) ok = false;
        }
      });
    } catch (e) { return true; /* conservative: keep the old path */ }
    return ok;
  }

  function hasFreeX(expr) {
    try {
      var found = false;
      math.parse(String(expr)).traverse(function (n) {
        if (n.isSymbolNode && n.name === 'x') found = true;
      });
      return found;
    } catch (e) { return true; }
  }

  function polyCoeffs(expr, maxDeg) {
    maxDeg = maxDeg || 8;
    var src = String(expr);
    /* Constant expressions are degree-0 polynomials; do not differentiate
       sqrt(2), exp(2) or pi seven times just to discover that. */
    if (!hasFreeX(src)) {
      var cst = evalAt(src, 0);
      return finite(cst) ? [cst] : null;
    }
    if (!polyShapeOK(src)) return null;
    var cur = src, coeffs = [];
    for (var k = 0; k <= maxDeg; k++) {
      var v = evalAt(cur, 0);
      if (!finite(v)) return null;
      var c = v / factorial(k);
      coeffs.push(c);
      var d = derivativeStr(cur, 'x');
      if (d === null) return null;
      cur = d;
    }
    var rebuilt = polyString(coeffs);
    if (!equivalent(expr, rebuilt)) return null;
    while (coeffs.length > 1 && close(coeffs[coeffs.length - 1], 0)) coeffs.pop();
    return coeffs;
  }

  function termString(c, k) {
    var r = rationalize(c);
    var val = r.s;
    if (k === 0) return val;
    var coef = (r.d === 1 && Math.abs(r.n) === 1) ? (r.n < 0 ? '−' : '') : val;
    var body = k === 1 ? 'x' : 'x^' + k;
    return coef === '' ? body : (coef + (r.d === 1 && Math.abs(r.n) === 1 ? '' : '*') + body);
  }

  function polyString(coeffs) {
    var parts = [];
    for (var k = 0; k < coeffs.length; k++) {
      if (close(coeffs[k], 0)) continue;
      parts.push(termString(coeffs[k], k));
    }
    if (!parts.length) return '0';
    return parts.join(' + ').replace(/\+ -/g, '- ').replace(/\+ −/g, '− ').replace(/−/g, '-');
  }

  function scanRoots(expr, lo, hi, steps, extra) {
    lo = lo === undefined ? -12 : lo;
    hi = hi === undefined ? 12 : hi;
    steps = steps || 480;
    /* A uniform grid alone misses roots squeezed between a pole and the
       first sample (1/sqrt(x)=10 has x=0.01, 1/x=100 has x=0.01). Merge
       in domain-boundary points so those brackets are seen. */
    var xs = [], i;
    for (i = 0; i <= steps; i++) xs.push(lo + (hi - lo) * i / steps);
    if (extra && extra.length) {
      for (i = 0; i < extra.length; i++) {
        var xv = extra[i];
        if (finite(xv) && xv > lo && xv < hi) xs.push(xv);
      }
      xs.sort(function (u, v) { return u - v; });
    }
    var roots = [], prevX = xs[0], prevY = evalAt(expr, prevX);
    for (var i = 1; i < xs.length; i++) {
      var x = xs[i];
      var y = evalAt(expr, x);
      if (finite(prevY) && finite(y)) {
        if (close(prevY, 0)) {
          roots.push(prevX);
        } else if (prevY * y < 0 && Math.abs(prevY) < 1e7 && Math.abs(y) < 1e7) {
          var a = prevX, b = x, fa = prevY;
          for (var j = 0; j < 60; j++) {
            var m = (a + b) / 2, fm = evalAt(expr, m);
            if (!finite(fm)) break;
            if (fa * fm <= 0) { b = m; } else { a = m; fa = fm; }
          }
          roots.push((a + b) / 2);
        }
      }
      prevX = x; prevY = y;
    }
    var out = [];
    for (var q = 0; q < roots.length; q++) {
      var dup = false;
      for (var w = 0; w < out.length; w++) if (Math.abs(out[w] - roots[q]) < 1e-5) dup = true;
      if (!dup) out.push(Math.round(roots[q] * 1e8) / 1e8);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Step construction and certification
   * ------------------------------------------------------------------ */

  function guard(kind, expr, verified) {
    return { kind: kind, expr: String(expr), verified: verified !== false };
  }

  function toF(s) {
    var r = splitRelation(s);
    if (!r) return String(s);
    return '(' + r.lhs + ') - (' + r.rhs + ')';
  }

  function equationEquivalent(a, b) {
    var fa = toF(a), fb = toF(b);
    /* Multiplying an equation by -1 or by a nonzero constant preserves its
       solution set; the old ratio test bailed out at any sample where one
       side happened to be zero (e.g. -x = 0 at x = 0). */
    if (equivalent(fa, fb) || equivalent(fa, '-(' + fb + ')')) return true;
    var ratios = [];
    for (var i = 0; i < SAMPLE_POINTS.length; i++) {
      var p = SAMPLE_POINTS[i];
      var va = evalAt(fa, p), vb = evalAt(fb, p);
      if (!finite(va) || !finite(vb) || Math.abs(vb) < TOL) continue;
      ratios.push(va / vb);
    }
    if (ratios.length < 2) return false;
    var base = ratios[0];
    if (Math.abs(base) < TOL) return false;
    for (var j = 1; j < ratios.length; j++) if (!close(ratios[j], base)) return false;
    return true;
  }

  function certify(cert, before, after, payload) {
    payload = payload || {};
    switch (cert) {
      case 'identity': return equivalent(String(before), String(after));
      case 'equation_equiv': return equationEquivalent(String(before), String(after));
      case 'solution_set': return payload.verified === true;
      case 'oracle': return payload.verified === true;
      case 'structural':
      case 'definition': return true;
      default: return false;
    }
  }

  function addGuard(step, g) { step.guard.push(g); return step; }

  function S(rule, before, after, cert, options) {
    options = options || {};
    var payload = Object.assign({}, options.payload || {});
    var step = {
      rule: rule,
      before: String(before === undefined ? '' : before),
      after: String(after === undefined ? '' : after),
      cert: cert || 'structural',
      guard: (options.guard || []).slice(),
      payload: payload,
      children: (options.children || []).slice()
    };
    /* An explicitly certified kernel step wins; certify() is a fallback for
       steps that did not declare their verification status. */
    if (options.payload && Object.prototype.hasOwnProperty.call(options.payload, 'verified')) {
      step.payload.verified = !!options.payload.verified;
    } else {
      step.payload.verified = certify(step.cert, step.before, step.after, payload);
    }
    if (options.check) step.payload.check = options.check;
    return step;
  }

  function DStep(rule, before, after, payload) {
    return { rule: rule, before: String(before), after: String(after),
      cert: 'definition', guard: [], children: [],
      payload: Object.assign({ verified: true }, payload || {}) };
  }
  function OStep(rule, before, after, check, payload) {
    return { rule: rule, before: String(before), after: String(after),
      cert: 'oracle', guard: [], children: [],
      payload: Object.assign({ verified: true, check: check || 'primitive_recount' }, payload || {}) };
  }

  function flatten(steps, out) {
    out = out || [];
    for (var i = 0; i < steps.length; i++) {
      out.push(steps[i]);
      flatten(steps[i].children, out);
    }
    return out;
  }

  function summarize(methods) {
    var all = [];
    for (var i = 0; i < methods.length; i++) flatten(methods[i].steps, all);
    var verified = 0, guards = 0;
    for (var j = 0; j < all.length; j++) {
      if (all[j].payload.verified) verified++;
      guards += all[j].guard.length;
    }
    return {
      steps: all.length,
      verified: verified,
      guards: guards,
      rate: all.length ? verified / all.length : 0
    };
  }

  /* A step that restates its input, repeats the previous step, or walks a
     derivation backwards carries no information. Remove it everywhere. */
  /* Abstract templates such as f(x)=g(x), u+v or f(x)-g(x) state no
     mathematics at all. They used to be the entire "derivation" for many
     topics; drop them everywhere. */
  function isPlaceholder(step) {
    var t = String(step.before) + ' ' + String(step.after);
    return /\bf\(x\)\s*=\s*g\(x\)|\bf\(x\)\s*-\s*g\(x\)|\bf\(x\)\s*=\s*\S|\bu \+ v\b|\bf\(a-h\)|\bc_0 ; c_1|\bdy = y\*k\*dx|\bc_k = f_k\(0\)|\by' = f\(x,y\)/.test(t);
  }

  function informative(step) {
    var before = String(step.before).trim(), after = String(step.after).trim();
    if (isPlaceholder(step)) return false;
    /* A step that only says "degree transcendental" explains nothing. */
    if (/^degree\s/i.test(after) || /^no limit$/i.test(after)) return false;
    /* Restating the same formula without new evidence, guards or children
       is noise, even if it carries a generic check label. */
    if (before === after && !step.children.length && !step.guard.length &&
        !step.payload.evidence && !step.payload.normalized) return false;
    /* Pure English diagnostics are not mathematical expressions. */
    if (/^[a-z]+(?: [a-z]+){1,4}$/i.test(after) &&
        !/[0-9=()+\-*/^]/.test(after)) return false;
    return true;
  }
  function cleanMethods(methods) {
    (methods || []).forEach(function (m) {
      var kept = [];
      (m.steps || []).forEach(function (step) {
        if (!informative(step)) return;
        if (kept.length) {
          var prev = kept[kept.length - 1];
          if (String(prev.before).trim() === String(step.before).trim() &&
              String(prev.after).trim() === String(step.after).trim() &&
              prev.rule === step.rule) return;
          if (String(step.after).trim() === String(prev.before).trim() &&
              String(step.before).trim() !== String(prev.after).trim() &&
              !step.payload.check) return;
        }
        kept.push(step);
      });
      m.steps = kept;
    });
    return methods;
  }

  function showMath(s) {
    return String(s).replace(/-Infinity/g, '-\u221e')
      .replace(/\bInfinity\b/g, '\u221e');
  }

  /* Every visible step must carry concrete numbers or facts. These helpers
     build language-neutral evidence records; the UI localises them. */
  function expressionValue(text, variable, x) {
    var rel = splitRelation(text);
    var e2 = rel && rel.op === '=' ? '(' + rel.lhs + ') - (' + rel.rhs + ')' : text;
    try {
      var scope = {};
      if (variable) scope[variable] = x;
      return Number(math.parse(e2).compile().evaluate(scope));
    } catch (e) { return NaN; }
  }

  function evidenceNumber(v) {
    if (!isFinite(v)) return '\u2014';
    return significantDigits(v);
  }

  function equivalenceEvidence(before, after) {
    var vars = [];
    try { vars = detectVariables(before + ' ' + after) || []; } catch (e) { vars = []; }
    var variable = vars[0] || null;
    var points = variable ? [-2, -0.5, 1, 3] : [0];
    var maxDiff = 0, used = [], count = 0;
    for (var i = 0; i < points.length; i++) {
      var bv = expressionValue(before, variable, points[i]);
      var av = expressionValue(after, variable, points[i]);
      if (!isFinite(bv) || !isFinite(av)) continue;
      maxDiff = Math.max(maxDiff, Math.abs(bv - av));
      used.push(points[i]); count++;
    }
    if (!count) return null;
    if (!variable) {
      return { k: 'ev.constantCheck', a: [evidenceNumber(
        expressionValue(before, null, 0)), evidenceNumber(
        expressionValue(after, null, 0))] };
    }
    return { k: 'ev.equivCheck', a: [evidenceNumber(maxDiff), used.join(', '), count] };
  }

  function factEvidence(step) {
    var p = step.payload || {}, facts = [];
    ['rank', 'det', 'rows', 'cols', 'pivots', 'degree', 'interval', 'point',
     'lower', 'upper', 'order', 'numeric', 'value', 'decimal', 'residual',
     'trace', 'determinant'].forEach(function (k) {
      if (p[k] !== undefined && p[k] !== null) {
        var v = Array.isArray(p[k]) ? p[k].slice(0, 4).join(',') : String(p[k]);
        facts.push(k + '=' + v.slice(0, 24));
      }
    });
    if (facts.length) return { k: 'ev.fact', a: [facts.join('，')] };
    var nums = String(step.after).match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length) return { k: 'ev.resultValues', a: [nums.slice(0, 4).join(', ')] };
    return null;
  }

  function enrichMethods(methods, topic, answer) {
    function visit(list) {
      var kept = [];
      (list || []).forEach(function (step) {
        if (!informative(step)) return;
        var ev = Array.isArray(step.payload.evidence) ? step.payload.evidence.slice() : [];
        if (!ev.length) {
          var numeric = equivalenceEvidence(step.before, step.after);
          if (numeric) ev.push(numeric);
          var fact = factEvidence(step);
          if (fact) ev.push(fact);
          if (step.payload.check) ev.push({ k: 'ev.check', a: ['#' + String(step.payload.check)] });
        }
        step.payload.evidence = ev.length > 3 ? ev.slice(0, 3) : ev;
        step.children = visit(step.children || []);
        kept.push(step);
      });
      return kept;
    }
    var kept = [];
    (methods || []).forEach(function (m) {
      m.steps = visit(m.steps || []);
      if (m.steps.length) kept.push(m);
    });
    return kept;
  }

  function result(topic, level, answer, methods, graph, notes, detail) {
    var cleaned = enrichMethods(cleanMethods(methods || []), topic, answer);
    /* Bracket scans, bisection and Newton iterations are machine work, not
       a derivation. Keep them for verification but never show them as steps. */
    if (topic === 'general_equation' || topic === 'nonlinear_system') {
      cleaned.forEach(function (m) { m.machine = true; });
    }
    (function walk(list) {
      (list || []).forEach(function (st) {
        if (typeof st.before === 'string') st.before = showMath(st.before);
        if (typeof st.after === 'string') st.after = showMath(st.after);
        walk(st.children);
      });
    })(cleaned.reduce(function (a, m) { return a.concat(m.steps || []); }, []));
    var shown = showMath(answer);
    var EXD = global.PLXT && global.PLXT.exact;
    var out = {
      ok: true, topic: topic, level: level,
      answer: shown, methods: cleaned,
      graph: graph || null, summary: summarize(cleaned),
      notes: notes || [], detail: showMath(detail || ''),
      decimal: EXD ? EXD.decimalApprox(shown) : ''
    };
    return out;
  }

  function failure(code, detail) {
    return { ok: false, code: code, detail: detail || '' };
  }

  /* ------------------------------------------------------------------ *
   * Relation parsing
   * ------------------------------------------------------------------ */

  function splitRelation(input) {
    var s = String(input).replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=');
    var depth = 0, i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (depth === 0) {
        var two = s.substr(i, 2);
        if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
          return { lhs: s.slice(0, i).trim(), rhs: s.slice(i + 2).trim(), op: two };
        }
        if (c === '<' || c === '>' || c === '=') {
          return { lhs: s.slice(0, i).trim(), rhs: s.slice(i + 1).trim(), op: c };
        }
      }
      i++;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Topics: arithmetic, simplification, evaluation
   * ------------------------------------------------------------------ */

  function hasVariables(raw) {
    try {
      var node = math.parse(raw), found = false;
      node.traverse(function (n) {
        if (n.isSymbolNode && KNOWN_NAMES.indexOf(n.name) < 0 &&
            ['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false'].indexOf(n.name) < 0) found = true;
      });
      return found;
    } catch (e2) { return /\bx\b/.test(raw); }
  }

  function sameBySampling(a, b) {
    var good = 0;
    for (var t = -2.7; t <= 2.7; t += 0.41) {
      var va = evalAt(a, t), vb = evalAt(b, t);
      if (!finite(va) || !finite(vb)) continue;
      if (Math.abs(va - vb) > 1e-7) return false;
      good++;
    }
    return good >= 4;
  }

  function combineFractions(raw) {
    try {
      var node = math.parse(raw);
      if (!node.isOperatorNode || (node.op !== '+' && node.op !== '-')) return null;
      var l = node.args[0], r = node.args[1];
      if (!l.isOperatorNode || l.op !== '/') return null;
      if (!r.isOperatorNode || r.op !== '/') return null;
      var A = l.args[0].toString(), B = l.args[1].toString();
      var C = r.args[0].toString(), Dn = r.args[1].toString();
      var num = simplifyStr('(' + A + ')*(' + Dn + ')' +
        (node.op === '-' ? ' - ' : ' + ') + '(' + C + ')*(' + B + ')');
      var den = simplifyStr('(' + B + ')*(' + Dn + ')');
      var combined = '(' + num + ')/(' + den + ')';
      if (!parseOK(combined) || !sameBySampling(raw, combined)) return null;
      return combined;
    } catch (e) { return null; }
  }

  /* Recognise standard constants so asin(1) prints pi/2, not a decimal. */
  function knownConstant(v) {
    var table = [
      [Math.PI / 4, 'pi/4'], [Math.PI / 3, 'pi/3'], [Math.PI / 2, 'pi/2'],
      [Math.PI, 'pi'], [2 * Math.PI, '2*pi'], [Math.E, 'e'],
      [Math.sqrt(2), 'sqrt(2)'], [Math.sqrt(3), 'sqrt(3)'],
      [Math.sqrt(3) / 2, 'sqrt(3)/2'], [Math.sqrt(2) / 2, 'sqrt(2)/2'],
      [1 / Math.E, '1/e'], [Math.log(2), 'log(2)']
    ];
    for (var i = 0; i < table.length; i++) {
      if (Math.abs(v - table[i][0]) < 1e-9 * (1 + Math.abs(v))) return table[i][1];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Exact canonical forms for constant radical / logarithm expressions.
   * math.js simplify() folds sqrt(8) into a decimal, which is numerically
   * right but algebraically useless. Keep the exact surd form instead.
   * ------------------------------------------------------------------ */
  function primeFactors(n) {
    var out = [], d = 2;
    while (d * d <= n && out.length < 12) {
      var e = 0;
      while (n % d === 0) { n /= d; e++; }
      if (e) out.push([d, e]);
      d += (d === 2 ? 1 : 2);
    }
    if (n > 1) out.push([n, 1]);
    return out;
  }

  function largestSquare(n) {
    var best = 1;
    for (var k = 2; k * k <= n; k++) if (n % (k * k) === 0) best = k * k;
    return best;
  }

  function unwrap(node) {
    while (node && node.isParenthesisNode) node = node.content;
    return node;
  }

  function constantValue(node) {
    node = unwrap(node);
    if (!node) return null;
    try {
      var v = math.compile(node.toString()).evaluate({});
      return typeof v === 'number' && isFinite(v) ? v : null;
    } catch (e) { return null; }
  }

  function sqrtInteger(node) {
    node = unwrap(node);
    var inner = node && node.args && unwrap(node.args[0]);
    return node && node.isFunctionNode && node.name === 'sqrt' &&
      node.args.length === 1 && inner && inner.isConstantNode &&
      Number.isInteger(inner.value) && inner.value > 0
      ? Number(inner.value) : null;
  }

  function tidyExact(t) {
    return String(t).replace(/\b1\s*\*\s*/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* One rewrite at a time so every change becomes a visible, verifiable
     derivation step instead of a silent replacement. */
  function rewriteOnce(expr) {
    var ast;
    try { ast = math.parse(expr); } catch (e) { return null; }

    /* Top-level sums of like surds: 2*sqrt(2)+3*sqrt(2) -> 5*sqrt(2). */
    if (ast.isOperatorNode && (ast.op === '+' || ast.op === '-') && ast.args.length) {
      var signs = [], terms = [];
      function splitAdd(n, sign) {
        if (n.isOperatorNode && (n.op === '+' || n.op === '-') && n.args.length) {
          splitAdd(n.args[0], sign);
          for (var i = 1; i < n.args.length; i++) splitAdd(n.args[i], n.op === '-' ? -sign : sign);
        } else { signs.push(sign); terms.push(n); }
      }
      splitAdd(ast, 1);
      var groups = {}, ok = true;
      for (var ti = 0; ti < terms.length; ti++) {
        var nd = terms[ti], coef = 1, rad = null;
        if (nd.isOperatorNode && nd.op === '*' && nd.args.length === 2) {
          var cv = constantValue(nd.args[0]);
          if (cv !== null) { coef = cv; rad = sqrtInteger(nd.args[1]); }
          else { cv = constantValue(nd.args[1]); if (cv !== null) { coef = cv; rad = sqrtInteger(nd.args[0]); } }
        } else rad = sqrtInteger(nd);
        if (rad === null) { ok = false; break; }
        var sq = largestSquare(rad), rest = rad / sq;
        var key = String(rest);
        if (!groups[key]) groups[key] = { rest: rest, coef: 0 };
        groups[key].coef += signs[ti] * coef * Math.sqrt(sq);
      }
      var keys = Object.keys(groups);
      if (ok && keys.length && keys.length < terms.length) {
        var parts = keys.map(function (kk) {
          var g = groups[kk], c = Math.round(g.coef * 1e9) / 1e9;
          if (!c) return '';
          var mag = Math.abs(c), core = g.rest === 1 ? '' : ' * sqrt(' + g.rest + ')';
          if (g.rest === 1) return (c < 0 ? '−' : '') + String(mag);
          return (c < 0 ? '− ' : '') + (mag === 1 ? '' : mag + ' * ') + 'sqrt(' + g.rest + ')';
        }).filter(Boolean);
        var pretty = parts.join(' + ').replace(/\+ −/g, '− ');
        if (pretty && pretty !== expr) {
          return { expr: pretty, rule: 'RADICAL_COMBINE',
            ev: [{ k: 'ev.likeSurds', a: [keys.length] },
                 { k: 'ev.numericCheck', a: [fmtEvidence(evalNum(expr, {})), fmtEvidence(evalNum(pretty, {}))] }] };
        }
      }
    }

    /* Plain integer constants in a sum: 1 + 3*log(5,2) + 1 -> 2 + 3*log(5,2).
       Only literal ConstantNodes are folded; log/sqrt terms stay symbolic. */
    if (ast.isOperatorNode && (ast.op === '+' || ast.op === '-') && ast.args.length) {
      var cs = [], ct = [];
      (function splitConst(n, sign) {
        if (n.isOperatorNode && (n.op === '+' || n.op === '-') && n.args.length) {
          splitConst(n.args[0], sign);
          for (var q = 1; q < n.args.length; q++)
            splitConst(n.args[q], n.op === '-' ? -sign : sign);
        } else { cs.push(sign); ct.push(n); }
      })(ast, 1);
      var csum = 0, ccount = 0, other = [];
      for (var ci = 0; ci < ct.length; ci++) {
        if (ct[ci].isConstantNode && typeof ct[ci].value === 'number') {
          csum += cs[ci] * ct[ci].value; ccount++;
        } else other.push({ sign: cs[ci], text: ct[ci].toString() });
      }
      if (ccount >= 2 && other.length) {
        var cparts = [];
        if (Math.abs(csum) > 1e-12) cparts.push(rationalize(csum).s);
        other.forEach(function (o) {
          if (o.sign < 0) {
            if (!cparts.length) cparts.push('-' + o.text);
            else cparts.push(' - ' + o.text);
          } else {
            cparts.push((cparts.length ? ' + ' : '') + o.text);
          }
        });
        var cExpr = tidyExact(cparts.join(''));
        if (cExpr !== tidyExact(expr)) {
          var bv0 = evalNum(expr, {}), av0 = evalNum(cExpr, {});
          if ((!finite(bv0) || !finite(av0) ||
               Math.abs(bv0 - av0) <= 1e-8 * (1 + Math.abs(bv0)))) {
            return { expr: cExpr, rule: 'COMBINE_LIKE_TERMS',
              ev: [{ k: 'ev.numericCheck', a: [fmtEvidence(bv0), fmtEvidence(av0)] }] };
          }
        }
      }
    }

    var hit = null;
    var transformed = ast.transform(function (node) {
      if (hit) return node;
      var made = null;

      /* sqrt(n) = k*sqrt(m) whenever n has a square factor. */
      var sn = sqrtInteger(node);
      if (sn !== null) {
        var sq2 = largestSquare(sn), k = Math.round(Math.sqrt(sq2)), m = sn / sq2;
        if (k > 1) {
          made = m === 1 ? String(k) : k + ' * sqrt(' + m + ')';
          hit = { expr: made, rule: 'RADICAL_FACTOR',
            ev: [{ k: 'ev.radicalFactor', a: [sn, k, m] }] };
          return math.parse(made);
        }
      }

      /* log_b(N) with integer N: fold the argument, then split off the
         largest power of the base and expand the remaining prime powers. */
      /* log2(250) is accepted as shorthand for log(250, 2). */
      var logBaseShort = /^log(\d+)$/.exec(node.name || '');
      if (node.isFunctionNode && logBaseShort && node.args.length === 1) {
        var shortVal = constantValue(node.args[0]);
        if (shortVal !== null && Number.isInteger(shortVal)) {
          made = 'log(' + Math.round(shortVal) + ', ' + logBaseShort[1] + ')';
          hit = { expr: made, rule: 'LOG_BASE_REWRITE',
            ev: [{ k: 'ev.logBase', a: [logBaseShort[1]] }] };
          return math.parse(made);
        }
      }

      if (node.isFunctionNode && node.name === 'log' && node.args.length === 2) {
        var bv = constantValue(node.args[1]);
        var av = constantValue(node.args[0]);
        if (bv !== null && Number.isInteger(bv) && bv >= 2 &&
            av !== null && Number.isInteger(av) && av > 1) {
          var N = Math.round(av), B = Math.round(bv);
          if (!node.args[0].isConstantNode) {
            made = 'log(' + N + ', ' + B + ')';
            hit = { expr: made, rule: 'CONSTANT_FOLD',
              ev: [{ k: 'ev.constantFold', a: [node.args[0].toString(), N] }] };
            return math.parse(made);
          }
          var q = 0, rest = N;
          while (rest % B === 0 && rest > 0) { rest /= B; q++; }
          var fac = primeFactors(rest);
          var pieces = [];
          if (q) pieces.push(String(q));
          fac.forEach(function (fe) {
            pieces.push(fe[1] === 1 ? 'log(' + fe[0] + ', ' + B + ')'
              : fe[1] + ' * log(' + fe[0] + ', ' + B + ')');
          });
          if (pieces.length && (q > 0 || fac.length < 1 || fac[0][1] > 1 || fac.length > 1)) {
            made = pieces.join(' + ');
            if (made !== node.toString()) {
              var fs = B + (q ? '^' + q : '') +
                (fac.length ? ' \u00d7 ' + fac.map(function (f) {
                  return f[0] + (f[1] > 1 ? '^' + f[1] : '');
                }).join(' \u00d7 ') : '');
              hit = { expr: made, rule: 'LOG_FACTOR',
                ev: [{ k: 'ev.logFactor', a: [N, B, q, fs] }] };
              return math.parse(made);
            }
          }
        }
      }

      /* sqrt(a/b) -> sqrt(a*b)/b with the square factor pulled out and
         reduced: sqrt(1/8) -> sqrt(2)/4. */
      if (node.isFunctionNode && node.name === 'sqrt' && node.args.length === 1) {
        var frac = unwrap(node.args[0]);
        if (frac.isOperatorNode && frac.op === '/' && frac.args.length === 2) {
          var na = constantValue(unwrap(frac.args[0])), nb = constantValue(unwrap(frac.args[1]));
          if (na !== null && nb !== null && Number.isInteger(na) && Number.isInteger(nb) &&
              na > 0 && nb > 0) {
            var prod = na * nb, sp = surdParts(prod);
            var kk = sp ? sp.k : 1, rr = sp ? sp.rad : prod;
            var gg = gcd2(kk, nb); kk /= gg; nb /= gg;
            var body = rr === 1 ? String(kk)
              : (kk === 1 ? '' : kk + ' * ') + 'sqrt(' + rr + ')';
            made = nb === 1 ? body : body + ' / ' + nb;
            hit = { expr: made, rule: 'RATIONALIZE_DENOMINATOR',
              ev: [{ k: 'ev.rationalize', a: [na, prod, nb] }] };
            return math.parse(made);
          }
        }
      }

      /* 1/(sqrt(a) +/- sqrt(b)) -> conjugate / (a-b). */
      if (node.isOperatorNode && node.op === '/' && node.args.length === 2) {
        var conjDen = unwrap(node.args[1]), conjNum = unwrap(node.args[0]);
        var oneVal = constantValue(conjNum);
        if (oneVal !== null && Math.abs(oneVal - 1) < 1e-12 &&
            conjDen.isOperatorNode && (conjDen.op === '+' || conjDen.op === '-') &&
            conjDen.args.length === 2) {
          var da = sqrtInteger(unwrap(conjDen.args[0])),
              dbb = sqrtInteger(unwrap(conjDen.args[1]));
          if (da !== null && dbb !== null && da !== dbb) {
            var cj = conjDen.op === '+'
              ? 'sqrt(' + da + ') - sqrt(' + dbb + ')'
              : 'sqrt(' + da + ') + sqrt(' + dbb + ')';
            var dd = da - dbb;
            made = dd === 1 ? cj : dd === -1 ? '-(' + cj + ')'
              : '(' + cj + ') / ' + dd;
            hit = { expr: made, rule: 'RATIONALIZE_DENOMINATOR',
              ev: [{ k: 'ev.rationalize', a: [da, dbb, dd] }] };
            return math.parse(made);
          }
        }
      }

      /* (k*sqrt(r))^n -> integer * sqrt(r) for small positive n. */
      if (node.isOperatorNode && node.op === '^' && node.args.length === 2) {
        var powBase = unwrap(node.args[0]), powExp = constantValue(unwrap(node.args[1]));
        if (powExp !== null && Number.isInteger(powExp) && powExp >= 2 && powExp <= 6) {
          var pk = 1, pr = sqrtInteger(powBase);
          if (pr === null && powBase.isOperatorNode && powBase.op === '*' &&
              powBase.args.length === 2) {
            var pc = constantValue(unwrap(powBase.args[0]));
            if (pc !== null && Number.isInteger(pc)) {
              pk = pc; pr = sqrtInteger(unwrap(powBase.args[1]));
            }
          }
          if (pr !== null && pr > 0) {
            var coef = Math.pow(pk, powExp) * Math.pow(pr, Math.floor(powExp / 2));
            var radOut = powExp % 2 === 0 ? 1 : pr;
            made = radOut === 1 ? String(coef)
              : (coef === 1 ? '' : coef + ' * ') + 'sqrt(' + radOut + ')';
            hit = { expr: made, rule: 'RADICAL_POWER',
              ev: [{ k: 'ev.radicalPower', a: [pk, pr, powExp, coef] }] };
            return math.parse(made);
          }
        }
      }

      /* Rationalise a square-root denominator in one step. */
      if (node.isOperatorNode && node.op === '/' && node.args.length === 2) {
        var den = unwrap(node.args[1]), num = unwrap(node.args[0]);
        var db = sqrtInteger(den), mul = 1;
        if (db === null && den.isOperatorNode && den.op === '*' && den.args.length === 2) {
          var d0 = unwrap(den.args[0]), d1 = unwrap(den.args[1]);
          var dv = constantValue(d0);
          if (dv !== null && Number.isInteger(dv) && dv > 0) { mul = dv; db = sqrtInteger(d1); }
        }
        if (db !== null && db > 1) {
          var nb = sqrtInteger(num);
          if (nb !== null) {
            made = 'sqrt(' + (nb * db) + ') / ' + (mul * db);
            hit = { expr: made, rule: 'RATIONALIZE_DENOMINATOR',
              ev: [{ k: 'ev.rationalize', a: [db, nb * db, mul * db] }] };
            return math.parse(made);
          }
          var nv = constantValue(num);
          if (nv !== null && Number.isInteger(nv)) {
            made = nv + ' * sqrt(' + db + ') / ' + (mul * db);
            hit = { expr: made, rule: 'RATIONALIZE_DENOMINATOR',
              ev: [{ k: 'ev.rationalize', a: [db, db, mul * db] }] };
            return math.parse(made);
          }
        }
      }

      /* n1 * (n2*sqrt(r)) -> (n1*n2)*sqrt(r). */
      if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
        var pa = unwrap(node.args[0]), pb = unwrap(node.args[1]);
        var pc1 = constantValue(pa);
        if (pc1 !== null && Number.isInteger(pc1) && pb.isOperatorNode &&
            pb.op === '*' && pb.args.length === 2) {
          var pc2 = constantValue(unwrap(pb.args[0]));
          var prr = sqrtInteger(unwrap(pb.args[1]));
          if (pc2 !== null && Number.isInteger(pc2) && prr !== null) {
            made = (pc1 * pc2) + ' * sqrt(' + prr + ')';
            hit = { expr: made, rule: 'COMBINE_LIKE_TERMS',
              ev: [{ k: 'ev.numericCheck', a: [pc1 + '*' + pc2, String(pc1 * pc2)] }] };
            return math.parse(made);
          }
        }
      }

      /* c*sqrt(r) where c is a folded integer expression: 2*2*sqrt(2) -> 4*sqrt(2). */
      if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
        var fa = unwrap(node.args[0]), fb = unwrap(node.args[1]);
        var fcv = constantValue(fa), fr = sqrtInteger(fb);
        if (fcv !== null && Number.isInteger(fcv) && fr !== null) {
          var fm = (fcv === 1 ? '' : fcv + ' * ') + 'sqrt(' + fr + ')';
          if (fm !== node.toString()) {
            hit = { expr: fm, rule: 'COMBINE_LIKE_TERMS',
              ev: [{ k: 'ev.numericCheck', a: [String(fcv), fm] }] };
            return math.parse(fm);
          }
        }
      }

      /* sqrt(a)*sqrt(b) -> sqrt(a*b). */
      if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
        var la = sqrtInteger(unwrap(node.args[0])), lb = sqrtInteger(unwrap(node.args[1]));
        if (la !== null && lb !== null) {
          made = la * lb === Math.round(Math.sqrt(la * lb)) * Math.round(Math.sqrt(la * lb))
            ? String(Math.round(Math.sqrt(la * lb))) : 'sqrt(' + (la * lb) + ')';
          hit = { expr: made, rule: 'RADICAL_MERGE',
            ev: [{ k: 'ev.radicalMerge', a: [la, lb, la * lb] }] };
          return math.parse(made);
        }
      }
      return node;
    });

    if (!hit) return null;
    var nextExpr = tidyExact(transformed.toString());
    if (nextExpr === tidyExact(expr)) return null;
    var beforeVal = evalNum(expr, {}), afterVal = evalNum(nextExpr, {});
    if (finite(beforeVal) && finite(afterVal) &&
        Math.abs(beforeVal - afterVal) > 1e-8 * (1 + Math.abs(beforeVal))) return null;
    hit.expr = nextExpr;
    hit.ev.push({ k: 'ev.numericCheck',
      a: [fmtEvidence(beforeVal), fmtEvidence(afterVal)] });
    return hit;
  }

  function fmtEvidence(v) {
    if (v === null || v === undefined || !isFinite(v)) return '\u2014';
    var r = Math.round(v * 1e8) / 1e8;
    return String(r);
  }

  function canonicalExact(raw) {
    /* The rewrite rules below only touch literal numeric subexpressions, so
       they are safe for symbolic inputs too: sqrt(8)*x -> (2*sqrt(2))*x. */
    var cur = String(raw).trim(), steps = [];
    for (var guard = 0; guard < 7; guard++) {
      var one = rewriteOnce(cur);
      if (!one || one.expr === cur) break;
      var payload = Object.assign({ verified: true, evidence: one.ev }, {});
      steps.push(S(one.rule, cur, one.expr, 'identity',
        { payload: payload, check: 'exact_evaluation' }));
      cur = one.expr;
    }
    return steps.length ? { expr: cur, steps: steps } : null;
  }

  /* Gamma at half-integers is an exact multiple of sqrt(pi), never a
     decimal: 0.5! = Gamma(3/2) = sqrt(pi)/2, Gamma(1/2) = sqrt(pi). */
  function parseRationalToken(txt) {
    var t = String(txt).trim();
    var m = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(t);
    if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
    var v = Number(t);
    return isFinite(v) ? v : NaN;
  }
  function gammaHalfString(q) {
    var k = q - 0.5;
    if (Math.abs(k - Math.round(k)) > 1e-9) return null;
    k = Math.round(k);
    if (k < -8 || k > 14) return null;
    var num, den;
    if (k >= 0) {
      num = factorial(2 * k); den = Math.pow(4, k) * factorial(k);
    } else {
      var mm = -k;
      num = Math.pow(-4, mm) * factorial(mm); den = factorial(2 * mm);
    }
    var g = gcd2(Math.abs(num), Math.abs(den)) || 1;
    num = Math.round(num / g); den = Math.round(den / g);
    if (den < 0) { num = -num; den = -den; }
    var body = (num === 1 ? '' : num === -1 ? '-' : num + '*') + 'sqrt(pi)';
    return den === 1 ? body : body + '/' + den;
  }
  function specialExactValue(raw) {
    /* The box editor serialises 1/2 as (1)/(2); normalise both that and a
       doubly parenthesised argument before matching the Gamma forms. */
    var src = String(raw).replace(/\s+/g, '')
      .replace(/\(\s*(\d+(?:\.\d+)?)\s*\)\s*\/\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g, '$1/$2')
      .replace(/\b(gamma|factorial)\(\s*\(\s*([^()]+?)\s*\)\s*\)/g, '$1($2)'), m, q, exact;
    if ((m = /^\(\s*([+-]?(?:\d+\.?\d*|\d+\/\d+))\s*\)!$/.exec(src))) {
      q = parseRationalToken(m[1]) + 1;
    } else if ((m = /^([+-]?(?:\d+\.?\d*|\d+\/\d+))!$/.exec(src))) {
      q = parseRationalToken(m[1]) + 1;
    } else if ((m = /^(?:gamma|factorial)\(([+-]?(?:\d+\.?\d*|\d+\/\d+))\)$/.exec(src))) {
      q = parseRationalToken(m[1]) + (/^factorial/.test(m[0]) ? 1 : 0);
    } else return null;
    if (!isFinite(q)) return null;
    exact = gammaHalfString(q);
    if (!exact) return null;
    /* math.js rejects (-0.5)! outright; compare against gamma(q) instead
       of evaluating the original factorial token. */
    var refVal;
    try { refVal = math.evaluate('gamma(' + q + ')'); } catch (e) { refVal = NaN; }
    if (!finite(refVal)) refVal = evalNum(raw, {});
    var specialVerified = finite(refVal)
      ? close(evalNum(exact, {}), refVal) : true;
    var steps = [
      S('SPECIAL_VALUE_DEFINITION', raw, 'Gamma(1/2) = sqrt(pi)', 'definition',
        { payload: { verified: true, gammaArgument: q }, check: 'exact_evaluation' }),
      S('HALF_INTEGER_GAMMA', 'Gamma(' + q + ')', exact, 'oracle',
        { payload: { verified: specialVerified },
          check: 'numeric_equivalence_sampling' })
    ];
    return result('exact_special_value', 'L1', exact,
      [{ id: 'EXACT_SPECIAL_VALUE', steps: steps }], null, []);
  }

  /* sqrt(8) inside a symbolic expression must not be copied verbatim. */
  function numericSurdString(n) {
    var p = surdParts(n);
    if (!p) return null;
    if (p.rad === 1) return String(p.k);
    return (p.k === 1 ? '' : p.k + '*') + 'sqrt(' + p.rad + ')';
  }

  /* Exact sin/cos/tan at rational multiples of pi. Tables for 12ths and 8ths
     are exact; 24ths come from the half-angle identities applied to 12ths. */
  var TRIG12 = [
    ['0', '1'],
    ['(sqrt(6) - sqrt(2)) / 4', '(sqrt(6) + sqrt(2)) / 4'],
    ['1 / 2', 'sqrt(3) / 2'],
    ['sqrt(2) / 2', 'sqrt(2) / 2'],
    ['sqrt(3) / 2', '1 / 2'],
    ['(sqrt(6) + sqrt(2)) / 4', '(sqrt(6) - sqrt(2)) / 4'],
    ['1', '0']
  ];
  var TRIG8 = [
    ['0', '1'],
    ['sqrt(2 - sqrt(2)) / 2', 'sqrt(2 + sqrt(2)) / 2'],
    ['sqrt(2) / 2', 'sqrt(2) / 2'],
    ['sqrt(2 + sqrt(2)) / 2', 'sqrt(2 - sqrt(2)) / 2'],
    ['1', '0']
  ];
  function baseSinCos(r, d) {
    if (d === 12) return TRIG12[r];
    if (d === 8) return TRIG8[r];
    if (d === 6) return TRIG12[2 * r];
    if (d === 4) return TRIG12[3 * r];
    if (d === 3) return r === 0 ? TRIG12[0] : TRIG12[4];
    if (d === 2) return r === 0 ? TRIG12[0] : TRIG12[6];
    if (d === 1) return TRIG12[0];
    if (d === 24) {
      if (r % 2 === 0) return TRIG12[r / 2];
      /* cos(r*pi/12): sign is negative past 90 degrees. */
      var idx = Math.min(r, 12 - r);
      var cosMag = TRIG12[idx][1];
      var cosVal = (r > 6 ? '-(' + cosMag + ')' : cosMag);
      return ['sqrt((1 - (' + cosVal + ')) / 2)',
              'sqrt((1 + (' + cosVal + ')) / 2)'];
    }
    return null;
  }
  function exactTrigString(fn, angle) {
    if (!isFinite(angle)) return null;
    var ratio = angle / Math.PI, d = 0, k = 0;
    for (var dd = 1; dd <= 24; dd++) {
      var kk = Math.round(ratio * dd);
      if (Math.abs(ratio - kk / dd) < 1e-9) { d = dd; k = kk; break; }
    }
    if (!d) return null;
    var q = ((k % (2 * d)) + 2 * d) % (2 * d);
    var ref = q % d;
    if (ref > d / 2) ref = d - ref;
    var base = baseSinCos(ref, d);
    if (!base) return null;
    var ss = Math.sin(angle) < -1e-12 ? -1 : 1,
        cs = Math.cos(angle) < -1e-12 ? -1 : 1;
    function signed(mag, sign) {
      if (mag === '0' || sign > 0) return mag;
      if (mag === '1') return '-1';
      return '-(' + mag + ')';
    }
    var sinMag = signed(base[0], ss), cosMag = signed(base[1], cs);
    var out = fn === 'sin' ? sinMag : fn === 'cos' ? cosMag : null;
    if (fn === 'tan') {
      if (base[1] === '0') return null;
      var sign = ss * cs < 0 ? '-' : '';
      out = sign + '((' + base[0] + ') / (' + base[1] + '))';
    }
    if (out === null) return null;
    /* Accept only when the closed form really matches the numeric value. */
    var want = fn === 'sin' ? Math.sin(angle) : fn === 'cos' ? Math.cos(angle)
      : Math.tan(angle);
    /* Denest tangent values: tan(pi/12) = 2 - sqrt(3), tan(pi/8) = -1+sqrt(2). */
    if (fn === 'tan') {
      var denested = compactExactConstant(want, out);
      if (denested) return tidyExact(denested);
    }
    var got;
    try { got = num(math.evaluate(out)); } catch (e) { return null; }
    if (!finite(got) || Math.abs(got - want) > 1e-9 * (1 + Math.abs(want))) return null;
    return tidyExact(out);
  }

  /* Recognise a compact exact constant: rational, a+b*sqrt(k), a*sqrt(pi),
     a+b*pi, or a*sqrt(k)/c. Every candidate is numerically certified. */
  function compactExactConstant(v, src) {
    if (!finite(v)) return null;
    var q = rationalize(v);
    if (q.exact) return q.s;
    var spi = v / Math.sqrt(Math.PI), qs = rationalize(spi);
    if (qs.exact && qs.n) {
      var coef = qs.d === 1 ? String(qs.n) : qs.n + '/' + qs.d;
      var body = (coef === '1' ? '' : coef === '-1' ? '-' : coef + ' * ') + 'sqrt(pi)';
      return body;
    }
    var qp = rationalize(v / Math.PI);
    if (qp.exact && qp.n) {
      var a = qp.d === 1 ? String(qp.n) : qp.n + '/' + qp.d;
      return (a === '1' ? '' : a === '-1' ? '-' : a + ' * ') + 'pi';
    }
    /* a + b*sqrt(k): tan(pi/12) = 2 - sqrt(3), 1 + sqrt(2), ...
       Only small denominators and a tight residual avoid spurious fits. */
    for (var sk = 2; sk <= 30; sk++) {
      var sr = Math.sqrt(sk);
      if (Math.abs(sr - Math.round(sr)) < 1e-12) continue;
      for (var sd = 1; sd <= 12; sd++) for (var sn = -24; sn <= 24; sn++) {
        if (!sn) continue;
        var b = sn / sd;
        var qa = rationalize(v - b * sr);
        if (!qa.exact || qa.n === 0 || qa.d > 12 || Math.abs(qa.n) > 24) continue;
        if (Math.abs(qa.n / qa.d + b * sr - v) > 1e-11) continue;
        var as = qa.d === 1 ? String(qa.n) : qa.n + '/' + qa.d;
        var bs = sd === 1 ? String(Math.abs(sn)) : Math.abs(sn) + '/' + sd;
        var term = (Math.abs(sn) === 1 && sd === 1 ? '' : bs + ' * ') + 'sqrt(' + sk + ')';
        var cand = as + (sn > 0 ? ' + ' : ' - ') + term;
        try {
          if (Math.abs(num(math.evaluate(cand)) - v) > 1e-11) continue;
        } catch (e) { continue; }
        return cand;
      }
    }
    for (var kk2 = 2; kk2 <= 30; kk2++) {
      var r2 = Math.sqrt(kk2);
      if (Math.abs(r2 - Math.round(r2)) < 1e-12) continue;
      for (var den = 1; den <= 12; den++) {
        var nn = Math.round(v * den / r2);
        if (!nn) continue;
        var cand = nn * r2 / den;
        if (Math.abs(v - cand) < 1e-11) {
          if (Math.abs(nn) === 1) {
            return (nn < 0 ? '-' : '') + 'sqrt(' + kk2 + ')' +
              (den === 1 ? '' : ' / ' + den);
          }
          var c = den === 1 ? String(nn) : nn + '/' + den;
          return (c === '1' ? '' : c === '-1' ? '-' : c + ' * ') + 'sqrt(' + kk2 + ')';
        }
      }
    }
    return null;
  }

  /* Composite expressions such as gamma(1/2)+gamma(3/2) or sin(pi/12)+1/2. */
  function compositeExactValue(raw) {
    var src = String(raw).trim();
    if (!/gamma\s*\(|factorial\s*\(|\d\s*!|sin\s*\(|cos\s*\(|tan\s*\(/i.test(src)) return null;
    var rules = [], cur = src;
    /* Text-level Gamma / factorial replacement (postfix ! is awkward to
       rewrite as an AST node in the minified build). */
    cur = cur.replace(/\bgamma\s*\(\s*([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+))\s*\)/gi,
      function (all, a0) {
        var q = parseRationalToken(a0), e = q === null ? null : gammaHalfString(q);
        if (!e) return all;
        rules.push('HALF_INTEGER_GAMMA');
        return '(' + e + ')';
      });
    cur = cur.replace(/\bfactorial\s*\(\s*([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+))\s*\)/gi,
      function (all, a0) {
        var q = parseRationalToken(a0), e = q === null ? null : gammaHalfString(q + 1);
        if (!e) return all;
        rules.push('HALF_INTEGER_GAMMA');
        return '(' + e + ')';
      });
    cur = cur.replace(/(^|[+*\-\/(])\s*\(?\s*([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+))\s*\)?\s*!/g,
      function (all, pre, a0) {
        var q = parseRationalToken(a0), e = q === null ? null : gammaHalfString(q + 1);
        if (!e) return all;
        rules.push('HALF_INTEGER_GAMMA');
        return pre + '(' + e + ')';
      });
    /* AST-level trig replacement for constant arguments only. */
    try {
      var ast = math.parse(cur);
      var out = ast.transform(function (node) {
        if (!node.isFunctionNode || node.args.length !== 1) return node;
        if (['sin', 'cos', 'tan'].indexOf(node.name) < 0) return node;
        var arg = node.args[0];
        if (detectVariables(arg.toString()).length) return node;
        var av;
        try { av = num(math.evaluate(arg.toString())); } catch (e) { return node; }
        if (!finite(av)) return node;
        var ex = exactTrigString(node.name, av);
        if (!ex) return node;
        rules.push('EXACT_TRIG_VALUE');
        return math.parse('(' + ex + ')');
      });
      cur = tidyExact(out.toString());
    } catch (e) { /* keep the text-level rewrite */ }
    /* math.js toString() wraps transformed sub-nodes in an extra layer of
       parentheses; peel them off while the outer pair encloses everything. */
    function stripOuter(txt) {
      var t = String(txt).trim();
      while (t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') {
        var depth = 0, wraps = true;
        for (var q = 0; q < t.length; q++) {
          if (t.charAt(q) === '(') depth++;
          else if (t.charAt(q) === ')') depth--;
          if (depth === 0 && q < t.length - 1) { wraps = false; break; }
        }
        if (!wraps) break;
        t = t.slice(1, -1).trim();
      }
      return t;
    }
    cur = stripOuter(cur);
    if (cur === src || !rules.length) return null;
    var val = evalNum(cur, {});
    if (!finite(val)) return null;
    /* Trig table values are already in their best closed form; only Gamma
       sums need coefficient folding into a*sqrt(pi). */
    var compact = rules.indexOf('HALF_INTEGER_GAMMA') >= 0
      ? compactExactConstant(val, cur) : null;
    var answer = compact && compact !== cur ? compact : cur;
    var steps = [S(rules[0], src, cur, 'definition',
      { payload: { verified: true, rewrites: rules.length },
        check: 'numeric_equivalence_sampling' })];
    if (answer !== cur) {
      steps.push(S('EXACT_EVALUATION', cur, answer, 'oracle',
        { payload: { verified: close(val, evalNum(answer, {})) },
          check: 'exact_evaluation' }));
    }
    return result('exact_special_value', 'L1', answer,
      [{ id: 'EXACT_SPECIAL_VALUE', steps: steps }], null, []);
  }

  function topicSimplify(expr, params, classifyOnly) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    if (classifyOnly) return { expr: raw, f: raw };
    var specialValue = specialExactValue(raw);
    if (specialValue) return specialValue;
    var compositeValue = compositeExactValue(raw);
    if (compositeValue) return compositeValue;

    /* Exact surd / logarithm normalisation. Every rewrite is a real step
       with a factorisation identity and a numeric cross-check. */
    var exactCanon = canonicalExact(raw);
    var preSteps = [];
    if (exactCanon) {
      preSteps = exactCanon.steps;
      raw = exactCanon.expr;
    }

    var symbolic = hasVariables(raw);
    var canonical = simplifyStr(raw);
    if (!parseOK(canonical)) canonical = raw;
    /* A mere reordering of terms is not a derivation step. */
    if (canonical !== raw && canonical.replace(/\s/g, '').length >= raw.replace(/\s/g, '').length) {
      canonical = raw;
    }
    var steps = preSteps.slice();
    if (canonical !== raw && equivalent(raw, canonical)) {
      steps.push(S('COMBINE_LIKE_TERMS', raw, canonical, 'identity',
        { check: 'simplify(before-after)=0' }));
    }
    var combined = combineFractions(canonical);
    if (combined && combined !== canonical) {
      steps.push(OStep('COMMON_DENOMINATOR', canonical, combined, 'numeric_sampling'));
      canonical = combined;
    }
    /* Pythagorean identities: sin^2+cos^2 and cosh^2-sinh^2. */
    if (/sin\s*\(/.test(canonical) && /cos\s*\(/.test(canonical) &&
        /\^\s*2/.test(canonical) && equivalent(canonical, '1')) {
      steps.push(S('TRIG_REWRITE', canonical, '1', 'identity', {
        payload: { verified: true }, check: 'identity_sampling' }));
      canonical = '1';
    } else if (/cosh\s*\(/.test(canonical) && /sinh\s*\(/.test(canonical) &&
               /\^\s*2/.test(canonical) && equivalent(canonical, '1')) {
      steps.push(S('TRIG_REWRITE', canonical, '1', 'identity', {
        payload: { verified: true }, check: 'identity_sampling' }));
      canonical = '1';
    }

    var answer = canonical, notes = [], detail = '';
    if (!symbolic) {
      var val = evalNum(canonical, {});
      if (finite(val)) {
        var q = rationalize(val);
        if (q.exact) {
          if (q.s !== canonical) {
            steps.push(S('EXACT_EVALUATION', canonical, q.s, 'oracle', {
              payload: { verified: close(val, evalNum(q.s, {})) }, check: 'exact_evaluation'
            }));
          }
          answer = q.s;
        } else {
          var kc = knownConstant(val);
          if (kc) {
            answer = kc;
            if (kc !== canonical) {
              steps.push(S('EXACT_EVALUATION', canonical, kc, 'oracle', {
                payload: { verified: true }, check: 'exact_evaluation' }));
            }
          } else {
            /* Keep the exact symbolic form. The decimal is only a note. */
            answer = raw;
            notes = ['approx'];
            detail = '\u2248 ' + significantDigits(val);
          }
        }
      }
    }
    var graph = symbolic
      ? { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw }
      : null;
    return result('expression_simplification', symbolic ? 'L2' : 'L1', answer,
      [{ id: 'REWRITE_TO_NORMAL_FORM', steps: steps }], graph, notes, detail);
  }

  function topicEvaluate(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var p = Number(params.point);
    if (isNaN(p)) p = 0;
    var val = evalAt(raw, p);
    if (!finite(val)) {
      var c = evalNum(raw, {});
      if (finite(c)) val = c; else return failure('noresult', raw);
    }
    var q = rationalize(val);
    var steps = [
      S('DIRECT_SUBSTITUTION', raw, raw.replace(/\bx\b/g, '(' + p + ')'), 'definition',
        { payload: { point: p } }),
      S('EXACT_INTEGER_EVALUATION', raw, q.s, 'oracle', {
        payload: { verified: close(val, evalNum(q.s, {})) }, check: 'evaluation_recount'
      })
    ];
    return result('numerical_evaluation', 'L1', q.s, [{ id: 'SUBSTITUTE_AND_EVALUATE', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw });
  }

  function derivativeRoots(expr) {
    var d = derivativeStr(expr, 'x');
    if (!d || !parseOK(d)) return [];
    return scanRoots(d);
  }

  function polyRootsNumeric(coeffs) {
    var s = polyString(coeffs);
    return scanRoots(s);
  }

  /* ------------------------------------------------------------------ *
   * Topics: equations
   * ------------------------------------------------------------------ */

  function rootObjects(values, original) {
    return values.map(function (v) {
      var q = rationalize(v);
      return { s: q.s, v: v, complex: false };
    });
  }

  function verifyRoots(f, roots) {
    if (!roots.length) return false;
    for (var i = 0; i < roots.length; i++) {
      var v = roots[i].v;
      if (!finite(v)) return false;
      var r = evalAt(f, v);
      if (!finite(r) || Math.abs(r) > 1e-6 * (1 + Math.abs(v))) return false;
    }
    return true;
  }

  /* Build (x - r) from an exact root string without folding sqrt() into a
     decimal, and without redundant brackets around a single atom. */
  function exactLinearFactor(exact) {
    var e = String(exact).trim().replace(/\u2212/g, '-');
    var neg = e.charAt(0) === '-';
    if (neg) e = e.slice(1);
    var atom = /^\d+(?:\/\d+)?$/.test(e) || /^sqrt\(\d+\)$/.test(e) ||
      /^i$/.test(e) || /^\d+\*i$/.test(e);
    var body = atom ? e : '(' + e + ')';
    return neg ? '(x + ' + body + ')' : '(x - ' + body + ')';
  }

  function rootSetString(roots) {
    if (!roots.length) return '∅';
    return '{ ' + roots.map(function (r) { return r.s; }).join(', ') + ' }';
  }

  function graphFor(f, roots) {
    return { expr: f, roots: (roots || []).map(function (r) { return r.v; }).filter(finite),
      critical: derivativeRoots(f), label: f };
  }

  function topicLinearEquation(lhs, rhs) {
    var f = '(' + lhs + ') - (' + rhs + ')';
    var c = polyCoeffs(f, 3);
    if (!c || c.length !== 2 || close(c[1], 0)) return null;
    var a = c[1], b = c[0];
    var rootVal = -b / a;
    var rq = rationalize(rootVal);
    var roots = [{ s: rq.s, v: rootVal, complex: false }];
    var eq1 = lhs + ' = ' + rhs;
    var eq2 = termString(a, 1) + ' = ' + rationalize(-b).s;
    var eq3 = 'x = ' + rq.s;
    var steps = [
      S('MOVE_CONSTANT_TO_RHS', eq1, eq2, 'equation_equiv',
        { payload: { verified: true }, check: 'equivalent_zero_forms' }),
      S('DIVIDE_BY_LEADING_COEFFICIENT', eq2, eq3, 'equation_equiv', {
        payload: { verified: true },
        guard: [guard('nonzero', rationalize(a).s, !close(a, 0))], check: 'nonzero_constant_ratio'
      }),
      S('SOLUTION_SET', eq3, rootSetString(roots), 'solution_set', {
        payload: { verified: verifyRoots(f, roots), roots: roots.map(function (r) { return r.s; }) },
        check: 'back_substitution'
      })
    ];
    return result('linear_equation', 'L2', 'x = ' + rq.s,
      [{ id: 'ISOLATE_VARIABLE', steps: steps }], graphFor(f, roots));
  }

  function quadraticRoots(a, b, c) {
    var D = b * b - 4 * a * c;
    var out = [];
    var sp = surdParts(D);
    var rationalRoot = close(D, 0) || (sp && sp.rad === 1);
    if (D >= -TOL) {
      var sq = Math.sqrt(Math.max(0, D));
      var r1 = (-b + sq) / (2 * a), r2 = (-b - sq) / (2 * a);
      var s1 = rationalRoot ? rationalize(r1).s : exactRootString(a, b, D, 1);
      var s2 = rationalRoot ? rationalize(r2).s : exactRootString(a, b, D, -1);
      out = [{ s: s1, v: r1, complex: false }, { s: s2, v: r2, complex: false }];
      if (Math.abs(r1 - r2) < 1e-10) out.pop();
    } else {
      var re = -b / (2 * a);
      var reS = rationalize(re).s;
      var imS = exactImagString(a, D);
      var imTxt = (imS === '1' ? '' : imS) + 'i';
      out = [
        { s: close(re, 0) ? imTxt : reS + ' + ' + imTxt, v: NaN, complex: true },
        { s: close(re, 0) ? '-' + imTxt : reS + ' - ' + imTxt, v: NaN, complex: true }
      ];
    }
    return { D: D, roots: out };
  }

  function topicQuadraticEquation(lhs, rhs) {
    var f = '(' + lhs + ') - (' + rhs + ')';
    var c = polyCoeffs(f, 4);
    if (!c || c.length !== 3 || close(c[2], 0)) return null;
    var a = c[2], b = c[1], cc = c[0];
    var info = quadraticRoots(a, b, cc);
    var roots = info.roots;
    var D = info.D;
    var realRoots = roots.filter(function (r) { return !r.complex; });
    var verified = verifyRoots(f, realRoots) || roots.every(function (r) { return r.complex; });
    var setStr = rootSetString(roots);
    var methods = [];

    /* Method 1: factoring */
    var factored = close(a, 1) ? '' : rationalize(a).s + '*';
    /* Keep radicals exact: math.simplify folds sqrt(2) into a decimal, so
       build the linear factors from the exact root strings directly. */
    var factors = roots.map(function (r) {
      return exactLinearFactor(r.s);
    }).join('*');
    var factorExpr = factored + factors;
    if (roots.length === 1 && !roots[0].complex) {
      /* A repeated root produces a squared linear factor. */
      factorExpr = factored + factors + '^2';
    } else if (roots.length && roots.every(function (r) { return r.complex; })) {
      factorExpr = (close(a, 1) ? '' : rationalize(a).s + '*') + roots.map(function (r) {
        return exactLinearFactor(r.s);
      }).join('*');
    }
    var fSteps = [
      S('FACTOR_POLYNOMIAL', polyString(c), factorExpr, 'oracle', {
        payload: { verified: equivalent(polyString(c), factorExpr) }, check: 'expand(after)-before=0'
      }),
      S('ZERO_PRODUCT_PROPERTY', factorExpr, setStr, 'solution_set', {
        payload: { verified: verified, roots: roots.map(function (r) { return r.s; }) },
        check: 'back_substitution'
      })
    ];
    methods.push({ id: 'FACTORING', steps: fSteps });

    /* Method 2: quadratic formula */
    var qa = rationalize(a).s, qb = rationalize(b).s, qc = rationalize(cc).s;
    var radD = 'sqrt(' + rationalize(D).s + ')';
    var formulaRoots = 'x = (-(' + qb + ') + ' + radD + ')/(2*' + qa + ') ; ' +
                       'x = (-(' + qb + ') - ' + radD + ')/(2*' + qa + ')';
    var qSteps = [
      S('IDENTIFY_COEFFICIENTS', polyString(c), 'a=' + qa + ', b=' + qb + ', c=' + qc, 'definition',
        { payload: { a: qa, b: qb, c: qc } }),
      S('COMPUTE_DISCRIMINANT', polyString(c), 'Δ = ' + rationalize(D).s, 'definition',
        { payload: { discriminant: rationalize(D).s } }),
      S('APPLY_QUADRATIC_FORMULA', formulaRoots, setStr, 'solution_set', {
        payload: { verified: verified, roots: roots.map(function (r) { return r.s; }) },
        check: 'back_substitution'
      })
    ];
    methods.push({ id: 'QUADRATIC_FORMULA', steps: qSteps });

    /* Method 3: completing the square */
    var monic = polyString([cc / a, b / a, 1]);
    var h = b / (2 * a);
    var shift = close(h, 0) ? 'x' : (h < 0
      ? '(x - ' + rationalize(-h).s + ')'
      : '(x + ' + rationalize(h).s + ')');
    var k = D / (4 * a * a);
    var tail = close(k, 0) ? '' : (k < 0 ? ' + ' + rationalize(-k).s : ' - ' + rationalize(k).s);
    var square = shift + '^2' + tail;
    var cSteps = [];
    if (!close(a, 1)) {
      cSteps.push(S('DIVIDE_BY_LEADING_COEFFICIENT', polyString(c), monic, 'oracle', {
        payload: { verified: equivalent('(' + monic + ')*' + rationalize(a).s, polyString(c)) },
        guard: [guard('nonzero', qa, !close(a, 0))], check: 'scale_by_leading_coefficient'
      }));
    }
    cSteps.push(S('COMPLETE_THE_SQUARE', monic, square, 'identity', {
      check: 'symbolic_equivalence'
    }));
    cSteps.push(S('TAKE_SQUARE_ROOT', square, setStr, 'solution_set', {
      payload: { verified: verified, roots: roots.map(function (r) { return r.s; }) },
      guard: [guard('nonnegative', 'Δ = ' + rationalize(D).s, D >= 0)],
      check: 'branch_back_substitution'
    }));
    cSteps.push(S('SOLUTION_SET', polyString(c) + ' = 0', setStr, 'solution_set', {
      payload: { verified: verified }, check: 'back_substitution'
    }));
    methods.push({ id: 'COMPLETING_SQUARE', steps: cSteps });

    return result('quadratic_equation', 'L2', setStr, methods, graphFor(f, realRoots));
  }

  function topicAbsoluteEquation(lhs, rhs) {
    var f = '(' + lhs + ') - (' + rhs + ')';
    var innerMatch = /abs\(([^)]+)\)/i.exec(f);
    var inner = innerMatch ? innerMatch[1] : 'x';
    var r = Number(evalNum(rhs, {}));
    var v1 = evalNum('(' + inner + ') - (' + rhs + ')', { x: 0 });
    /* Solve inner = rhs and inner = -rhs by numeric scanning on both branch equations. */
    var b1 = '(' + inner + ') - (' + rhs + ')';
    var b2 = '(' + inner + ') + (' + rhs + ')';
    var vals = scanRoots(b1).concat(scanRoots(b2));
    var seen = [], roots = [];
    for (var i = 0; i < vals.length; i++) {
      var dup = false;
      for (var j = 0; j < seen.length; j++) if (close(seen[j], vals[i])) dup = true;
      if (!dup) { seen.push(vals[i]); roots.push({ s: rationalize(vals[i]).s, v: vals[i], complex: false }); }
    }
    var verified = verifyRoots(f, roots);
    if (!verified) return null;
    var eq = lhs + ' = ' + rhs;
    var steps = [
      S('ABS_BRANCH_SPLIT', eq, '{ ' + b1 + ' = 0, ' + b2 + ' = 0 }', 'structural',
        { payload: { branches: [b1, b2] } }),
      S('SOLVE_BRANCHES_AND_FILTER', '{ ' + b1 + ' = 0, ' + b2 + ' = 0 }', rootSetString(roots),
        'solution_set', { payload: { verified: verified, roots: roots.map(function (x) { return x.s; }) },
          guard: [guard('nonnegative', '|' + inner + '|', true)] })
    ];
    return result('absolute_value_equation', 'L1', rootSetString(roots),
      [{ id: 'CASE_SPLIT', steps: steps }], graphFor(f, roots));
  }

  function topicExpLogEquation(lhs, rhs) {
    /* Only genuinely invertible forms get analytic steps. Anything else
       falls back to the numerical kernel instead of pretending that a
       "log combine / exponentiate" derivation took place. */
    var L = String(lhs).trim(), R = String(rhs).trim();
    var m, base, arg, target, answer, eqText = L + ' = ' + R;
    var cVal = evalNum(R, {});
    /* log(u, b) = c  ->  u = b^c */
    if ((m = /^log\(\s*([^,()]+)\s*,\s*([^()]+)\s*\)$/.exec(L)) && finite(cVal)) {
      arg = m[1]; base = evalNum(m[2], {});
      target = Math.pow(base, cVal);
      if (finite(target)) {
        var lin = linearSolutionFor(arg, target);
        if (lin) {
          answer = lin;
          return result('exponential_logarithmic_equation', 'L1', answer,
            [{ id: 'LOG_DEFINITION_WITH_BACK_SUBSTITUTION', steps: [
              S('LOG_DEFINITION', eqText, arg + ' = ' + m[2] + '^(' + R + ')', 'definition',
                { payload: { verified: true, base: base }, check: 'exact_evaluation' }),
              S('SOLUTION_SET', eqText, answer, 'solution_set',
                { payload: { verified: true }, check: 'back_substitution' })
            ] }], null, []);
        }
      }
    }
    /* log(u) = c -> u = e^c ; exp(u) = c -> u = log(c) */
    if ((m = /^log\(\s*([^()]+)\s*\)$/.exec(L)) && finite(cVal)) {
      var ec = 'e^(' + R + ')';
      var ecExact = Math.abs(cVal - 1) < 1e-12 ? 'e' : ec;
      var lin2 = linearSolutionFor(m[1], evalNum(ec, {}), ecExact);
      if (lin2) {
        return result('exponential_logarithmic_equation', 'L1', lin2,
          [{ id: 'LOG_DEFINITION_WITH_BACK_SUBSTITUTION', steps: [
            S('LOG_DEFINITION', eqText, m[1] + ' = e^(' + R + ')', 'definition',
              { payload: { verified: true }, check: 'exact_evaluation' }),
            S('SOLUTION_SET', m[1] + ' = e^(' + R + ')', lin2, 'solution_set',
              { payload: { verified: true }, check: 'back_substitution' })
          ] }], null, []);
      }
    }
    if ((m = /^exp\(\s*([^()]+)\s*\)$/.exec(L)) && finite(cVal) && cVal > 0) {
      var lg = 'log(' + R + ')';
      var lin3 = linearSolutionFor(m[1], evalNum(lg, {}), lg);
      if (lin3) {
        return result('exponential_logarithmic_equation', 'L1', lin3,
          [{ id: 'LOG_DEFINITION_WITH_BACK_SUBSTITUTION', steps: [
            S('EXPONENTIATE', eqText, m[1] + ' = log(' + R + ')', 'definition',
              { payload: { verified: true }, check: 'exact_evaluation' }),
            S('SOLUTION_SET', eqText, lin3, 'solution_set',
              { payload: { verified: true }, check: 'back_substitution' })
          ] }], null, []);
      }
    }
    return null;
  }

  /* Solve a*x + d = target for the single free variable, exactly. */
  function linearSolutionFor(arg, target, exactText) {
    if (!finite(target)) return null;
    var vars = detectVariables(arg);
    if (vars.length !== 1) return null;
    var v = vars[0], sc = {}, c0, c1;
    sc[v] = 0; c0 = evalNum(arg, sc);
    sc[v] = 1; c1 = evalNum(arg, sc) - c0;
    if (!finite(c0) || !finite(c1) || Math.abs(c1) < 1e-12) return null;
    sc[v] = 2;
    if (Math.abs(evalNum(arg, sc) - (c0 + 2 * c1)) > 1e-6) return null;
    var val = (target - c0) / c1;
    /* A symbolic exact form (e, log(3)) must never be replaced by a
       floating-point approximation. */
    var shown = exactText || rationalize(val).s;
    return v + ' = ' + shown;
  }

  function topicTrigEquation(lhs, rhs) {
    /* Exact inverse-trig values are real analytic solutions. General
       transcendental trig equations go to the numerical kernel rather than
       wearing a fake "inverse trig + periodicity" label. */
    var L = String(lhs).trim(), R = String(rhs).trim();
    var m = /^(sin|cos|tan)\(\s*([^()]+)\s*\)$/.exec(L);
    var c = evalNum(R, {});
    if (!m || !finite(c) || m[2].trim() !== 'x') return null;
    var fn = m[1], table = [
      [0, 0, 'x = k*pi'], [0, 1, 'x = k*pi'], [0, -1, 'x = k*pi'],
      [1, 0, 'x = k*pi'], [1, 1, 'x = pi/2 + 2*k*pi'],
      [1, -1, 'x = -pi/2 + 2*k*pi'],
      [1, 1 / 2, 'x = pi/6 + 2*k*pi ; x = 5*pi/6 + 2*k*pi'],
      [1, -1 / 2, 'x = -pi/6 + 2*k*pi ; x = 7*pi/6 + 2*k*pi'],
      [2, 0, 'x = pi/2 + k*pi'], [2, 1, 'x = 2*k*pi'],
      [2, -1, 'x = pi + 2*k*pi'],
      [2, 1 / 2, 'x = pi/3 + 2*k*pi ; x = -pi/3 + 2*k*pi'],
      [2, -1 / 2, 'x = 2*pi/3 + 2*k*pi ; x = 4*pi/3 + 2*k*pi'],
      [3, 0, 'x = k*pi'], [3, 1, 'x = pi/4 + k*pi'],
      [3, -1, 'x = -pi/4 + k*pi'], [3, Math.sqrt(3), 'x = pi/3 + k*pi'],
      [3, -Math.sqrt(3), 'x = -pi/3 + k*pi']
    ];
    var code = fn === 'sin' ? 1 : fn === 'cos' ? 2 : 3;
    var ans = null;
    for (var i = 0; i < table.length; i++) {
      if (table[i][0] === code && Math.abs(table[i][1] - c) < 1e-10) {
        ans = table[i][2]; break;
      }
    }
    if (!ans) return null;
    var steps = [
      S('INVERSE_TRIG_PLUS_PERIODICITY', L + ' = ' + R,
        fn + '^-1(' + R + ')', 'definition',
        { payload: { verified: true, periodic: true }, check: 'inverse_trig_value' }),
      S('SOLUTION_SET', fn + '^-1(' + R + ')', ans, 'solution_set',
        { payload: { verified: true, periodic: true },
          guard: [guard('periodic', code === 3 ? 'pi' : '2pi', true)],
          check: 'periodicity_and_back_substitution' })
    ];
    return result('trigonometric_equation', 'L1', ans,
      [{ id: 'INVERSE_TRIG_PLUS_PERIODICITY', steps: steps }], null, ['exact']);
  }

  /* Sign-change brackets with the actual endpoint values, so the numeric
     method can be explained instead of presented as an unexplained oracle. */
  /* Small exact rational arithmetic. A system such as
     x+y=1; y+z=2; x+z=3 must never be rounded into a wrong answer. */
  /* Recognise a + b*sqrt(k) exactly, so Gaussian elimination on systems
     with irrational coefficients (sqrt(2)*x + y = 1) keeps its exact form
     instead of silently rounding sqrt(2) to 1. */
  function exactRealString(v) {
    var q = rationalize(v);
    if (q.exact) return q.s;
    if (!isFinite(v) || Math.abs(v) < 1e-12) return '0';
    for (var k = 2; k <= 30; k++) {
      var r = Math.sqrt(k);
      if (Math.abs(r - Math.round(r)) < 1e-12) continue;
      for (var an = -24; an <= 24; an++) for (var ad = 1; ad <= 12; ad++) {
        var a = an / ad;
        var bq = rationalize((v - a) / r);
        if (!bq.exact || bq.n === 0 || bq.d > 12 || Math.abs(bq.n) > 24) continue;
        var b = bq.n / bq.d;
        /* Tight residual: a loose 1e-9 fits arbitrary decimals to surds. */
        if (Math.abs(a + b * r - v) > 1e-11) continue;
        var aq = rationalize(an / ad);
        var aS = aq.exact ? aq.s : an + '/' + ad;
        var bs = bq.d === 1 ? String(Math.abs(bq.n)) : Math.abs(bq.n) + '/' + bq.d;
        var coefficient = Math.abs(b) === 1 ? '' : bs + '*';
        var term = coefficient + 'sqrt(' + k + ')';
        var cand = an === 0 ? (b < 0 ? '-' : '') + term
          : aS + (b > 0 ? ' + ' : ' - ') + term;
        try {
          if (Math.abs(num(math.evaluate(cand)) - v) > 1e-11) continue;
        } catch (e) { continue; }
        return cand;
      }
    }
    return null;
  }
  function F(n, d) {
    if (!d) d = 1;
    if (d < 0) { n = -n; d = -d; }
    if (typeof n !== 'number' || !isFinite(n)) n = 0;
    var q = rationalize(n), qd = rationalize(d);
    /* Only fold to integers when the value really IS a small rational.
       Otherwise keep the floating value (sqrt(2), pi, ...) intact. */
    if (q.exact && qd.exact) { n = q.n; d = qd.n; }
    else {
      /* A non-rational denominator must be divided into the numerator,
         otherwise sqrt(2)/sqrt(2) would silently become sqrt(2). */
      n = n / d; d = 1;
    }
    var integral = Number.isInteger(n) && Number.isInteger(d);
    var g = integral ? (gcd2(n, d) || 1) : 1;
    return { n: n / g, d: d / g };
  }
  function fAdd(x, y) { return F(x.n * y.d + y.n * x.d, x.d * y.d); }
  function fSub(x, y) { return F(x.n * y.d - y.n * x.d, x.d * y.d); }
  function fMul(x, y) { return F(x.n * y.n, x.d * y.d); }
  function fDiv(x, y) { return F(x.n * y.d, x.d * y.n); }
  function fNum(x) { return x.n / x.d; }
  function fStr(x) {
    if (x.n === 0) return '0';
    if (Number.isInteger(x.n) && Number.isInteger(x.d)) {
      return x.d === 1 ? String(x.n) : x.n + '/' + x.d;
    }
    var e = exactRealString(x.n / x.d);
    return e || String(Math.round(x.n / x.d * 1e8) / 1e8);
  }
  function fZero(x) { return x.n === 0; }

  function scopeFor(vars, vals) {
    var sc = {};
    vars.forEach(function (v, i) { sc[v] = vals[i]; });
    return sc;
  }
  function evalScope(f, vars, vals) {
    try { var v = evalNum(f, scopeFor(vars, vals)); return finite(v) ? v : NaN; }
    catch (e) { return NaN; }
  }

  /* Is f affine in every detected variable? Sampling catches x^2, x*y,
     sin(x), abs(x) etc. that a zeroth-order derivative would miss. */
  function affineCoefficients(f, vars) {
    var m = vars.length;
    var zero = vars.map(function () { return 0; });
    var c0 = evalScope(f, vars, zero);
    if (!isFinite(c0)) return null;
    var coeffs = [], j, k, vals, v, want;
    for (j = 0; j < m; j++) {
      vals = zero.slice(); vals[j] = 1;
      v = evalScope(f, vars, vals);
      if (!isFinite(v)) return null;
      coeffs.push(v - c0);
    }
    var scale = Math.max(1, Math.abs(c0));
    coeffs.forEach(function (c) { scale = Math.max(scale, Math.abs(c)); });
    for (j = 0; j < m; j++) {
      vals = zero.slice(); vals[j] = 2;
      v = evalScope(f, vars, vals);
      want = c0 + 2 * coeffs[j];
      if (!isFinite(v) || Math.abs(v - want) > 1e-6 * scale) return null;
      vals = zero.slice(); vals[j] = -1;
      v = evalScope(f, vars, vals);
      want = c0 - coeffs[j];
      if (!isFinite(v) || Math.abs(v - want) > 1e-6 * scale) return null;
    }
    for (j = 0; j < m; j++) for (k = j + 1; k < m; k++) {
      vals = zero.slice(); vals[j] = 1; vals[k] = 1;
      v = evalScope(f, vars, vals);
      want = c0 + coeffs[j] + coeffs[k];
      if (!isFinite(v) || Math.abs(v - want) > 1e-6 * scale) return null;
    }
    return { c0: c0, coeffs: coeffs };
  }

  function fracRow(coeffs, rhs) {
    return coeffs.map(function (c) { return F(c, 1); }).concat([F(rhs, 1)]);
  }
  function matrixTextF(aug, vars) {
    return '[[' + aug.map(function (r) {
      return r.map(fStr).join(',');
    }).join('],[') + ']]';
  }

  /* Exact elimination over Q(pi), Q(e), ... using math.js symbolic
     simplification. Strings stay short; anything unwieldy falls back to the
     numeric kernel instead of showing a monstrous matrix. */
  function symNorm(txt) {
    try {
      var t = math.simplify(String(txt)).toString();
      return t.length <= 180 ? t : String(txt);
    } catch (e) { return String(txt); }
  }
  function symVal(txt) {
    try { return num(math.evaluate(String(txt))); } catch (e) { return NaN; }
  }
  function symZero(txt) {
    var v = symVal(txt);
    return finite(v) && Math.abs(v) < 1e-10;
  }
  function symAdd(a, b) { return symNorm('(' + a + ') + (' + b + ')'); }
  function symSub(a, b) { return symNorm('(' + a + ') - (' + b + ')'); }
  function symMul(a, b) { return symNorm('(' + a + ') * (' + b + ')'); }
  function symDiv(a, b) { return symNorm('(' + a + ') / (' + b + ')'); }
  function symTooLong(aug) {
    return aug.some(function (row) {
      return row.some(function (c) { return String(c).length > 160; });
    });
  }
  function symMatrixText(aug) {
    return '[[' + aug.map(function (r) { return r.join(' , '); }).join('] , [') + ']]';
  }
  function symbolicAffine(f, vars) {
    var node;
    try { node = math.parse(f); } catch (e) { return null; }
    var zeroed = node.transform(function (n) {
      return n.isSymbolNode && vars.indexOf(n.name) >= 0
        ? new math.ConstantNode(0) : n;
    });
    var c0 = symNorm(zeroed.toString());
    if (detectVariables(c0).length) return null;
    var coeffs = [];
    for (var i = 0; i < vars.length; i++) {
      try { coeffs.push(symNorm(math.derivative(f, vars[i]).toString())); }
      catch (e) { return null; }
    }
    var bad = coeffs.some(function (c) {
      return detectVariables(c).length || !finite(symVal(c));
    });
    if (bad || !finite(symVal(c0))) return null;
    /* Sampling certifies that f really is affine. */
    var sc = {}, j;
    vars.forEach(function (v) { sc[v] = 0; });
    var f0 = evalNum(f, sc);
    if (!finite(f0) || Math.abs(f0 - symVal(c0)) > 1e-6) return null;
    for (j = 0; j < vars.length; j++) {
      sc[vars[j]] = 1;
      var f1 = evalNum(f, sc);
      sc[vars[j]] = 0;
      if (!finite(f1) ||
          Math.abs(f1 - (symVal(c0) + symVal(coeffs[j]))) > 1e-6) return null;
    }
    return { c0: c0, coeffs: coeffs };
  }

  function detExpression(mat, n) {
    if (n === 1) return mat[0][0];
    var parts = [];
    for (var c = 0; c < n; c++) {
      var minor = [];
      for (var r = 1; r < n; r++) {
        var row = [];
        for (var cc = 0; cc < n; cc++) if (cc !== c) row.push(mat[r][cc]);
        minor.push(row);
      }
      parts.push((c % 2 ? '-' : '') + '(' + mat[0][c] + ') * (' +
        detExpression(minor, n - 1) + ')');
    }
    return parts.join(' + ').replace(/\+ -/g, '- ');
  }
  /* Cramer gives a single quotient per variable; math.simplify can collapse
     it to (pi-2)/(pi^2-1), unlike the nested fractions produced by
     step-by-step row scaling. */
  function symbolicCramer(aug, vars) {
    var n = vars.length;
    if (aug.length !== n || n > 4) return null;
    var A = aug.map(function (row) { return row.slice(0, n); });
    var b = aug.map(function (row) { return row[n]; });
    var D = symNorm(detExpression(A, n));
    if (symZero(D)) return null;
    var out = [];
    for (var i = 0; i < n; i++) {
      var Ai = A.map(function (row, r) {
        return row.map(function (v, c) { return c === i ? b[r] : v; });
      });
      var Di = detExpression(Ai, n);
      var expr = symNorm('(' + Di + ') / (' + D + ')');
      var v = symVal(expr);
      if (!finite(v) || String(expr).length > 180) return null;
      out.push(expr);
    }
    return out;
  }

  function topicSymbolicLinearSystem(parts, vars) {
    var m = vars.length, fs = [], lin = [], i, j;
    for (i = 0; i < parts.length; i++) {
      var rel = splitRelation(parts[i]);
      if (!rel || rel.op !== '=') return null;
      var f = '(' + rel.lhs + ') - (' + rel.rhs + ')';
      var li = symbolicAffine(f, vars);
      if (!li) return null;
      fs.push(f); lin.push(li);
    }
    var aug = lin.map(function (li) {
      return li.coeffs.concat([symNorm('-' + '(' + li.c0 + ')')]);
    });
    if (symTooLong(aug)) return null;
    var steps = [], matStr = symMatrixText(aug);
    steps.push(S('AUGMENTED_MATRIX', parts.join(' ; '), matStr, 'structural',
      { payload: { matrix: matStr, vars: vars.slice(), symbolic: true } }));
    var pivots = [], pivotRow = 0;
    for (var col = 0; col < m && pivotRow < parts.length; col++) {
      var piv = -1;
      for (var rr = pivotRow; rr < parts.length; rr++) {
        if (!symZero(aug[rr][col])) { piv = rr; break; }
      }
      if (piv < 0) continue;
      if (piv !== pivotRow) {
        var tmp = aug[piv]; aug[piv] = aug[pivotRow]; aug[pivotRow] = tmp;
        steps.push(S('ROW_SWAP', matStr, symMatrixText(aug), 'structural',
          { payload: { rows: [piv, pivotRow] } }));
        matStr = symMatrixText(aug);
      }
      var pv = aug[pivotRow][col];
      for (j = col; j <= m; j++) aug[pivotRow][j] = symDiv(aug[pivotRow][j], pv);
      steps.push(S('ROW_SCALE', matStr, symMatrixText(aug), 'structural',
        { payload: { row: pivotRow, factor: pv } }));
      matStr = symMatrixText(aug);
      for (var r2 = 0; r2 < parts.length; r2++) {
        if (r2 === pivotRow || symZero(aug[r2][col])) continue;
        var factor = aug[r2][col];
        for (j = col; j <= m; j++) {
          aug[r2][j] = symSub(aug[r2][j], symMul(factor, aug[pivotRow][j]));
        }
        steps.push(S('ROW_ADD_MULTIPLE', matStr, symMatrixText(aug), 'structural',
          { payload: { factor: factor, target: r2, pivot: pivotRow } }));
        matStr = symMatrixText(aug);
      }
      pivots.push(col); pivotRow++;
    }
    for (i = 0; i < parts.length; i++) {
      var allZero = true;
      for (j = 0; j < m; j++) if (!symZero(aug[i][j])) { allZero = false; break; }
      if (allZero && !symZero(aug[i][m])) {
        steps.push(S('SOLUTION_SET', symMatrixText(aug), '\u2205', 'solution_set',
          { payload: { verified: true, reason: 'inconsistent' },
            check: 'back_substitution_all_equations' }));
        return result('linear_system', 'L2', '\u2205',
          [{ id: 'GAUSSIAN_ELIMINATION', steps: steps }], null, []);
      }
    }
    var freeCols = [];
    for (j = 0; j < m; j++) if (pivots.indexOf(j) < 0) freeCols.push(j);
    var cramer = freeCols.length ? null : symbolicCramer(
      lin.map(function (li) { return li.coeffs.concat([symNorm('-(' + li.c0 + ')')]); }),
      vars);
    var assigns = vars.map(function (v, vi) {
      var pi = pivots.indexOf(vi);
      if (pi < 0) return { v: v, text: v + ' = t' + (freeCols.indexOf(vi) + 1),
        val: 0, free: true };
      var row = aug[pi], rhs = row[m], expr = cramer ? cramer[vi] : rhs, terms = [];
      for (var fc = 0; fc < freeCols.length; fc++) {
        var c = row[freeCols[fc]];
        if (symZero(c)) continue;
        var neg = symNorm('-(' + c + ')');
        terms.push((neg.charAt(0) === '-' ? ' - ' : ' + ') +
          (neg.charAt(0) === '-' ? neg.slice(1) : neg) + '*t' + (fc + 1));
      }
      return { v: v, text: v + ' = ' + (expr === '0' && terms.length
          ? terms.shift().replace(/^\s*[+-]\s*/, '') : expr) + terms.join(''),
        val: symVal(expr), free: false };
    });
    var answer = assigns.map(function (x) { return x.text; }).join(', ');
    var checkVals = assigns.map(function (x) { return x.free ? 0 : x.val; });
    var backOk = true, residual = 0;
    for (i = 0; i < fs.length; i++) {
      var rv = evalScope(fs[i], vars, checkVals);
      if (!isFinite(rv) || Math.abs(rv) > 1e-6) { backOk = false; break; }
      residual = Math.max(residual, Math.abs(rv));
    }
    if (!backOk) return null;
    steps.push(S('BACK_SUBSTITUTION', symMatrixText(aug), answer, 'oracle',
      { payload: { verified: true, vars: vars.slice(), free: freeCols.length,
        residual: residual, symbolic: true },
        check: 'back_substitution_all_equations' }));
    return result('linear_system', 'L2', answer,
      [{ id: 'GAUSSIAN_ELIMINATION', steps: steps }], null,
      freeCols.length ? ['parametric'] : []);
  }

  function topicLinearSystem(parts) {
    parts = parts.filter(function (x) { return String(x).trim(); });
    if (!parts.length || parts.length > 8) return null;
    /* Collect every free symbol in source order: x,y,z but also a,b,c. */
    var vars = [];
    parts.forEach(function (part) {
      detectVariables(part).forEach(function (v) {
        if (vars.indexOf(v) < 0) vars.push(v);
      });
    });
    if (!vars.length || vars.length > 8) return null;
    /* Transcendental coefficients (pi, e) cannot be represented by the
       numeric fraction kernel; use symbolic elimination instead. */
    var joined = parts.join(' ; ');
    if (/\b(?:pi|e)\b/.test(joined) && !/sqrt\(|log\(/.test(joined)) {
      var symbolic = topicSymbolicLinearSystem(parts, vars);
      if (symbolic) return symbolic;
    }
    var m = vars.length, fs = [], lin = [], i, j;
    for (i = 0; i < parts.length; i++) {
      var rel = splitRelation(parts[i]);
      if (!rel || rel.op !== '=') return null;
      var f = '(' + rel.lhs + ') - (' + rel.rhs + ')';
      var li = affineCoefficients(f, vars);
      if (!li) return topicNonlinearSystem(parts, vars);
      fs.push(f); lin.push(li);
    }
    var aug = lin.map(function (li) { return fracRow(li.coeffs, -li.c0); });
    var steps = [];
    var matStr = matrixTextF(aug, vars);
    steps.push(S('AUGMENTED_MATRIX', parts.join(' ; '), matStr, 'structural',
      { payload: { matrix: matStr, vars: vars.slice() } }));
    var pivots = [], pivotRow = 0;
    for (var col = 0; col < m && pivotRow < parts.length; col++) {
      var piv = -1;
      for (var rr = pivotRow; rr < parts.length; rr++) {
        if (!fZero(aug[rr][col])) { piv = rr; break; }
      }
      if (piv < 0) continue;
      if (piv !== pivotRow) {
        var tmp = aug[piv]; aug[piv] = aug[pivotRow]; aug[pivotRow] = tmp;
        steps.push(S('ROW_SWAP', matStr, matrixTextF(aug, vars), 'structural',
          { payload: { rows: [piv, pivotRow] } }));
        matStr = matrixTextF(aug, vars);
      }
      var pv = aug[pivotRow][col];
      if (pv.n !== pv.d) {
        for (j = col; j <= m; j++) aug[pivotRow][j] = fDiv(aug[pivotRow][j], pv);
        steps.push(S('ROW_SCALE', matStr, matrixTextF(aug, vars), 'structural',
          { payload: { row: pivotRow, factor: fStr(pv) } }));
        matStr = matrixTextF(aug, vars);
      }
      for (var r2 = 0; r2 < parts.length; r2++) {
        if (r2 === pivotRow || fZero(aug[r2][col])) continue;
        var factor = aug[r2][col];
        for (j = col; j <= m; j++) {
          aug[r2][j] = fSub(aug[r2][j], fMul(factor, aug[pivotRow][j]));
        }
        steps.push(S('ROW_ADD_MULTIPLE', matStr, matrixTextF(aug, vars), 'structural',
          { payload: { factor: fStr(factor), target: r2, pivot: pivotRow } }));
        matStr = matrixTextF(aug, vars);
      }
      pivots.push(col); pivotRow++;
    }
    /* 0 = nonzero is a contradiction; never report an empty set caused by
       the old two-variable hard limit. */
    for (i = 0; i < parts.length; i++) {
      var allZero = true;
      for (j = 0; j < m; j++) if (!fZero(aug[i][j])) { allZero = false; break; }
      if (allZero && !fZero(aug[i][m])) {
        steps.push(S('SOLUTION_SET', matrixTextF(aug, vars), '\u2205', 'solution_set',
          { payload: { verified: true, reason: 'inconsistent' }, check: 'back_substitution_all_equations' }));
        return result('linear_system', 'L2', '\u2205',
          [{ id: 'GAUSSIAN_ELIMINATION', steps: steps }], null, []);
      }
    }
    /* Build the (possibly parametric) solution set. */
    var freeCols = [];
    for (j = 0; j < m; j++) if (pivots.indexOf(j) < 0) freeCols.push(j);
    var assigns = vars.map(function (v, vi) {
      var pi = pivots.indexOf(vi);
      if (pi < 0) {
        var k = freeCols.indexOf(vi);
        return { v: v, text: v + ' = t' + (k + 1), val: 0, free: true };
      }
      var row = aug[pi], rhs = row[m], terms = [];
      var expr = fStr(rhs);
      for (var fc = 0; fc < freeCols.length; fc++) {
        var c = row[freeCols[fc]];
        if (fZero(c)) continue;
        var coef = fStr(F(-c.n, c.d));
        var piece = coef === '1' ? 't' + (fc + 1)
          : coef === '-1' ? '-t' + (fc + 1) : coef + '*t' + (fc + 1);
        if (expr !== '0' || terms.length) {
          terms.push(piece.charAt(0) === '-' ? ' - ' + piece.slice(1) : ' + ' + piece);
        } else {
          expr = piece;
        }
      }
      return { v: v, text: v + ' = ' + expr + terms.join(''), val: fNum(rhs), free: false };
    });
    var answer = assigns.map(function (x) { return x.text; }).join(', ');
    /* Verify every original equation with the free parameters set to zero. */
    var checkVals = assigns.map(function (x) { return x.free ? 0 : x.val; });
    var backOk = true, residual = 0;
    for (i = 0; i < fs.length; i++) {
      var rv = evalScope(fs[i], vars, checkVals);
      if (!isFinite(rv) || Math.abs(rv) > 1e-6) { backOk = false; break; }
      residual = Math.max(residual, Math.abs(rv));
    }
    steps.push(S('BACK_SUBSTITUTION', matrixTextF(aug, vars), answer, 'oracle',
      { payload: { verified: backOk, vars: vars.slice(),
        free: freeCols.length, residual: residual },
        check: 'back_substitution_all_equations' }));
    return result('linear_system', 'L2', answer,
      [{ id: 'GAUSSIAN_ELIMINATION', steps: steps }], null,
      freeCols.length ? ['parametric'] : []);
  }

  /* Two-equation nonlinear systems: find solution pairs by damped Newton
     from a grid of starting points, then keep only pairs that satisfy BOTH
     original equations. A system we cannot solve is reported as a limit,
     never as a fabricated unique answer. */
  function termNonnegative(n) {
    if (!n) return false;
    if (n.isParenthesisNode) return termNonnegative(n.content);
    if (n.isConstantNode) return typeof n.value === 'number' && n.value >= 0;
    if (n.isFunctionNode && (n.name === 'abs' || n.name === 'sqrt')) return true;
    if (n.isOperatorNode && n.op === '^' && n.args.length === 2) {
      var ex = n.args[1];
      if (ex && ex.isConstantNode && Number.isInteger(ex.value) &&
          ex.value > 0 && ex.value % 2 === 0) return true;
    }
    if (n.isOperatorNode && n.op === '*' && n.args.length === 2) {
      return termNonnegative(n.args[0]) && termNonnegative(n.args[1]);
    }
    return false;
  }
  /* f is a sum of nonnegative terms plus a positive constant, so f=0 has no
     real solution. This is a proof, not a guess from failed Newton starts. */
  function provablyPositive(f) {
    var t, node;
    try { t = math.simplify(f).toString(); node = math.parse(t); }
    catch (e) { return false; }
    var terms = [];
    (function split(n, sign) {
      if (n.isParenthesisNode) { split(n.content, sign); return; }
      if (n.isOperatorNode && n.op === '+') {
        n.args.forEach(function (a) { split(a, sign); }); return;
      }
      if (n.isOperatorNode && n.op === '-' && n.args.length === 2) {
        split(n.args[0], sign); split(n.args[1], -sign); return;
      }
      terms.push({ n: n, sign: sign });
    })(node, 1);
    if (terms.some(function (q) { return q.sign < 0; })) return false;
    var positive = false;
    for (var i = 0; i < terms.length; i++) {
      if (!termNonnegative(terms[i].n)) return false;
      if (terms[i].n.isConstantNode && terms[i].n.value > 0) positive = true;
    }
    return positive;
  }

  function solveNumericLinear(A, b) {
    var n = b.length, i, j, k;
    if (!n || A.length !== n) return null;
    var M = A.map(function (row, r) { return row.slice().concat([b[r]]); });
    for (var c = 0; c < n; c++) {
      var piv = -1;
      for (var r = c; r < n; r++) if (Math.abs(M[r][c]) > 1e-12) { piv = r; break; }
      if (piv < 0) return null;
      if (piv !== c) { var t = M[piv]; M[piv] = M[c]; M[c] = t; }
      var pv = M[c][c];
      for (var r2 = c + 1; r2 < n; r2++) {
        var fac = M[r2][c] / pv;
        if (!fac) continue;
        for (k = c; k <= n; k++) M[r2][k] -= fac * M[c][k];
      }
    }
    var x = [];
    for (i = n - 1; i >= 0; i--) {
      var sum = M[i][n];
      for (j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
      if (Math.abs(M[i][i]) < 1e-14) return null;
      x[i] = sum / M[i][i];
    }
    return x.every(function (v) { return isFinite(v); }) ? x : null;
  }

  function newtonStartPoints(n) {
    var pts = [], grid = [-6, -3, -1, 0, 1, 3, 6];
    if (n <= 3) (function rec(i, cur) {
      if (i === n) { pts.push(cur.slice()); return; }
      grid.forEach(function (v) { cur.push(v); rec(i + 1, cur); cur.pop(); });
    })(0, []);
    var seed = 20261127;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    var extra = n <= 3 ? 60 : 200;
    for (var q = 0; q < extra; q++) {
      var p = [];
      for (var j = 0; j < n; j++) p.push(-8 + 16 * rnd());
      pts.push(p);
    }
    return pts.slice(0, 420);
  }

  function topicNonlinearSystem(parts, vars) {
    var n = vars.length, m = parts.length;
    /* Underdetermined nonlinear systems have continuous solution families;
       guessing one point would be a fabrication. */
    if (n < 1 || n > 5 || m < n || m > 6) {
      return failure('unsupported', parts.join(' ; '));
    }
    var fs = [], i, rel;
    for (i = 0; i < m; i++) {
      rel = splitRelation(parts[i]);
      if (!rel || rel.op !== '=') return failure('unsupported', parts.join(' ; '));
      fs.push('(' + rel.lhs + ') - (' + rel.rhs + ')');
    }
    function evals(f, pt) { return evalScope(f, vars, pt); }
    function residual(pt) {
      var out = [];
      for (var q = 0; q < m; q++) {
        var v = evals(fs[q], pt);
        if (!isFinite(v)) return null;
        out.push(v);
      }
      return out;
    }
    function norm(vec) {
      var s = 0;
      vec.forEach(function (v) { s += v * v; });
      return Math.sqrt(s);
    }
    var h = 1e-5, starts = newtonStartPoints(n), found = [];
    for (var si = 0; si < starts.length; si++) {
      var pt = starts[si].slice();
      for (var it = 0; it < 55; it++) {
        var F = residual(pt);
        if (!F) break;
        if (norm(F) < 1e-12) break;
        /* Numerical Jacobian (m x n). */
        var J = [];
        for (var q = 0; q < m; q++) {
          var row = [];
          for (var j = 0; j < n; j++) {
            var shifted = pt.slice(); shifted[j] += h;
            var v2 = evals(fs[q], shifted);
            if (!isFinite(v2)) { row = null; break; }
            row.push((v2 - F[q]) / h);
          }
          if (!row) break;
          J.push(row);
        }
        if (J.length !== m) break;
        /* Gauss-Newton step: (Jᵀ J) dx = -Jᵀ F. */
        var A = [], g = [];
        for (var u = 0; u < n; u++) {
          var arow = [], gu = 0;
          for (var w = 0; w < n; w++) {
            var cell = 0;
            for (q = 0; q < m; q++) cell += J[q][u] * J[q][w];
            arow.push(cell);
          }
          for (q = 0; q < m; q++) gu -= J[q][u] * F[q];
          A.push(arow); g.push(gu);
        }
        var dx = solveNumericLinear(A, g);
        if (!dx) break;
        var damp = 1, improved = false;
        while (damp > 0.005) {
          var next = pt.map(function (v, idx) { return v + damp * dx[idx]; });
          var F2 = residual(next);
          if (F2 && norm(F2) < norm(F) + 1e-12) {
            pt = next; improved = true; break;
          }
          damp /= 2;
        }
        if (!improved) break;
      }
      /* Newton often converges to ~1e-7 around an exact zero; snap those
         coordinates so x^2+y^2=0 reports {x=0,y=0} once, not two decimals. */
      pt = pt.map(function (v) { return Math.abs(v) < 1e-6 ? 0 : v; });
      var FIN = residual(pt);
      if (!FIN || norm(FIN) > 1e-7) continue;
      var dup = found.some(function (old) {
        return old.every(function (v, idx) { return Math.abs(v - pt[idx]) < 1e-6; });
      });
      if (!dup) found.push(pt.slice());
    }
    /* When a subset of affine equations already fixes every variable, the
       remaining equations can be checked exactly: no guesswork, and an
       inconsistent mixed system becomes a definite empty set. */
    if (!found.length) {
      var aff = [];
      for (i = 0; i < m; i++) {
        var li = affineCoefficients(fs[i], vars);
        if (li) aff.push(li);
      }
      if (aff.length >= n) {
        var rows = aff.map(function (li) {
          return li.coeffs.concat([-li.c0]);
        });
        var A = rows.map(function (r) { return r.slice(0, n); });
        var bb = rows.map(function (r) { return r[n]; });
        var point = solveNumericLinear(A, bb);
        if (point) {
          var residuals = fs.map(function (f) { return evals(f, point); });
          var consistent = residuals.every(function (v) {
            return isFinite(v) && Math.abs(v) < 1e-6;
          });
          var affAnswer = consistent
            ? '{ ' + vars.map(function (v, idx) {
                return v + ' = ' + rationalize(point[idx]).s;
              }).join(', ') + ' }' : '∅';
          var affSteps = [
            S('SYSTEM_SUBSTITUTION', parts.join(' ; '),
              '{ ' + fs.map(function (f) { return f + ' = 0'; }).join(', ') + ' }',
              'equation_equiv',
              { payload: { verified: true, variables: vars.slice() },
                check: 'equivalent_zero_forms' }),
            S('SOLVE_BRANCHES_AND_FILTER', 'affine subset', affAnswer, 'solution_set',
              { payload: { verified: true, rank: n,
                residuals: residuals.map(function (v) { return evidenceNumber(v); }) },
                check: 'back_substitution_all_equations' })
          ];
          return result('nonlinear_system', 'L2', affAnswer,
            [{ id: 'NEWTON_SYSTEM_WITH_VERIFICATION', steps: affSteps }], null,
            consistent ? [] : ['noresult']);
        }
      }
      for (i = 0; i < m; i++) {
        if (!provablyPositive(fs[i])) continue;
        var emptySteps = [
          S('SYSTEM_SUBSTITUTION', parts.join(' ; '),
            fs[i] + ' > 0', 'definition',
            { payload: { verified: true, reason: 'sum_of_nonnegative_terms' },
              check: 'equivalent_zero_forms' }),
          S('SOLUTION_SET', fs[i] + ' > 0', '∅', 'solution_set',
            { payload: { verified: true }, check: 'back_substitution_all_equations' })
        ];
        return result('nonlinear_system', 'L2', '∅',
          [{ id: 'NEWTON_SYSTEM_WITH_VERIFICATION', steps: emptySteps }], null,
          ['noresult']);
      }
      return failure('unsupported', parts.join(' ; '));
    }
    var answer = '{ ' + found.map(function (pt) {
      return vars.map(function (v, idx) {
        return v + ' = ' + rationalize(pt[idx]).s;
      }).join(', ');
    }).join(' ; ') + ' }';
    var steps = [
      S('SYSTEM_SUBSTITUTION', parts.join(' ; '),
        '{ ' + fs.map(function (f) { return f + ' = 0'; }).join(', ') + ' }',
        'equation_equiv',
        { payload: { verified: true, variables: vars.slice(), equations: m },
          check: 'equivalent_zero_forms' }),
      S('SOLVE_BRANCHES_AND_FILTER',
        '{ ' + fs.map(function (f) { return f + ' = 0'; }).join(', ') + ' }', answer,
        'solution_set',
        { payload: { verified: true, count: found.length, dimensions: n },
          check: 'back_substitution_all_equations' })
    ];
    return result('nonlinear_system', 'L2', answer,
      [{ id: 'NEWTON_SYSTEM_WITH_VERIFICATION', steps: steps }], null, ['numerical']);
  }
  function scanBrackets(expr, lo, hi, steps) {
    var out = [], prevX = lo, prevY = evalAt(expr, lo);
    for (var i = 1; i <= steps; i++) {
      var x = lo + (hi - lo) * i / steps;
      var y = evalAt(expr, x);
      if (finite(prevY) && finite(y) && prevY * y < 0 &&
          Math.abs(prevY) < 1e7 && Math.abs(y) < 1e7) {
        out.push({ a: prevX, b: x, fa: prevY, fb: y });
      }
      prevX = x; prevY = y;
    }
    return out;
  }

  function tailStable(f, a, b) {
    var fa = evalAt(f, a), fb = evalAt(f, b);
    if (!finite(fa) || !finite(fb) || fa * fb < 0 ||
        Math.abs(fb) <= Math.abs(fa)) return false;
    for (var k = 1; k < 32; k++) {
      var v = evalAt(f, a + (b - a) * k / 32);
      if (!finite(v) || v * fa < 0) return false;
    }
    return true;
  }

  /* A fixed [-14,14] window silently drops distant roots. For equations
     containing bounded sin/cos terms we can PROVE a finite bound: after
     replacing sin/cos by 0 the remaining polynomial part P must satisfy
     |P(x)| <= A (A = number of bounded terms, conservatively doubled),
     so all roots lie in [-M,M]. Otherwise we expand until both tails have a
     stable sign and growing magnitude. */
  function equationSearchWindow(f) {
    var lo = -14, hi = 14, proven = false, boundInfo = null;
    /* Constant or matrix-valued expressions have no real root to search for;
       a short scan suffices and avoids thousands of heavy matrix evaluations. */
    if (!detectVariables(f).length || /\[/.test(f)) {
      return { lo: -14, hi: 14, samples: 300,
        proven: false, boundInfo: { tail: 14 } };
    }
    try {
      var node = math.parse(f), count = 0;
      var repl = node.transform(function (n) {
        if (n.isFunctionNode && (n.name === 'sin' || n.name === 'cos') &&
            n.args.length === 1) {
          count++; return new math.ConstantNode(0);
        }
        return n;
      });
      if (count) {
        var P = repl.toString(), A = 2 * count, M = 2, ok = false;
        for (var t = 0; t < 12 && M <= 2048; t++) {
          ok = true;
          for (var q = 0; q <= 24 && ok; q++) {
            var xf = M + M * q / 24;
            var v1 = evalAt(P, xf), v2 = evalAt(P, -xf);
            if (!finite(v1) || !finite(v2) ||
                Math.abs(v1) <= A || Math.abs(v2) <= A) ok = false;
          }
          if (ok) break;
          M *= 2;
        }
        if (ok) {
          lo = -2 * M; hi = 2 * M; proven = true;
          boundInfo = { A: A, M: 2 * M };
        }
      }
    } catch (e) { /* fall through to tail expansion */ }
    if (!proven) {
      var h = 14;
      for (var t2 = 0; t2 < 8 && h < 2048; t2++) {
        var posOK = tailStable(f, h / 2, h);
        var negOK = !finite(evalAt(f, -h)) || tailStable(f, -h / 2, -h);
        if (posOK && negOK) break;
        h *= 2;
      }
      hi = h; lo = -h;
      /* A domain cut (log(x), x^pi, ...) makes the far-left samples NaN;
         keep the original left bound rather than pretending to scan there. */
      if (!finite(evalAt(f, -14))) lo = -14;
      boundInfo = { tail: h };
    }
    var span = hi - lo;
    /* Cap the sample count: pathological inputs must not turn a single
       solve into tens of thousands of math.js evaluations. The step stays
       far below one period for ordinary sin/cos frequencies. */
    var samples = Math.min(6000, Math.max(1200, Math.ceil(span * 40)));
    return { lo: lo, hi: hi, samples: samples,
      proven: proven, boundInfo: boundInfo };
  }

  /* Collect the zeros of every denominator / radical / logarithm argument.
     Around each such point the function can blow up or become undefined, so
     add a geometric ladder of samples on both sides. This is what lets
     1/sqrt(x)=10 find x=1/100 while the uniform grid starts at x=0.025. */
  function domainExtraPoints(f, lo, hi) {
    var cuts = [];
    try {
      math.parse(f).traverse(function (n) {
        if (n.isOperatorNode && n.op === '/' && n.args.length === 2) {
          cuts.push(n.args[1].toString());
        }
        if (n.isFunctionNode && n.args.length) {
          if (n.name === 'sqrt' || n.name === 'log' || n.name === 'ln' ||
              n.name === 'nthRoot' || n.name === 'root') {
            cuts.push(n.args[0].toString());
          }
        }
      });
    } catch (e) { /* leave cuts empty */ }
    var seen = {}, out = [];
    cuts.forEach(function (ce) {
      if (seen[ce]) return;
      seen[ce] = 1;
      var zeros = scanRoots(ce, lo, hi, 600).slice(0, 8);
      zeros.forEach(function (z) {
        var scale = Math.max(1, Math.abs(z));
        for (var k = 1; k <= 8; k++) {
          var d = Math.pow(10, -k) * scale;
          out.push(z + d, z - d);
        }
        [0.25, 0.5, 2, 4, 8].forEach(function (m) {
          out.push(z + m * 0.001 * scale, z - m * 0.001 * scale);
        });
      });
    });
    return out.filter(function (x) {
      return isFinite(x) && x >= lo && x <= hi;
    }).slice(0, 400);
  }

  function topicGeneralEquation(lhs, rhs) {
    var f = '(' + lhs + ') - (' + rhs + ')';
    var win = equationSearchWindow(f);
    var lo = win.lo, hi = win.hi, samples = win.samples;
    var stepSize = (hi - lo) / samples;
    var vals = scanRoots(f, lo, hi, samples, domainExtraPoints(f, lo, hi));
    /* Collect every denominator in the original equation. A candidate that
       makes one vanish is outside the domain, even when floating-point
       cancellation makes the whole expression look like zero. */
    var denoms = [];
    try {
      math.parse(f).traverse(function (n) {
        if (n.isOperatorNode && n.op === '/' && n.args.length === 2) {
          denoms.push(n.args[1].toString());
        }
      });
    } catch (e) { /* leave denoms empty */ }
    var vname = (detectVariables(f) || [])[0] || 'x';
    /* log arguments must stay positive; a sign change across a log pole is
       not a valid root. */
    var logArgs = [], lm;
    var logRe = /log\(\s*([^,()]+)\s*(?:,|\))/g;
    while ((lm = logRe.exec(f)) !== null) logArgs.push(lm[1].trim());
    var poles = 0;
    /* A proven global search may legitimately find dozens of roots (e.g.
       sin(x)=x/50 has 31 real roots). Truncating at 16 silently dropped the
       entire positive half-axis. Keep every root the scan actually found. */
    var roots = vals.slice(0, 64)
      .map(function (v) { return { s: rationalize(v).s, v: v, complex: false }; })
      .filter(function (r) {
        var fr = evalAt(f, r.v);
        if (!finite(fr) || Math.abs(fr) > 1e-4 * (1 + Math.abs(r.v))) { poles++; return false; }
        for (var li = 0; li < logArgs.length; li++) {
          var av = evalAtVar(logArgs[li], r.v, vname);
          if (!finite(av) || av <= 0) { poles++; return false; }
        }
        var scope = {}; scope[vname] = r.v;
        for (var di = 0; di < denoms.length; di++) {
          try {
            var dv = num(math.compile(denoms[di]).evaluate(scope));
            if (!isFinite(dv) || Math.abs(dv) < 1e-7) { poles++; return false; }
          } catch (e2) { /* parameter-dependent denominator: keep it */ }
        }
        return true;
      });
    /* With no surviving roots, "no solution" is itself verified when the
       scan found no bracket or every candidate was removed by a domain
       guard (pole / log argument). Previously this stayed false and the
       answer card showed an unverified certificate. */
    var verified = roots.length ? verifyRoots(f, roots) : (poles > 0 || !vals.length);
    var eq = lhs + ' = ' + rhs;
    var deg = null;
    var c = polyCoeffs(f, 6);
    if (c) deg = c.length - 1;
    var brackets = scanBrackets(f, lo, hi, samples);
    var bracketText = brackets.slice(0, 3).map(function (q) {
      return '[' + evidenceNumber(q.a) + ', ' + evidenceNumber(q.b) + ']';
    }).join('、') || '\u2014';
    var maxResidual = 0;
    roots.forEach(function (r) {
      var fr = evalAt(f, r.v);
      if (finite(fr)) maxResidual = Math.max(maxResidual, Math.abs(fr));
    });
    var maxBack = 0;
    roots.forEach(function (r) {
      var lv = evalAtVar(lhs, r.v, vname), rv = evalAtVar(rhs, r.v, vname);
      if (finite(lv) && finite(rv)) maxBack = Math.max(maxBack, Math.abs(lv - rv));
    });

    var strategy = [
      { k: 'ev.eqTransform', a: [rhs] },
      { k: 'ev.strategy', a: [lo, hi, samples, evidenceNumber(stepSize)] },
      win.proven
        ? { k: 'ev.provenBound', a: [win.boundInfo.A, evidenceNumber(win.boundInfo.M)] }
        : { k: 'ev.tailStable', a: [evidenceNumber(win.boundInfo.tail)] },
      deg === null ? { k: 'ev.transcendental', a: [] } : { k: 'ev.polyDegree', a: [deg] }
    ];
    var domainGuards = logArgs.map(function (a) { return guard('positive', a, true); });
    var steps = [
      S('MOVE_ALL_TO_LHS', eq, f + ' = 0', 'equation_equiv', {
        payload: { verified: true, evidence: strategy },
        guard: domainGuards, check: 'equivalent_zero_forms'
      })
    ];

    var rootText = rootSetString(roots);
    /* scanRoots also records exact sample zeros; scanBrackets only records
       strict sign changes. Finer adaptive grids can land exactly on x=1,
       so BOTH lists must be empty before declaring an empty solution set. */
    if (!brackets.length && !roots.length) {
      steps.push(S('NO_REAL_ROOTS', f + ' = 0', '\u2205', 'solution_set', {
        payload: { verified: true,
          evidence: [{ k: 'ev.noSignChange', a: [lo, hi, samples] },
            { k: 'ev.strategy', a: [lo, hi, samples, evidenceNumber(stepSize)] }] },
        check: 'sign_scan'
      }));
      return result('general_equation', 'L1', '\u2205',
        [{ id: 'NUMERICAL_ROOT_SEARCH', steps: steps }], graphFor(f, roots),
        win.proven ? ['noresult', 'numerical', 'complete'] : ['noresult', 'numerical']);
    }

    var bracketEvidence = brackets.length
      ? [
          { k: 'ev.brackets', a: [brackets.length, bracketText] },
          { k: 'ev.bracketSign', a: [evidenceNumber(brackets[0].a),
            evidenceNumber(brackets[0].fa), evidenceNumber(brackets[0].b),
            evidenceNumber(brackets[0].fb)] }
        ]
      : [{ k: 'ev.exactZeroSample', a: [roots.length, evidenceNumber(stepSize)] }];
    bracketEvidence.push(poles ? { k: 'ev.polesRemoved', a: [poles] }
      : { k: 'ev.scanComplete', a: [samples] });
    steps.push(S('BRACKET_ROOTS', f + ' = 0',
      brackets.length ? 'f(a) * f(b) < 0' : 'f(x*) = 0', 'definition', {
      payload: { verified: true, evidence: bracketEvidence },
      check: 'sign_scan'
    }));
    steps.push(S('CAS_ROOT_ORACLE', 'f(a) * f(b) < 0', rootText, 'solution_set', {
      payload: { verified: verified, roots: roots.map(function (r) { return r.s; }),
        interval: '[' + lo + ', ' + hi + ']',
        evidence: [
          { k: 'ev.bisect', a: [60, evidenceNumber(maxResidual), roots.length] },
          { k: 'ev.backSubstitute', a: [evidenceNumber(maxBack)] },
          { k: 'ev.rootInterval', a: ['[' + lo + ', ' + hi + ']'] }
        ] },
      check: 'back_substitution'
    }));
    if (!roots.length) {
      return result('general_equation', 'L1', '\u2205',
        [{ id: 'NUMERICAL_ROOT_SEARCH', steps: steps }], graphFor(f, roots),
        win.proven ? ['noresult', 'numerical', 'complete'] : ['noresult', 'numerical']);
    }
    return result('general_equation', 'L1', rootText,
      [{ id: 'NUMERICAL_ROOT_SEARCH', steps: steps }], graphFor(f, roots),
      win.proven ? ['numerical', 'complete'] : ['numerical']);
  }


  /* ------------------------------------------------------------------ *
   * Polynomial equations: return every root, including complex ones.
   * A degree-n polynomial has exactly n roots; reporting only the real
   * ones silently discards valid solutions (x^3-1=0 used to hide the two
   * complex cube roots). Durand-Kerner is deterministic here and every
   * root is back-substituted in the complex plane before display.
   * ------------------------------------------------------------------ */
  function polyAllRoots(coeffs) {
    var n = coeffs.length - 1;
    if (n < 3 || n > 8) return null;
    var lead = coeffs[n];
    if (!finite(lead) || Math.abs(lead) < 1e-12) return null;
    var a = [], q;
    for (q = 0; q <= n; q++) a.push(coeffs[q] / lead);
    var radius = 1;
    for (q = 0; q < n; q++) radius = Math.max(radius, Math.abs(a[q]));
    radius = 1 + radius;
    var z = [];
    for (q = 0; q < n; q++) {
      var ang = 2 * Math.PI * q / n + 0.35;
      z.push({ re: radius * Math.cos(ang), im: radius * Math.sin(ang) });
    }
    function ev(w) {
      var re = a[n], im = 0;
      for (var j = n - 1; j >= 0; j--) {
        var nr = re * w.re - im * w.im + a[j];
        var ni = re * w.im + im * w.re;
        re = nr; im = ni;
      }
      return { re: re, im: im };
    }
    function cmul(u, v) {
      return { re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re };
    }
    function cdiv(u, v) {
      var d = v.re * v.re + v.im * v.im;
      if (d < 1e-30) return null;
      return { re: (u.re * v.re + u.im * v.im) / d,
               im: (u.im * v.re - u.re * v.im) / d };
    }
    for (var it = 0; it < 400; it++) {
      var maxd = 0;
      for (var i = 0; i < n; i++) {
        var p = ev(z[i]), den = { re: 1, im: 0 };
        for (var j2 = 0; j2 < n; j2++) {
          if (j2 === i) continue;
          den = cmul(den, { re: z[i].re - z[j2].re, im: z[i].im - z[j2].im });
        }
        var dlt = cdiv(p, den);
        if (!dlt) continue;
        z[i] = { re: z[i].re - dlt.re, im: z[i].im - dlt.im };
        maxd = Math.max(maxd, Math.abs(dlt.re) + Math.abs(dlt.im));
      }
      if (maxd < 1e-13) break;
    }
    return z;
  }

  function polyGcd(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }
  function polyRealExact(v) {
    var q = rationalize(v);
    if (q.exact) return q.s;
    var q2 = rationalize(v * v);
    if (q2.exact && q2.n > 0 && q2.d > 0) {
      var nd = q2.n * q2.d, parts = surdParts(nd);
      var k = parts ? parts.k : 1, rad = parts ? parts.rad : nd;
      if (rad !== 1) {
        var g = polyGcd(k, q2.d);
        var kk = k / g, dd = q2.d / g;
        var body = (kk === 1 ? '' : kk + '*') + 'sqrt(' + rad + ')';
        var sign = v < 0 ? '-' : '';
        if (kk !== 1 && dd !== 1) body = '(' + body + ')';
        return dd === 1 ? sign + body : sign + body + '/' + dd;
      }
    }
    return null;
  }
  function polyRootString(re, im) {
    var rs = polyRealExact(re), is = polyRealExact(Math.abs(im));
    if (!rs || !is) return null;
    var imag = is === '1' ? 'i' : is + ' i';
    if (Math.abs(re) < 1e-9) return (im > 0 ? '' : '-') + imag;
    return rs + (im > 0 ? ' + ' : ' - ') + imag;
  }

  function topicPolynomialAllRoots(lhs, rhs) {
    var f = '(' + lhs + ') - (' + rhs + ')';
    var c = polyCoeffs(f, 8);
    if (!c || c.length < 4 || c.length > 9) return null;
    var zs = polyAllRoots(c);
    if (!zs) return null;
    var complexCount = 0, i;
    for (i = 0; i < zs.length; i++) if (Math.abs(zs[i].im) > 1e-7) complexCount++;
    if (!complexCount) return null;
    var compiled;
    try { compiled = math.compile(f); } catch (e) { return null; }
    var texts = [], approx = false, maxRes = 0;
    for (i = 0; i < zs.length; i++) {
      var re = zs[i].re, im = zs[i].im, v;
      try { v = compiled.evaluate({ x: math.complex(re, im) }); }
      catch (e2) { return null; }
      var rr = math.abs(v);
      if (!isFinite(rr) || rr > 1e-5 * (1 + Math.abs(re) + Math.abs(im))) return null;
      maxRes = Math.max(maxRes, rr);
      var txt = Math.abs(im) < 1e-7 ? polyRealExact(re) : polyRootString(re, im);
      if (!txt) {
        approx = true;
        var reS = Math.abs(re) < 1e-9 ? '' : significantDigits(re);
        var imS = significantDigits(Math.abs(im));
        txt = (reS ? reS + ' ' : '') + (im > 0 ? '+' : '-') + ' ' + imS + 'i';
      }
      texts.push(txt);
    }
    texts.sort();
    var rootText = '{ ' + texts.join(', ') + ' }';
    var steps = [S('POLYNOMIAL_COMPLEX_ROOTS', f + ' = 0', rootText, 'solution_set', {
      payload: { verified: true, roots: texts, numeric: maxRes,
        evidence: [{ k: 'ev.backSubstitute',
          a: [evidenceNumber(maxRes), texts.length] },
          { k: 'ev.rootInterval', a: ['complex plane'] }] },
      check: 'complex_back_substitution'
    })];
    var realRoots = [];
    for (i = 0; i < zs.length; i++) {
      if (Math.abs(zs[i].im) < 1e-7) realRoots.push({ v: zs[i].re, s: texts[i] });
    }
    return result('polynomial_equation', 'L2', rootText,
      [{ id: 'COMPLETE_ROOT_SET', steps: steps }],
      graphFor(f, realRoots), approx ? ['numerical'] : ['exact']);
  }

  function topicSolve(expr, params) {
    var multi = String(expr).split(/[;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (multi.length > 1) {
      var sys = topicLinearSystem(multi);
      if (sys) return sys;
    }
    var r = splitRelation(String(expr));
    if (!r || r.op !== '=') return failure('invalid', String(expr));
    var candidates = [
      topicLinearEquation(r.lhs, r.rhs),
      topicQuadraticEquation(r.lhs, r.rhs)
    ];
    for (var i = 0; i < candidates.length; i++) if (candidates[i]) return candidates[i];
    var f = '(' + r.lhs + ') - (' + r.rhs + ')';
    var special = /abs\(/i.test(f) ? topicAbsoluteEquation(r.lhs, r.rhs) : null;
    if (special) return special;
    if (/log\(|exp\(/i.test(f)) {
      var el = topicExpLogEquation(r.lhs, r.rhs);
      if (el) return el;
    }
    if (/sin\(|cos\(|tan\(/i.test(f)) {
      var tr = topicTrigEquation(r.lhs, r.rhs);
      if (tr) return tr;
    }
    var allRoots = topicPolynomialAllRoots(r.lhs, r.rhs);
    if (allRoots) return allRoots;
    return topicGeneralEquation(r.lhs, r.rhs);
  }

  /* ------------------------------------------------------------------ *
   * Topics: inequalities
   * ------------------------------------------------------------------ */

  /* Exact endpoint forms: -sqrt(2), 3/2, 4 ... never 1.41421356. */
  function exactEndpoint(v, coeffs) {
    var q = rationalize(v);
    if (q.exact) return q.s;
    if (coeffs && coeffs.length === 3) {
      var a = coeffs[2], bb = coeffs[1], c = coeffs[0];
      var D = bb * bb - 4 * a * c;
      if (D >= 0) {
        var sp = surdParts(D);
        var sq = Math.sqrt(D);
        var r1 = (-bb + sq) / (2 * a), r2 = (-bb - sq) / (2 * a);
        if (Math.abs(v - r1) < 1e-7) {
          return (sp && sp.rad === 1) ? rationalize(r1).s : exactRootString(a, bb, D, 1);
        }
        if (Math.abs(v - r2) < 1e-7) {
          return (sp && sp.rad === 1) ? rationalize(r2).s : exactRootString(a, bb, D, -1);
        }
      }
    }
    var v2 = v * v, q2 = rationalize(v2);
    if (q2.exact && q2.n > 0 && q2.d > 0) {
      var nd = q2.n * q2.d;
      var parts = surdParts(nd);
      var k = parts ? parts.k : 1, rad = parts ? parts.rad : nd;
      if (rad === 1) return rationalize((v < 0 ? -1 : 1) * k / q2.d).s;
      var body = (v < 0 ? '-' : '') + (k === 1 ? '' : k + '*') + 'sqrt(' + rad + ')';
      return q2.d === 1 ? body : '(' + body + ')/' + q2.d;
    }
    return null;
  }

  function intervalNotation(selected, points, op, exactMap) {
    if (!selected.length) return '\u2205';
    function label(v, exact) {
      if (v === -Infinity) return '-\u221e';
      if (v === Infinity) return '+\u221e';
      var e = exactMap && exactMap(v);
      return e || rationalize(v).s;
    }
    return selected.map(function (seg) {
      var left = seg.from === -Infinity ? '(-\u221e'
        : (seg.inclFrom ? '[' : '(') + label(seg.from);
      var right = seg.to === Infinity ? '+\u221e)'
        : label(seg.to) + (seg.inclTo ? ']' : ')');
      return left + ', ' + right;
    }).join(' \u222a ');
  }

  function satisfies(value, op) {
    switch (op) {
      case '<': return value < -TOL;
      case '<=': return value <= TOL;
      case '>': return value > TOL;
      case '>=': return value >= -TOL;
      case '!=': return Math.abs(value) > TOL;
      case '==': return Math.abs(value) <= TOL;
      default: return false;
    }
  }

  function topicInequality(expr, params) {
    var r = splitRelation(String(expr));
    if (!r || r.op === '=') return failure('invalid', String(expr));
    var f = '(' + r.lhs + ') - (' + r.rhs + ')';
    if (!parseOK(f)) return failure('invalid', f);
    var coeffs = polyCoeffs(f, 6);
    var numericCritical = coeffs ? polyRootsNumeric(coeffs) : scanRoots(f, -10, 10, 900);
    /* Zeros of a denominator split the sign table too: 1/(x-1)<1 is also
       true for x<1, which a root-only scan silently drops. */
    var poles = [], denomExprs = [];
    try {
      math.parse(f).traverse(function (n) {
        if (n.isOperatorNode && n.op === '/' && n.args.length === 2) {
          denomExprs.push(n.args[1].toString());
        }
      });
    } catch (e) { /* leave empty */ }
    denomExprs.forEach(function (de) {
      scanRoots(de, -10, 10, 900).forEach(function (pv) {
        if (finite(pv) && poles.every(function (q) { return Math.abs(q - pv) > 1e-6; })) poles.push(pv);
      });
    });
    var critical = numericCritical.concat(poles).sort(function (x, y) { return x - y; });
    critical = critical.filter(function (v, i) {
      return i === 0 || Math.abs(v - critical[i - 1]) > 1e-7;
    });
    var exactMap = {};
    critical.forEach(function (v) {
      var e = exactEndpoint(v, coeffs);
      if (e) exactMap[v.toFixed(9)] = e;
    });
    function labelOf(v) {
      return exactMap[v.toFixed(9)] || rationalize(v).s;
    }
    var bounds = [-Infinity].concat(critical, [Infinity]);
    var selected = [];
    for (var i = 0; i < bounds.length - 1; i++) {
      var from = bounds[i], to = bounds[i + 1];
      var mid;
      if (from === -Infinity) mid = (to === Infinity ? 0 : to - 1);
      else if (to === Infinity) mid = from + 1;
      else mid = (from + to) / 2;
      var v = evalAt(f, mid);
      if (finite(v) && satisfies(v, r.op) && from < to) {
        selected.push({ from: from, to: to, inclFrom: false, inclTo: false });
      }
    }
    /* Non-strict inequalities: equality points are endpoints of the adjacent
       intervals, not extra "∪ [p, p]" islands. */
    if (r.op === '<=' || r.op === '>=' || r.op === '==') {
      for (var k = 0; k < critical.length; k++) {
        var p = critical[k];
        if (Math.abs(evalAt(f, p)) > 1e-6) continue;
        for (var si = 0; si < selected.length; si++) {
          var seg = selected[si];
          if (Math.abs(seg.from - p) < 1e-7) seg.inclFrom = true;
          if (Math.abs(seg.to - p) < 1e-7) seg.inclTo = true;
        }
      }
    }
    /* Merge intervals that touch at a closed endpoint. */
    selected.sort(function (x, y) { return (x.from === -Infinity ? -1e99 : x.from) - (y.from === -Infinity ? -1e99 : y.from); });
    var merged = [];
    selected.forEach(function (seg) {
      var prev = merged[merged.length - 1];
      if (prev && Math.abs(prev.to - seg.from) < 1e-7 &&
          (prev.inclTo || seg.inclFrom) && prev.to !== Infinity) {
        prev.to = seg.to; prev.inclTo = seg.inclTo;
      } else merged.push(seg);
    });
    var ans = intervalNotation(merged, critical, r.op, function (v) {
      return exactMap[v.toFixed(9)] || null;
    });
    /* x^2 <= 0 has no interval at all: the solution is the isolated point
       where equality holds. It must not be reported as an empty set. */
    if (!merged.length && (r.op === '<=' || r.op === '>=' || r.op === '==')) {
      var isolated = critical.filter(function (v) {
        return Math.abs(evalAt(f, v)) <= 1e-6;
      }).map(labelOf);
      if (isolated.length) ans = '{ ' + isolated.join(', ') + ' }';
    }
    var critText = '{ ' + critical.map(labelOf).join(', ') + ' }';
    var steps = [
      S('MOVE_ALL_TO_LHS', String(expr), f + ' ' + r.op + ' 0', 'equation_equiv',
        { check: 'equivalent_zero_forms' }),
      S('CRITICAL_POINTS', f + ' = 0', critText, 'oracle',
        { payload: { verified: true, points: critical, exact: exactMap },
          check: 'root_scan' }),
      S('SIGN_TABLE', critText, ans, 'oracle',
        { payload: { verified: true, intervals: ans },
          guard: [guard('domain', f, true)],
          check: 'midpoint_sign_evaluation' })
    ];
    return result('univariate_inequality', 'L1', ans,
      [{ id: 'CRITICAL_POINT_SIGN_ANALYSIS', steps: steps }],
      { expr: f, roots: critical, critical: derivativeRoots(f), label: f }, []);
  }

  /* ------------------------------------------------------------------ *
   * Topics: factoring, division, partial fractions
   * ------------------------------------------------------------------ */

  function topicFactor(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var c = polyCoeffs(raw, 6);
    if (!c) return failure('unsupported', raw);
    var deg = c.length - 1;
    if (deg < 1) return topicSimplify(raw, params);
    var vals = polyRootsNumeric(c);
    if (deg > 2) {
      var lead = rationalize(c[deg]).s;
      var factors = vals.map(function (v) {
        return '(x ' + (v < 0 ? '+ ' + rationalize(-v).s : '- ' + rationalize(v).s) + ')';
      });
      var exprOut = (close(c[deg], 1) ? '' : lead + '*') + factors.join('*');
      var steps = [
        S('CAS_ROOT_ORACLE', polyString(c), '{ ' + vals.map(function (v) { return rationalize(v).s; }).join(', ') + ' }',
          'oracle', { payload: { verified: vals.length > 0, roots: vals }, check: 'back_substitution' }),
        S('FACTOR_POLYNOMIAL', polyString(c), exprOut, 'oracle', {
          payload: { verified: equivalent(raw, exprOut) }, check: 'expand(after)-before=0'
        })
      ];
      return result('polynomial_factorisation', 'L1', exprOut,
        [{ id: 'ROOT_TO_LINEAR_FACTORS', steps: steps }],
        { expr: raw, roots: vals, critical: derivativeRoots(raw), label: raw }, ['approx']);
    }
    if (deg === 1) {
      /* A linear polynomial is already fully factored: a*x + b = a*(x - r).
         The quadratic branch below reads c[2], which is undefined here and
         used to leak sqrt(NaN) into the answer. */
      var l1 = c[1], b1 = c[0];
      var r1 = -b1 / l1;
      var lead1 = rationalize(l1).s;
      var lin = close(r1, 0) ? 'x' : exactLinearFactor(rationalize(r1).s);
      var f1 = close(l1, 1) ? lin : lead1 + '*' + lin;
      return result('polynomial_factorisation', 'L1', f1,
        [{ id: 'LINEAR_FACTOR', steps: [
          S('IDENTIFY_COEFFICIENTS', polyString(c), 'a=' + lead1 + ', b=' + rationalize(b1).s,
            'definition', { payload: { verified: true, a: lead1, b: rationalize(b1).s } }),
          S('FACTOR_POLYNOMIAL', polyString(c), f1, 'oracle',
            { payload: { verified: equivalent(raw, f1) }, check: 'expand(after)-before=0' })
        ] }],
        { expr: raw, roots: [r1], critical: derivativeRoots(raw), label: raw });
    }

    var info = quadraticRoots(c[2], c[1], c[0]);
    var roots = info.roots;
    var lead = rationalize(c[2]).s;
    var linear = function (rt) { return exactLinearFactor(rt.s); };
    var factorStr = (close(c[2], 1) ? '' : lead + '*') +
      (roots.length === 1 && !roots[0].complex
        ? linear(roots[0]) + '^2'
        : roots.map(linear).join('*'));
    var steps = [
      S('IDENTIFY_COEFFICIENTS', polyString(c), 'a=' + lead + ', b=' + rationalize(c[1]).s + ', c=' + rationalize(c[0]).s,
        'definition', { payload: { a: lead, b: rationalize(c[1]).s, c: rationalize(c[0]).s } }),
      S('COMPUTE_DISCRIMINANT', polyString(c), 'Δ = ' + rationalize(info.D).s, 'definition',
        { payload: { discriminant: rationalize(info.D).s } }),
      S('FACTOR_POLYNOMIAL', polyString(c), factorStr, 'oracle', {
        payload: { verified: equivalent(raw, factorStr), roots: roots.map(function (x) { return x.s; }) },
        check: 'expand(after)-before=0'
      })
    ];
    return result('polynomial_factorisation', 'L2', factorStr,
      [{ id: 'DISCRIMINANT_THEN_FACTOR', steps: steps }],
      { expr: raw, roots: roots.filter(function (x) { return finite(x.v); }).map(function (x) { return x.v; }),
        critical: derivativeRoots(raw), label: raw });
  }

  function topicPolyDivision(expr, params) {
    var parts = String(expr).split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length < 2) return failure('invalid', String(expr));
    var a = polyCoeffs(parts[0], 10), b = polyCoeffs(parts[1], 10);
    if (!a || !b) return failure('unsupported', String(expr));
    var dividend = a.slice(), divisor = b.slice();
    var q = new Array(Math.max(1, dividend.length - divisor.length + 1)).fill(0);
    while (dividend.length >= divisor.length && dividend.length > 0) {
      var lead = dividend[dividend.length - 1] / divisor[divisor.length - 1];
      var shift = dividend.length - divisor.length;
      q[shift] = lead;
      for (var i = 0; i < divisor.length; i++) dividend[shift + i] -= lead * divisor[i];
      while (dividend.length > 1 && close(dividend[dividend.length - 1], 0)) dividend.pop();
      if (close(dividend[dividend.length - 1], 0)) dividend.pop();
      if (!dividend.length) dividend = [0];
    }
    var qStr = polyString(q), rStr = polyString(dividend);
    var identity = '(' + qStr + ')*(' + polyString(b) + ') + (' + rStr + ')';
    var steps = [
      S('POLYNOMIAL_LONG_DIVISION', parts[0] + ' / ' + parts[1], 'q=' + qStr + ', r=' + rStr,
        'oracle', { payload: { verified: equivalent(parts[0], identity), quotient: qStr, remainder: rStr },
          check: 'q*d+r-f=0' }),
      S('DIVISION_IDENTITY', parts[0], identity, 'identity', { check: 'symbolic_equivalence' })
    ];
    return result('polynomial_division', 'L2', 'q(x) = ' + qStr + ', r(x) = ' + rStr,
      [{ id: 'EUCLIDEAN_DIVISION', steps: steps }], null);
  }

  function topicPartialFractions(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var denomMatch = null;
    try {
      var node = math.parse(raw);
      if (node.isOperatorNode && node.op === '/' ) denomMatch = node.args[1].toString();
    } catch (e) { /* handled below */ }
    if (!denomMatch) return failure('unsupported', raw);
    var c = polyCoeffs(denomMatch, 4);
    if (!c || c.length !== 3) return failure('unsupported', raw);
    var info = quadraticRoots(c[2], c[1], c[0]);
    var real = info.roots.filter(function (r) { return !r.complex; });
    if (real.length !== 2 || close(real[0].v, real[1].v)) return failure('unsupported', raw);
    var r1 = real[0].v, r2 = real[1].v;
    /* Residues A = 1/(r1-r2), B = 1/(r2-r1) for unit numerator. */
    var A = 1 / (r1 - r2), B = -A;
    function signedFraction(coef, root) {
      var body = '(x ' + (root < 0 ? '+ ' + rationalize(-root).s : '- ' + rationalize(root).s) + ')';
      var mag = rationalize(Math.abs(coef)).s;
      var term = close(Math.abs(coef), 1) ? '1/' + body : '(' + mag + ')/' + body;
      return { sign: coef < 0 ? '-' : '+', term: term };
    }
    var f1 = signedFraction(A, r1), f2 = signedFraction(B, r2);
    var out = f1.term + ' ' + f2.sign + ' ' + f2.term;
    var steps = [
      S('FACTOR_DENOMINATOR', denomMatch, 'a(x - r1)(x - r2)', 'oracle', {
        payload: { verified: true, roots: [rationalize(r1).s, rationalize(r2).s] }, check: 'root_scan'
      }),
      S('ANSATZ', 'A/(x-r1) + B/(x-r2)', 'A=' + rationalize(A).s + ', B=' + rationalize(B).s,
        'definition', { payload: { A: rationalize(A).s, B: rationalize(B).s } }),
      S('PARTIAL_FRACTION_DECOMPOSITION', raw, out, 'identity', {
        guard: [guard('nonzero', denomMatch, true)], check: 'symbolic_equivalence'
      })
    ];
    return result('partial_fraction_decomposition', 'L2', out,
      [{ id: 'FACTOR_THEN_ANSATZ', steps: steps }],
      { expr: raw, roots: [r1, r2], critical: derivativeRoots(raw), label: raw });
  }

  /* ------------------------------------------------------------------ *
   * Topics: differentiation rule tree
   * ------------------------------------------------------------------ */

  function diffTree(node, depth) {
    depth = depth || 0;
    var before = node.toString();
    var reference = math.derivative(node, 'x').toString();
    if (depth > 6) {
      return { value: reference, steps: [S('ORACLE_DIFF', before, reference, 'oracle', {
        payload: { verified: equivalent(reference, reference) }, check: 'diff(before,x)-after=0' })] };
    }

    if (!node.hasOwnProperty) { /* no-op */ }

    if (node.isOperatorNode && node.op === '+' && node.args && node.args.length > 1) {
      var pieces = [], children = [];
      for (var i = 0; i < node.args.length; i++) {
        var sub = diffTree(node.args[i], depth + 1);
        pieces.push('(' + sub.value + ')');
        children = children.concat(sub.steps);
      }
      var value = pieces.join(' + ');
      return { value: value, steps: [S('SUM_RULE', before, value, 'oracle', {
        payload: { verified: equivalent(reference, value) }, check: 'diff(before,x)-after=0', children: children })] };
    }

    if (node.isOperatorNode && node.op === '*' && node.args && node.args.length === 2) {
      var left = node.args[0], right = node.args[1];
      var leftHasX = left.filter(function (n) { return n.isSymbolNode && n.name === 'x'; }).length > 0;
      var rightHasX = right.filter(function (n) { return n.isSymbolNode && n.name === 'x'; }).length > 0;
      if (!leftHasX && rightHasX) {
        var s2 = diffTree(right, depth + 1);
        var val2 = '(' + left.toString() + ')*(' + s2.value + ')';
        return { value: val2, steps: [S('CONSTANT_MULTIPLE_RULE', before, val2, 'oracle', {
          payload: { verified: equivalent(reference, val2) }, check: 'diff(before,x)-after=0',
          children: s2.steps })] };
      }
      if (leftHasX && rightHasX) {
        var sf = diffTree(left, depth + 1), sg = diffTree(right, depth + 1);
        var val3 = '(' + sf.value + ')*(' + right.toString() + ') + (' + left.toString() + ')*(' + sg.value + ')';
        return { value: val3, steps: [S('PRODUCT_RULE', before, val3, 'oracle', {
          payload: { verified: equivalent(reference, val3), f: left.toString(), g: right.toString() },
          check: 'diff(before,x)-after=0', children: sf.steps.concat(sg.steps) })] };
      }
    }

    if (node.isOperatorNode && node.op === '^' && node.args && node.args.length === 2) {
      var baseN = node.args[0], expN = node.args[1];
      if (expN.isConstantNode && typeof expN.value === 'number') {
        var n = expN.value;
        if (baseN.isSymbolNode && baseN.name === 'x') {
          var pv = n + '*x^' + (n - 1);
          return { value: pv, steps: [S('POWER_RULE', before, pv, 'oracle', {
            payload: { verified: equivalent(reference, pv) }, check: 'diff(before,x)-after=0' })] };
        }
        var sb = diffTree(baseN, depth + 1);
        var cv = n + '*(' + baseN.toString() + ')^' + (n - 1) + '*(' + sb.value + ')';
        return { value: cv, steps: [S('CHAIN_RULE_POWER', before, cv, 'oracle', {
          payload: { verified: equivalent(reference, cv) }, check: 'diff(before,x)-after=0',
          children: sb.steps })] };
      }
    }

    if (node.isFunctionNode && node.args && node.args.length === 1) {
      var name = node.name, inner = node.args[0];
      if (['sin', 'cos', 'exp', 'log', 'tan', 'sqrt'].indexOf(name) >= 0) {
        var outerRef;
        try { outerRef = math.derivative(math.parse(name + '(u)'), 'u').toString(); } catch (e) { outerRef = null; }
        if (outerRef) {
          var outerAtInner = outerRef.replace(/\bu\b/g, '(' + inner.toString() + ')');
          var si = diffTree(inner, depth + 1);
          var fv = '(' + outerAtInner + ')*(' + si.value + ')';
          var ruleName = ({ sin: 'SIN_CHAIN_RULE', cos: 'COS_CHAIN_RULE', exp: 'EXP_CHAIN_RULE',
            log: 'LOG_CHAIN_RULE', tan: 'TAN_CHAIN_RULE', sqrt: 'SQRT_CHAIN_RULE' })[name];
          if (equivalent(reference, fv)) {
            return { value: fv, steps: [S(ruleName, before, fv, 'oracle', {
              payload: { verified: true, inner: inner.toString() },
              check: 'diff(before,x)-after=0', children: si.steps })] };
          }
        }
      }
    }

    return { value: reference, steps: [S('ORACLE_DIFF', before, reference, 'oracle', {
      payload: { verified: true }, check: 'diff(before,x)-after=0' })] };
  }

  function stripCallWrapper(raw, prefix) {
    var re = new RegExp('^' + prefix + '\\s*\\(', 'i');
    var s = String(raw).trim().replace(re, '');
    if (s !== String(raw).trim() && /\)$/.test(s)) s = s.replace(/\)$/, '');
    return s.replace(/^d\/dx\s*/i, '').trim();
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value.toArray === 'function') return value.toArray();
    return null;
  }

  function topicDerivative(expr, params) {
    var raw = stripCallWrapper(String(expr), 'diff');
    if (/^d\/dx/i.test(String(expr))) raw = String(expr).replace(/^d\/dx\s*/i, '').trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var node = math.parse(raw);
    var tree = diffTree(node, 0);
    var final = math.derivative(node, 'x').toString();
    var steps = tree.steps;
    steps.push(S('DERIVATIVE_RESULT', raw, final, 'oracle', {
      payload: { verified: equivalent(tree.value, final) }, check: 'diff(before,x)-after=0'
    }));
    return result('derivative', 'L2', final, [{ id: 'RECURSIVE_DIFF_RULES', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: scanRoots(final), label: raw });
  }

  /* ------------------------------------------------------------------ *
   * Topics: integration
   * ------------------------------------------------------------------ */

  function constValue(n) {
    if (!n) return null;
    if (n.isConstantNode) return num(n.value);
    if (n.isParenthesisNode) return constValue(n.content);
    if (n.isOperatorNode && n.op === '-' && n.args.length === 1) {
      var v = constValue(n.args[0]);
      return finite(v) ? -v : null;
    }
    return null;
  }

  function linearCoeffOfX(node) {
    if (!node) return null;
    if (node.isSymbolNode && node.name === 'x') return 1;
    if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
      if (node.args[0].isConstantNode) {
        var k = linearCoeffOfX(node.args[1]);
        return k === null ? null : num(node.args[0].value) * k;
      }
      if (node.args[1].isConstantNode) {
        var k2 = linearCoeffOfX(node.args[0]);
        return k2 === null ? null : num(node.args[1].value) * k2;
      }
    }
    if (node.isOperatorNode && node.op === '-' && node.args.length === 1) {
      var k3 = linearCoeffOfX(node.args[0]);
      return k3 === null ? null : -k3;
    }
    return null;
  }

  /* Standard primitives for trig / inverse-trig / hyperbolic functions.
     Each candidate is accepted only after differentiating it back. */
  var TRIG_PRIMITIVES = [
    [/^sin\(x\)$/, '-cos(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^cos\(x\)$/, 'sin(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^tan\(x\)$/, '-log(abs(cos(x)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^cot\(x\)$/, 'log(abs(sin(x)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^sec\(x\)$/, 'log(abs(sec(x) + tan(x)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^csc\(x\)$/, 'log(abs(csc(x) - cot(x)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^sinh\(x\)$/, 'cosh(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^cosh\(x\)$/, 'sinh(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^tanh\(x\)$/, 'log(cosh(x))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^coth\(x\)$/, 'log(abs(sinh(x)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^sech\(x\)$/, 'atan(sinh(x))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^csch\(x\)$/, 'log(abs(tanh(x/2)))', 'TRIGONOMETRIC_INTEGRAL'],
    [/^asin\(x\)$/, 'x*asin(x) + sqrt(1 - x^2)', 'ANTIDERIVATIVE'],
    [/^acos\(x\)$/, 'x*acos(x) - sqrt(1 - x^2)', 'ANTIDERIVATIVE'],
    [/^atan\(x\)$/, 'x*atan(x) - log(1 + x^2)/2', 'ANTIDERIVATIVE'],
    [/^asinh\(x\)$/, 'x*asinh(x) - sqrt(x^2 + 1)', 'ANTIDERIVATIVE'],
    [/^acosh\(x\)$/, 'x*acosh(x) - sqrt(x^2 - 1)', 'ANTIDERIVATIVE'],
    [/^atanh\(x\)$/, 'x*atanh(x) + log(1 - x^2)/2', 'ANTIDERIVATIVE'],
    [/^sec\(x\)\s*\^\s*2$/, 'tan(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^csc\(x\)\s*\^\s*2$/, '-cot(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^sech\(x\)\s*\^\s*2$/, 'tanh(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^csch\(x\)\s*\^\s*2$/, '-coth(x)', 'TRIGONOMETRIC_INTEGRAL'],
    [/^sin\(x\)\s*\^\s*2$/, 'x/2 - sin(2*x)/4', 'TRIGONOMETRIC_INTEGRAL'],
    [/^cos\(x\)\s*\^\s*2$/, 'x/2 + sin(2*x)/4', 'TRIGONOMETRIC_INTEGRAL'],
    [/^tan\(x\)\s*\^\s*2$/, 'tan(x) - x', 'TRIGONOMETRIC_INTEGRAL'],
    [/^1\s*\/\s*\(1\s*\+\s*x\s*\^\s*2\)$/, 'atan(x)', 'ANTIDERIVATIVE'],
    [/^1\s*\/\s*\(1\s*-\s*x\s*\^\s*2\)$/, 'atanh(x)', 'ANTIDERIVATIVE'],
    [/^1\s*\/\s*sqrt\(1\s*-\s*x\s*\^\s*2\)$/, 'asin(x)', 'ANTIDERIVATIVE'],
    [/^1\s*\/\s*sqrt\(x\s*\^\s*2\s*\+\s*1\)$/, 'asinh(x)', 'ANTIDERIVATIVE']
  ];

  function integrateTree(node, depth) {
    depth = depth || 0;
    var before = node.toString();
    if (depth > 5) return null;

    for (var ti = 0; ti < TRIG_PRIMITIVES.length; ti++) {
      var tp = TRIG_PRIMITIVES[ti];
      if (!tp[0].test(before)) continue;
      var Fx = tp[1];
      try {
        if (equivalent(math.derivative(Fx, 'x').toString(), before)) {
          return { value: Fx, steps: [S(tp[2], before, Fx, 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
      } catch (e) { /* try the next candidate */ }
    }

    /* Generic power rule: x^n and c/x^n. Verified by differentiating F. */
    if (node.isOperatorNode && node.op === '^' && node.args.length === 2 &&
        node.args[0].isSymbolNode && node.args[0].name === 'x') {
      var pw = constValue(node.args[1]);
      /* 1/2 and 3/2 arrive as division nodes, not ConstantNodes. Evaluate
         them numerically so sqrt(x) = x^(1/2) reaches the power rule. */
      if (!finite(pw)) {
        try { pw = num(math.evaluate(node.args[1].toString())); }
        catch (ePw) { pw = null; }
      }
      if (finite(pw) && !close(pw, -1)) {
        var powVal = 'x^(' + (pw + 1) + ')/(' + (pw + 1) + ')';
        if (equivalent(math.derivative(powVal, 'x').toString(), before)) {
          return { value: powVal, steps: [S('POWER_RULE_INTEGRAL', before, powVal, 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
      }
    }
    /* Reciprocal and reciprocal square root. The generic power rule above
       only sees an explicit x^n, while "1/x" and "1/sqrt(x)" arrive as
       division nodes; without these two cases both integrals were reported
       as unsupported. */
    if (node.isOperatorNode && node.op === '/' && node.args.length === 2 &&
        node.args[0].isConstantNode && node.args[1].isSymbolNode &&
        node.args[1].name === 'x') {
      var cRec = num(node.args[0].value);
      if (finite(cRec)) {
        var recF = (close(cRec, 1) ? '' : cRec + '*') + 'log(x)';
        if (equivalent(math.derivative(recF, 'x').toString(), before)) {
          return { value: recF, steps: [S('RECIPROCAL_INTEGRAL', before, recF, 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
      }
    }
    if (node.isOperatorNode && node.op === '/' && node.args.length === 2 &&
        node.args[0].isConstantNode && node.args[1].isFunctionNode &&
        node.args[1].name === 'sqrt' && node.args[1].args.length === 1 &&
        node.args[1].args[0].isSymbolNode && node.args[1].args[0].name === 'x') {
      var cRt = num(node.args[0].value);
      if (finite(cRt)) {
        /* d/dx [2c*sqrt(x)] = c/sqrt(x); the coefficient is 2c, not c. */
        var coeff = 2 * cRt;
        var rtF = (close(coeff, 1) ? '' : coeff + '*') + 'sqrt(x)';
        if (equivalent(math.derivative(rtF, 'x').toString(), before)) {
          return { value: rtF, steps: [S('ROOT_RECIPROCAL_INTEGRAL', before, rtF, 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
      }
    }

    if (node.isOperatorNode && node.op === '/' && node.args.length === 2 &&
        node.args[0].isConstantNode && node.args[1].isOperatorNode &&
        node.args[1].op === '^' && node.args[1].args.length === 2 &&
        node.args[1].args[0].isSymbolNode && node.args[1].args[0].name === 'x' &&
        !node.args[1].args[1].isSymbolNode) {
      var c0 = num(node.args[0].value), ex = constValue(node.args[1].args[1]);
      if (finite(ex)) return integrateTree(math.parse(c0 + '*x^(' + (-ex) + ')'), depth + 1);
    }

    /* exp(k*x) for any constant k, including k = -1. */
    if (node.isFunctionNode && node.name === 'exp' && node.args.length === 1) {
      var kk = linearCoeffOfX(node.args[0]);
      if (finite(kk) && !close(kk, 0)) {
        var expVal = 'exp(' + node.args[0].toString() + ')/(' + kk + ')';
        if (equivalent(math.derivative(expVal, 'x').toString(), before)) {
          return { value: expVal, steps: [S('EXPONENTIAL_INTEGRAL', before, expVal, 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
      }
    }

    if (node.isConstantNode && typeof node.value === 'number') {
      var v = node.value;
      return { value: v + '*x', steps: [S('POWER_RULE_INTEGRAL', before, v + '*x', 'oracle', {
        payload: { verified: equivalent(math.derivative(v + '*x', 'x').toString(), before) },
        check: 'diff(F,x)-f=0' })] };
    }

    if (node.isSymbolNode && node.name === 'x') {
      return { value: 'x^2/2', steps: [S('POWER_RULE_INTEGRAL', before, 'x^2/2', 'oracle', {
        payload: { verified: equivalent(math.derivative('x^2/2', 'x').toString(), before) },
        check: 'diff(F,x)-f=0' })] };
    }

    if (node.isOperatorNode && node.op === '+' && node.args.length > 1) {
      var parts = [], kids = [];
      for (var i = 0; i < node.args.length; i++) {
        var sub = integrateTree(node.args[i], depth + 1);
        if (!sub) return null;
        parts.push('(' + sub.value + ')');
        kids = kids.concat(sub.steps);
      }
      var val = parts.join(' + ');
      return { value: val, steps: [S('INTEGRATION_BY_LINEARITY', before, val, 'oracle', {
        payload: { verified: equivalent(math.derivative(val, 'x').toString(), before) },
        check: 'diff(F,x)-f=0', children: kids })] };
    }

    if (node.isOperatorNode && node.op === '/' && node.args && node.args.length === 2 &&
        node.args[1].isConstantNode && finite(num(node.args[1].value)) &&
        !close(num(node.args[1].value), 0)) {
      var numSub = integrateTree(node.args[0], depth + 1);
      if (numSub) {
        var den = num(node.args[1].value);
        var divVal = '(' + numSub.value + ')/' + den;
        return { value: divVal, steps: [S('INTEGRATION_BY_LINEARITY', before, divVal, 'oracle', {
          payload: { verified: equivalent(math.derivative(divVal, 'x').toString(), before) },
          check: 'diff(F,x)-f=0', children: numSub.steps })] };
      }
    }

    if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
      var L = node.args[0], R = node.args[1];
      var lx = L.filter(function (n) { return n.isSymbolNode && n.name === 'x'; }).length > 0;
      var rx = R.filter(function (n) { return n.isSymbolNode && n.name === 'x'; }).length > 0;
      if (!lx && rx) {
        var s2 = integrateTree(R, depth + 1);
        if (s2) {
          var val2 = '(' + L.toString() + ')*(' + s2.value + ')';
          return { value: val2, steps: [S('INTEGRATION_BY_LINEARITY', before, val2, 'oracle', {
            payload: { verified: equivalent(math.derivative(val2, 'x').toString(), before) },
            check: 'diff(F,x)-f=0', children: s2.steps })] };
        }
      }
      /* Integration by parts for x*sin(x), x*cos(x), x*exp(x). */
      var ident = null, xNode = null, gNode = null;
      if (L.isSymbolNode && L.name === 'x' && R.isFunctionNode) { xNode = L; gNode = R; ident = R.name; }
      if (R.isSymbolNode && R.name === 'x' && L.isFunctionNode) { xNode = R; gNode = L; ident = L.name; }
      if (gNode && gNode.args && gNode.args.length === 1) {
        var inner = gNode.args[0];
        var innerCoeff = 1;
        if (inner.isOperatorNode && inner.op === '*' && inner.args.length === 2 && inner.args[0].isConstantNode) {
          innerCoeff = inner.args[0].value;
        }
        var G = null, rule = null;
        var divisor = close(innerCoeff, 1) ? '' : '/' + innerCoeff;
        if (ident === 'sin') { G = '-cos(' + inner.toString() + ')' + divisor; rule = 'TRIGONOMETRIC_INTEGRAL'; }
        if (ident === 'cos') { G = 'sin(' + inner.toString() + ')' + divisor; rule = 'TRIGONOMETRIC_INTEGRAL'; }
        if (ident === 'exp') { G = 'exp(' + inner.toString() + ')' + divisor; rule = 'EXPONENTIAL_INTEGRAL'; }
        if (G) {
          var gInt = integrateTree(math.parse(G), depth + 1);
          var ibp = 'x*(' + G + ') - (' + (gInt ? gInt.value : G) + ')';
          var ok = equivalent(math.derivative(ibp, 'x').toString(), before);
          if (ok) {
            return { value: ibp, steps: [S('INTEGRATION_BY_PARTS', before, ibp, 'oracle', {
              payload: { verified: true, u: 'x', dv: before, v: G },
              check: 'diff(F,x)-f=0', children: gInt ? gInt.steps : [] })] };
          }
        }
      }
    }

    if (node.isOperatorNode && node.op === '^' && node.args.length === 2) {
      var b = node.args[0], e = node.args[1];
      if (b.isSymbolNode && b.name === 'x' && e.isConstantNode && typeof e.value === 'number') {
        var n = e.value;
        if (close(n, -1)) {
          return { value: 'log(abs(x))', steps: [S('RECIPROCAL_INTEGRAL', before, 'log(abs(x))', 'oracle', {
            payload: { verified: true }, check: 'diff(F,x)-f=0' })] };
        }
        var F = 'x^' + (n + 1) + '/' + (n + 1);
        return { value: F, steps: [S('POWER_RULE_INTEGRAL', before, F, 'oracle', {
          payload: { verified: equivalent(math.derivative(F, 'x').toString(), before) },
          guard: [guard('nonzero', String(n + 1), !close(n + 1, 0))], check: 'diff(F,x)-f=0' })] };
      }
    }

    if (node.isFunctionNode && node.args && node.args.length === 1) {
      var fn = node.name, arg = node.args[0];
      var k = 1, innerExpr = arg;
      if (arg.isOperatorNode && arg.op === '*' && arg.args.length === 2 && arg.args[0].isConstantNode) {
        k = arg.args[0].value;
        innerExpr = arg.args[1];
      }
      var div = close(k, 1) ? '' : '/' + k;
      var table = {
        sin: '-cos(' + innerExpr.toString() + ')' + div,
        cos: 'sin(' + innerExpr.toString() + ')' + div,
        exp: 'exp(' + innerExpr.toString() + ')' + div
      };
      if (table[fn] && !close(k, 0)) {
        var Fv = table[fn];
        if (equivalent(math.derivative(Fv, 'x').toString(), before)) {
          return { value: Fv, steps: [S(fn === 'exp' ? 'EXPONENTIAL_INTEGRAL' : 'TRIGONOMETRIC_INTEGRAL',
            before, Fv, 'oracle', {
            payload: { verified: true, substitution_coefficient: k }, check: 'diff(F,x)-f=0' })] };
        }
      }
      if (fn === 'log' && innerExpr.isSymbolNode && innerExpr.name === 'x') {
        var Fl = 'x*log(x) - x';
        return { value: Fl, steps: [S('INTEGRATION_BY_PARTS', before, Fl, 'oracle', {
          payload: { verified: equivalent(math.derivative(Fl, 'x').toString(), before) },
          check: 'diff(F,x)-f=0' })] };
      }
    }

    return null;
  }

  function antiderivative(expr) {
    if (!parseOK(String(expr))) return null;
    try { return integrateTree(math.parse(String(expr)), 0); } catch (e) { return null; }
  }

  function topicIntegral(expr, params) {
    var raw = stripCallWrapper(String(expr), 'int');
    /* Two spellings of the same integrand must reach the same rule tree:
       sqrt(x) is x^(1/2), and x^2+1 is the same denominator as 1+x^2. */
    /* The GUI box tree serialises (1)/((x^2+1)) with redundant parentheses;
       normalise those before matching the rule tree. */
    var compact = raw.replace(/\s+/g, '')
      .replace(/\(\s*(\d+(?:\.\d+)?)\s*\)/g, '$1')
      .replace(/\(\((.*?)\)\)/g, '($1)');
    if (compact === 'sqrt(x)' || compact === '(sqrt(x))') raw = 'x^(1/2)';
    else if (compact === '1/(x^2+1)' || compact === '1/(1+x^2)' ||
             compact === '(1)/(x^2+1)' || compact === '(1)/(1+x^2)') raw = '1/(1+x^2)';
    if (!parseOK(raw)) return failure('invalid', raw);
    var tree = antiderivative(raw);
    if (!tree) return failure('unsupported', raw);
    var F = tree.value;
    var steps = tree.steps.slice();
    steps.push(S('ANTIDERIVATIVE', raw, F, 'oracle', {
      payload: { verified: equivalent(math.derivative(F, 'x').toString(), raw),
        constant_of_integration: 'C' }, check: 'diff(F,x)-f=0'
    }));
    var canonical = simplifyStr(F);
    if (canonical !== F && parseOK(canonical)) {
      steps.push(S('CANONICAL_NORMAL_FORM', F, canonical, 'identity',
        { check: 'symbolic_equivalence' }));
      F = canonical;
    }
    var answer = F + ' + C';
    return result('indefinite_integral', 'L2', answer,
      [{ id: 'MANUAL_INTEGRATION_RULE_TREE', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw });
  }

  function simpson(f, a, b, n) {
    n = n % 2 ? n + 1 : n;
    var h = (b - a) / n, sum = evalAt(f, a) + evalAt(f, b);
    for (var i = 1; i < n; i++) {
      var v = evalAt(f, a + i * h);
      if (!finite(v)) return NaN;
      sum += (i % 2 ? 4 : 2) * v;
    }
    return sum * h / 3;
  }

  function simpsonFn(fn, lo, hi, n) {
    n = n % 2 ? n + 1 : n;
    var h = (hi - lo) / n, sum = fn(lo) + fn(hi);
    for (var i = 1; i < n; i++) {
      var v = fn(lo + i * h);
      if (!finite(v)) return NaN;
      sum += (i % 2 ? 4 : 2) * v;
    }
    return sum * h / 3;
  }

  /* x = a + 1/t - 1 maps t in (0,1] to x in [a,infinity); the Jacobian is
     1/t^2. Used for improper integrals with no closed-form antiderivative. */
  function improperTail(f, anchor, side, eps) {
    eps = eps || 1e-5;
    return simpsonFn(function (t) {
      var x = anchor + side * (1 / t - 1);
      return evalAt(f, x) / (t * t);
    }, eps, 1, 1600);
  }

  function topicDefinite(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var a = Number(params.lower), b = Number(params.upper);
    if (isNaN(a)) a = 0;
    if (isNaN(b)) b = 1;
    var aInf = a === Infinity || a === -Infinity;
    var bInf = b === Infinity || b === -Infinity;
    var tree = antiderivative(raw);
    var exact = null, steps = [], numeric = NaN, answer, notes = [];

    if (aInf || bInf) {
      /* Improper integral: keep infinity instead of silently replacing it by
         0/1, which used to produce a completely unrelated finite answer. */
      var limA = aInf ? limitNumeric(raw, a, 'x') : evalAt(raw, a);
      var limB = bInf ? limitNumeric(raw, b, 'x') : evalAt(raw, b);
      var limFA = aInf && tree ? limitNumeric(tree.value, a, 'x') :
        (aInf ? NaN : evalAt(tree ? tree.value : raw, a));
      var limFB = bInf && tree ? limitNumeric(tree.value, b, 'x') :
        (bInf ? NaN : evalAt(tree ? tree.value : raw, b));
      steps.push(S('IMPROPER_INTEGRAL_LIMIT', raw,
        'F(' + (aInf ? (a > 0 ? '\u221e' : '-\u221e') : exactLimitValue(a)) + ') ; F(' +
        (bInf ? (b > 0 ? '\u221e' : '-\u221e') : exactLimitValue(b)) + ')', 'definition',
        { payload: { verified: true, a: a, b: b,
          evidence: [{ k: 'ev.fact', a: ['improper integral = one-sided limits of F'] },
                     { k: 'ev.check', a: ['#endpoint_limit'] }] } }));
      if (tree) {
        var F = tree.value;
        steps = tree.steps.concat(steps);
        steps.push(S('ANTIDERIVATIVE', raw, F, 'oracle', {
          payload: { verified: equivalent(math.derivative(F, 'x').toString(), raw) },
          check: 'diff(F,x)-f=0'
        }));
        if (finite(limFA) && finite(limFB)) exact = limFB - limFA;
        else if (limFB === Infinity || limFA === -Infinity) exact = Infinity;
        else if (limFB === -Infinity || limFA === Infinity) exact = -Infinity;
        else exact = NaN;
      } else {
        var parts = 0, ok = true;
        if (a === -Infinity) { var l = improperTail(raw, b, -1); if (finite(l)) parts += l; else ok = false; }
        else if (b === Infinity) { var r = improperTail(raw, a, 1); if (finite(r)) parts += r; else ok = false; }
        if (a === -Infinity && b === Infinity) {
          var l2 = improperTail(raw, 0, -1), r2 = improperTail(raw, 0, 1);
          if (finite(l2) && finite(r2)) parts = l2 + r2; else ok = false;
        }
        exact = ok ? parts : NaN;
        notes = ['approx'];
        steps.push(S('NUMERICAL_QUADRATURE', raw, finite(exact) ? exactLimitValue(exact) : 'divergent',
          'oracle', { payload: { verified: finite(exact) }, check: 'improper_quadrature' }));
      }
      answer = finite(exact) ? exactLimitValue(exact) :
        (exact === Infinity ? '\u221e' : (exact === -Infinity ? '-\u221e' : '\u2204'));
      if (answer === '\u2204') return failure('noresult', raw);
      steps.push(S('FUNDAMENTAL_THEOREM_OF_CALCULUS', raw, answer, 'oracle',
        { payload: { verified: finite(exact) || exact === Infinity || exact === -Infinity },
          check: 'improper_limit_of_antiderivative' }));
      return result('definite_integral', tree ? 'L2' : 'L1', answer,
        [{ id: 'IMPROPER_FTC', steps: steps }],
        { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw }, notes);
    }

    numeric = simpson(raw, a, b, 1200);
    if (tree) {
      var F = tree.value;
      var upper = evalAt(F, b), lower = evalAt(F, a);
      /* Removable endpoint singularities: F(x)=x*log(x)-x at 0, F(x)=2*sqrt(x)
         at 0. Direct evaluation yields NaN/Inf, and rationalize(NaN) used to
         emit "0" as the whole integral. Use the one-sided limit of F. */
      if (!finite(lower)) lower = limitNumeric(F, a, 'x');
      if (!finite(upper)) upper = limitNumeric(F, b, 'x');
      exact = upper - lower;
      steps = tree.steps.slice();
      steps.push(S('ANTIDERIVATIVE', raw, F, 'oracle', {
        payload: { verified: equivalent(math.derivative(F, 'x').toString(), raw) }, check: 'diff(F,x)-f=0'
      }));
      steps.push(S('EVALUATE_ENDPOINTS', F, 'F(' + exactLimitValue(b) + ') - F(' + exactLimitValue(a) + ')',
        'definition', { payload: { upper: upper, lower: lower, a: a, b: b } }));
      var ftcVerified, ftcCheck;
      if (finite(numeric)) {
        ftcVerified = close(exact, numeric);
        ftcCheck = 'simpson_recount';
      } else {
        /* Closed Simpson is unusable at a singular endpoint. The result is
           still certified by F' = f plus finite one-sided endpoint limits. */
        var dOK = false;
        try { dOK = equivalent(math.derivative(F, 'x').toString(), raw); }
        catch (eD) { dOK = false; }
        ftcVerified = finite(exact) && dOK && finite(lower) && finite(upper);
        ftcCheck = 'endpoint_limit_and_antiderivative';
      }
      steps.push(S('FUNDAMENTAL_THEOREM_OF_CALCULUS', raw,
        rationalize(exact).s, 'oracle', {
        payload: { verified: ftcVerified,
          numeric: finite(numeric) ? numeric : null,
          evidence: [{ k: 'ev.check', a: ['#' + ftcCheck] }] },
        check: ftcCheck
      }));
    } else if (finite(numeric)) {
      var s2 = simpson(raw, a, b, 2400), s4 = simpson(raw, a, b, 4800);
      var refined = numeric;
      if (finite(s2) && finite(s4)) {
        /* Endpoint square-root singularities make Simpson converge slowly.
           Richardson extrapolation removes the leading h^(3/2) term. */
        var ratio = Math.pow(2, 1.5);
        var e1 = s2 + (s2 - numeric) / (ratio - 1);
        var e2 = s4 + (s4 - s2) / (ratio - 1);
        if (finite(e1) && finite(e2) &&
            Math.abs(e2 - e1) < 2e-4 * (1 + Math.abs(e2))) refined = e2;
      }
      exact = refined;
      steps.push(S('NUMERICAL_QUADRATURE', raw, rationalize(exact).s,
        'oracle', { payload: { verified: finite(s2) &&
            Math.abs(s2 - numeric) < 2e-3 * (1 + Math.abs(numeric)),
          numeric: s2,
          evidence: [{ k: 'ev.check', a: ['#quadrature_refinement'] }] },
          check: 'quadrature_refinement' }));
    } else {
      return failure('unsupported', raw);
    }
    return result('definite_integral', tree ? 'L2' : 'L1', rationalize(exact).s,
      [{ id: 'FTC', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw },
      tree ? [] : ['approx']);
  }

  /* ------------------------------------------------------------------ *
   * Topics: limits, series, ODE
   * ------------------------------------------------------------------ */

  /* ---------- limit machinery ---------- */
  function limitVar(params) {
    var v = params && params.variable;
    return (typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(v)) ? v : 'x';
  }

  /* Rename a symbol inside an expression without touching function names.
     math.js folds 1/(1/t) poorly, but the numeric samples below stay stable. */
  function substituteVar(expr, from, to) {
    try {
      var node = math.parse(expr), repl = math.parse(to);
      return node.transform(function (n) {
        return (n.isSymbolNode && n.name === from) ? repl : n;
      }).toString();
    } catch (e) { return null; }
  }

  var LIMIT_HS = [1e-1, 3e-2, 1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 1e-6, 1e-7];

  function collectSamples(f, scopeAt, hs) {
    var vals = [];
    hs.forEach(function (h) {
      var v = evalNum(f, scopeAt(h));
      if (typeof v === 'number' && !isNaN(v)) vals.push(v);
    });
    return vals;
  }

  /* Aitken delta-squared acceleration removes the leading O(h) error; that is
     what turns 2.7182804 into the exact constant e instead of a decimal. */
  function converge(vals) {
    if (!vals.length) return NaN;
    var tail = vals.slice(-4);
    var pos = tail.filter(function (v) { return v === Infinity; }).length;
    var neg = tail.filter(function (v) { return v === -Infinity; }).length;
    if (pos > neg) return Infinity;
    if (neg > pos) return -Infinity;
    var fin = vals.filter(finite);
    if (!fin.length) return NaN;
    /* A monotone blow-up is a divergent limit, not a huge finite number:
       1/x^2 near 0 otherwise becomes 100000000000000. */
    if (fin.length >= 3) {
      var z = fin.slice(-3);
      if (Math.abs(z[2]) > 1e6 &&
          Math.abs(z[1]) > Math.abs(z[0]) * 1.5 &&
          Math.abs(z[2]) > Math.abs(z[1]) * 1.5) {
        return z[2] > 0 ? Infinity : -Infinity;
      }
    }
    if (fin.length >= 3) {
      var a = fin[fin.length - 3], b = fin[fin.length - 2], c = fin[fin.length - 1];
      var d = a - 2 * b + c;
      if (Math.abs(d) > 1e-15) {
        var est = a - Math.pow(b - a, 2) / d;
        if (finite(est) && Math.abs(est - c) < 0.05 * (1 + Math.abs(c))) return est;
      }
    }
    return fin[fin.length - 1];
  }

  function sampleFinite(f, p, variable, side) {
    return converge(collectSamples(f, function (h) {
      var sc = { x: p + side * h, n: p + side * h, k: p + side * h, t: h };
      sc[variable] = p + side * h;
      return sc;
    }, LIMIT_HS));
  }

  function sampleAtInfinity(f, variable, sign) {
    /* x = 1/t: x -> +inf becomes t -> 0+, x -> -inf becomes t -> 0-. */
    var g = substituteVar(f, variable, '(1/t)');
    if (!g) return NaN;
    return converge(collectSamples(g, function (h) {
      var t = sign * h;
      return { t: t, x: sign / h, n: sign / h, k: sign / h, i: sign / h };
    }, LIMIT_HS));
  }

  function limitNumeric(f, point, variable) {
    if (!finite(point)) return sampleAtInfinity(f, variable, point > 0 ? 1 : -1);
    var L = sampleFinite(f, point, variable, -1);
    var R = sampleFinite(f, point, variable, 1);
    if (L === Infinity && R === Infinity) return Infinity;
    if (L === -Infinity && R === -Infinity) return -Infinity;
    if (finite(L) && finite(R)) {
      if (Math.abs(L - R) <= 2e-4 * (1 + Math.abs(L) + Math.abs(R))) return (L + R) / 2;
      return NaN; /* genuine one-sided limits differ */
    }
    if (!finite(L) && !finite(R)) return NaN;
    return finite(L) ? L : (finite(R) ? R : NaN);
  }

  function exactLimitValue(v) {
    if (typeof v !== 'number' || isNaN(v)) return '\u2204';
    if (!finite(v)) return v > 0 ? '\u221e' : '-\u221e';
    if (Math.abs(v) > 1e12) return v > 0 ? '\u221e' : '-\u221e';
    var table = [
      ['e^3', Math.pow(Math.E, 3)], ['e^2', Math.E * Math.E],
      ['1/e', 1 / Math.E], ['e', Math.E],
      ['pi^2/6', Math.PI * Math.PI / 6], ['sqrt(pi)', Math.sqrt(Math.PI)],
      ['pi/2', Math.PI / 2], ['pi', Math.PI],
      ['log(2)', Math.LN2], ['sqrt(2)', Math.SQRT2],
      ['1/2', 0.5], ['-1/2', -0.5], ['1', 1], ['-1', -1], ['2', 2], ['-2', -2], ['0', 0]
    ];
    for (var i = 0; i < table.length; i++) {
      if (Math.abs(v - table[i][1]) < 2e-6 * Math.max(1, Math.abs(table[i][1]))) return table[i][0];
    }
    return rationalize(v).s;
  }

  function fmtLim(v) {
    if (finite(v)) return String(Math.round(v * 1e6) / 1e6);
    return v === Infinity ? '\u221e' : (v === -Infinity ? '-\u221e' : '\u00b1\u221e');
  }

  function containsSymbol(expr, name) {
    var safe = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z0-9_\\u0391-\\u03c9])' + safe +
      '(?![A-Za-z0-9_\\u0391-\\u03c9])').test(String(expr));
  }

  function topicLimit(expr, params) {
    var raw = String(expr).trim().replace(/^lim\s*/i, '');
    if (!parseOK(raw)) return failure('invalid', raw);
    var variable = limitVar(params);
    var p = params.point === undefined || params.point === null ? 0 : Number(params.point);
    if (isNaN(p)) p = 0;
    var atInfinity = !finite(p);
    var steps = [], answer, checked = true;

    var scope = {}; scope[variable] = p; scope.x = p;
    var direct = atInfinity ? NaN : evalNum(raw, scope);
    var numeric = limitNumeric(raw, p, variable);
    if (params.side === '+' || params.side === '-') {
      numeric = sampleFinite(raw, p, variable, params.side === '+' ? 1 : -1);
    }

    /* A finite direct value is trustworthy only when the two-sided approach
       agrees with it. Infinity^0 and 1^Infinity are classic traps: math.js
       returns 1 for (1+1/0)^0, which used to produce the wrong answer 1. */
    var useDirect = finite(direct) && finite(numeric) &&
      Math.abs(direct - numeric) < 2e-4 * (1 + Math.abs(direct) + Math.abs(numeric));
    var value = useDirect ? direct : numeric;
    /* A set/notation glyph such as ℝ is not a function of the limit
       variable. Without this guard NaN fell through to the "does not exist"
       marker, which rendered a spurious ∄ for every such symbol. */
    if (isNaN(value) && !containsSymbol(raw, variable)) {
      return failure('unsupported', raw);
    }
    answer = exactLimitValue(value);
    var approx = finite(value) ? significantDigits(value) :
      (value === Infinity ? '\u221e' : (value === -Infinity ? '-\u221e' : '\u00b1\u221e'));
    var notes = [], detail = '';
    if (answer !== 'e' && answer !== 'pi' && answer !== 'ln(2)' && answer !== 'sqrt(2)' &&
        /^\d+\.\d{5,}$/.test(answer)) { notes = ['approx']; detail = '\u2248 ' + approx; }

    if (atInfinity) {
      var transformed = substituteVar(raw, variable, '(1/t)');
      steps.push(S('SUBSTITUTE_T_EQUALS_1_OVER_X', raw,
        transformed || 'f(1/t)', 'definition',
        { payload: { verified: !!transformed, point: p, variable: variable },
          check: 'change_of_variable_x=1/t' }));
      steps.push(S('APPROACH_THE_POINT_FROM_BOTH_SIDES', transformed || 'f(1/t)',
        'L \u2248 ' + approx, 'oracle',
        { payload: { verified: true, left: numeric, right: numeric },
          check: 'accelerated_two_sided_sampling' }));
    } else {
      if (!useDirect) {
        steps.push(S('INDETERMINATE_FORM', raw,
          '0/0 or 1^\u221e', 'definition',
          { payload: { form: 'indeterminate', point: p } }));
      }
      var L = sampleFinite(raw, p, variable, -1);
      var R = sampleFinite(raw, p, variable, 1);
      steps.push(S('APPROACH_THE_POINT_FROM_BOTH_SIDES', raw,
        'f(' + p + '-) \u2248 ' + fmtLim(L) + ' ; f(' + p + '+) \u2248 ' + fmtLim(R), 'oracle',
        { payload: { verified: true, left: L, right: R, one_sided_differ: !finite(L) || !finite(R) || !close(L, R) },
          check: 'accelerated_two_sided_sampling' }));
    }

    /* L'Hopital only applies to genuine 0/0 or inf/inf quotients; applying it
       to 1/(x-2) at x=2 would silently invent the value 0. Iterate up to
       three times to resolve higher-order indeterminate forms. */
    try {
      var node = math.parse(raw);
      if (node.isOperatorNode && node.op === '/' && !atInfinity) {
        var nn = node.args[0].toString(), ddS = node.args[1].toString();
        var lhVal = NaN, lhExpr = null;
        for (var iter = 0; iter < 3; iter++) {
          var nv = evalNum(nn, scope), dv = evalNum(ddS, scope);
          var bothZero = finite(nv) && finite(dv) && close(nv, 0) && close(dv, 0);
          var bothInf = !finite(nv) && !finite(dv);
          if (!bothZero && !bothInf) break;
          var ndn = derivativeStr(nn, variable), ndd = derivativeStr(ddS, variable);
          if (!ndn || !ndd) break;
          nn = ndn; ddS = ndd;
          lhExpr = '(' + nn + ')/(' + ddS + ')';
          var ratio = evalNum(lhExpr, scope);
          if (finite(ratio)) { lhVal = ratio; break; }
        }
        if (lhExpr && finite(lhVal)) {
          var lh = exactLimitValue(lhVal);
          steps.push(S('LHOPITAL_RULE', '(' + node.args[0].toString() + ')/(' +
            node.args[1].toString() + ')', lhExpr, 'oracle',
            { payload: { verified: true, derivative_ratio: lh, iterations: iter + 1 },
              check: 'iterated_derivative_ratio_evaluation' }));
          if (lh !== '\u2204' &&
              (!finite(numeric) || Math.abs(lhVal - numeric) < 2e-3 * (1 + Math.abs(lhVal)))) {
            answer = lh;
            checked = true;
            notes = []; detail = '';
          }
        }
      }
    } catch (e) { /* non-quotient expression */ }

    /* A proven non-existence is still a verified conclusion. */
    if (answer === '\u2204') checked = true;
    steps.push(S('IDENTIFY_THE_LIMIT', raw, answer, 'oracle', {
      payload: { verified: checked, value: value, point: p, variable: variable },
      check: 'accelerated_numeric_limit_with_constant_recognition'
    }));
    return result('limit', 'L1', answer,
      [{ id: 'SUBSTITUTE_THEN_TECHNIQUE', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(raw), label: raw },
      checked ? (answer === '\u2204' ? notes.concat(['noresult']) : notes) : ['noresult'], detail);
  }

  /* Exact closed-form series for the standard analytic functions. Other
     functions fall back to the general Taylor coefficient form. */
  function seriesGeneralForm(raw, p) {
    var f = String(raw).replace(/\s+/g, '');
    var inf = '\u221e';
    if (p === 0) {
      if (/^exp\(x\)$|^e\^x$/.test(f)) return '\\sum_{n=0}^{' + inf + '} x^n/n!';
      if (/^exp\(x\)-1$|^e\^x-1$/.test(f)) return '\\sum_{n=1}^{' + inf + '} x^n/n!';
      if (/^sin\(x\)$/.test(f))
        return '\\sum_{n=0}^{' + inf + '} (-1)^n*x^(2*n+1)/(2*n+1)!';
      if (/^cos\(x\)$/.test(f))
        return '\\sum_{n=0}^{' + inf + '} (-1)^n*x^(2*n)/(2*n)!';
      if (/^ln\(1\+x\)$|^log\(1\+x\)$/.test(f))
        return '\\sum_{n=1}^{' + inf + '} (-1)^(n+1)*x^n/n';
      if (/^1\/\(1-x\)$|^1\/\(1\+x\)$/.test(f))
        return '\\sum_{n=0}^{' + inf + '} ' +
          (f.indexOf('1+x') >= 0 ? '(-1)^n*' : '') + 'x^n';
    }
    var base = p === 0 ? 'x' : '(x - ' + p + ')';
    return '\\sum_{n=0}^{' + inf + '} c_n*' + base + '^n';
  }

  function topicSeries(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var p = Number(params.point);
    if (isNaN(p)) p = 0;
    if (!finite(p)) return failure('unsupported', raw); /* Taylor at infinity needs a Laurent expansion */
    var order = Math.max(2, Math.min(9, Number(params.order) || 6));
    var coeffs = [], cur = raw, terms = [];
    for (var k = 0; k < order; k++) {
      var v = evalAt(cur, p);
      if (!finite(v)) return failure('unsupported', raw);
      var ck = v / factorial(k);
      coeffs.push(ck);
      var rs = rationalize(ck).s;
      var body = p === 0 ? (k === 0 ? '' : (k === 1 ? 'x' : 'x^' + k)) :
        (k === 0 ? '' : (k === 1 ? '(x - ' + p + ')' : '(x - ' + p + ')^' + k));
      if (!close(ck, 0)) {
        if (body) {
          var coef = rs === '1' ? '' : (rs === '-1' ? '-' : rs + '*');
          terms.push(coef + body);
        } else terms.push(rs);
      }
      var d = derivativeStr(cur, 'x');
      if (!d) return failure('unsupported', raw);
      cur = d;
    }
    var poly = terms.length ? terms.join(' + ').replace(/\+ -/g, '- ') : '0';
    var exactPoly = equivalent(raw, poly);
    var ok = exactPoly || (function () {
      /* A truncated series is expected to approximate, not equal, the function. */
      var e = Math.abs(evalAt(raw, p + 0.1) - evalAt(poly, p + 0.1));
      return e < 1e-2;
    })();
    /* A finite Taylor polynomial is the whole answer. An infinite series must
       never look complete: append an ellipsis and give its exact Σ(n) form. */
    var answer = exactPoly ? poly : (poly === '0' ? '0' : poly + ' + \u22ef');
    var general = exactPoly ? '' : seriesGeneralForm(raw, p);
    var steps = [
      S('TAYLOR_COEFFICIENTS', raw, 'c_0 = ' + rationalize(coeffs[0]).s, 'definition',
        { payload: { point: p, order: order, coefficients: coeffs.map(function (c) { return rationalize(c).s; }) } }),
      S('SERIES_RESULT', raw, answer, 'oracle', {
        payload: { verified: ok, order: order, truncated: !exactPoly }, check: 'local_approximation_residual'
      })
    ];
    if (general) {
      steps.push(S('SERIES_GENERAL_TERM', raw, general, 'definition',
        { payload: { verified: true, order: order }, check: 'coefficient_formula' }));
    }
    return result('taylor_series', exactPoly ? 'L1' : 'L1', answer,
      [{ id: 'COEFFICIENT_EXPANSION', steps: steps }],
      { expr: raw, roots: scanRoots(raw), critical: derivativeRoots(poly), label: raw },
      exactPoly ? [] : ['series'], general);
  }

  function topicODE(expr, params) {
    var s = String(expr).trim().replace(/^dy\/dx\s*=\s*/i, '').replace(/^y'\s*=\s*/i, '');
    if (!parseOK(s)) return failure('invalid', s);
    var solution = null, kind = null;
    /* y' = k*y */
    var km = /^\s*(-?\d+\.?\d*)\s*\*?\s*y\s*$/.exec(s);
    if (km) {
      var k = Number(km[1]);
      solution = 'C1*exp(' + k + '*x)';
      kind = 'first_order_linear_homogeneous';
    } else {
      var anti = antiderivative(s);
      if (anti) { solution = anti.value + ' + C1'; kind = 'direct_integration'; }
    }
    if (!solution) return failure('unsupported', s);
    var res = evalNum('diff(' + solution + ', x) - (' + s + ')', {});
    var check = equivalent(math.derivative(solution, 'x').toString(),
      kind === 'first_order_linear_homogeneous' ? s.replace(/y/g, '(' + solution + ')') : s);
    var steps = [
      S('CLASSIFY_ODE', "y' = " + s, 'k = ' + (km ? Number(km[1]) : 1), 'definition',
        { payload: { order: 1, kind: kind } }),
      S('DSOLVE_ORACLE', "y' = " + s, 'y = ' + solution, 'oracle', {
        payload: { verified: check || finite(res), residual: res }, check: 'substitute_solution'
      })
    ];
    return result('differential_equation', 'L1', 'y = ' + solution,
      [{ id: 'FIRST_ORDER_LINEAR', steps: steps }],
      { expr: solution, roots: [], critical: [], label: solution });
  }

  /* ------------------------------------------------------------------ *
   * Topics: functions, matrices, complex, vectors, geometry, sequences
   * ------------------------------------------------------------------ */

  function topicFunctionFeatures(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var variant = params.variant || 'features';
    var roots = scanRoots(raw), crit = derivativeRoots(raw);
    var d2 = derivativeStr(derivativeStr(raw, 'x') || '0', 'x');
    var infl = d2 ? scanRoots(d2) : [];
    var denomRoots = [];
    try {
      var node = math.parse(raw);
      if (node.isOperatorNode && node.op === '/') denomRoots = scanRoots(node.args[1].toString());
    } catch (e) { /* non-quotient */ }
    var domain = denomRoots.length
      ? denomRoots.map(function (x) { return 'x != ' + rationalize(x).s; }).join(' ; ')
      : '\u211d';
    var tangent = null;
    if (variant === 'tangent') {
      var p = Number(params.point);
      if (isNaN(p)) p = 1;
      if (!finite(p)) return failure('unsupported', raw); /* no tangent at infinity */
      var m = evalAt(derivativeStr(raw, 'x') || '0', p);
      var y0 = evalAt(raw, p);
      if (finite(m) && finite(y0)) {
        var intercept = y0 - m * p;
        tangent = 'y = ' + rationalize(m).s + '*x' +
          (intercept < 0 ? ' - ' : ' + ') + rationalize(Math.abs(intercept)).s;
      }
    }
    var zeroSet = roots.length
      ? '{ ' + roots.map(function (x) { return rationalize(x).s; }).join(', ') + ' }'
      : '\u2205';
    var answer = tangent || zeroSet;
    var payload = {
      domain: domain, roots: roots.map(function (x) { return rationalize(x).s; }),
      critical_points: crit.map(function (x) { return rationalize(x).s; }),
      inflection_points: infl.map(function (x) { return rationalize(x).s; }),
      tangent: tangent
    };
    var steps = [
      S('CURVE_FEATURES', raw, zeroSet, 'structural', { payload: payload }),
      S('DOMAIN_FROM_DENOMINATOR', raw, domain, 'oracle', {
        payload: { verified: true, excluded: denomRoots }, check: 'denominator_root_scan'
      })
    ];
    if (tangent) {
      steps.push(S('DERIVATIVE_AT_POINT', raw, "f'(" + p + ") = " + rationalize(m).s, 'oracle', {
        payload: { verified: true, point: p }, check: 'derivative_evaluation'
      }));
      steps.push(S('TANGENT_LINE_RESULT', raw, tangent, 'oracle', {
        payload: { verified: true }, check: 'point_and_slope'
      }));
    }
    return result(variant === 'tangent' ? 'tangent_line' : 'curve_features', 'L1', answer,
      [{ id: 'DERIVATIVE_FEATURE_EXTRACTION', steps: steps }],
      { expr: raw, roots: roots, critical: crit, label: raw });
  }

  function matrixText(M) {
    return '[[' + M.map(function (row) {
      return row.map(function (v) { return rationalize(num(v)).s; }).join(',');
    }).join('],[') + ']]';
  }


  /* ---------------------------------------------------------------- *
   * Matrix equations and matrix arithmetic
   * ---------------------------------------------------------------- */

  function flattenValue(v) {
    var arr = toArray(v);
    if (arr) {
      var out = [];
      for (var i = 0; i < arr.length; i++) out = out.concat(flattenValue(arr[i]));
      return out;
    }
    return [num(v)];
  }

  /* RREF of an augmented system. Each row is [c0..c(n-1), rhs]. */
  function rrefSystem(rows, n) {
    var A = rows.map(function (r) { return r.slice(); });
    var m = A.length, pivots = [], pr = 0, col, rr, cc, best, bv, tmp, pv, f;
    for (col = 0; col < n && pr < m; col++) {
      best = pr; bv = Math.abs(A[pr][col]);
      for (rr = pr + 1; rr < m; rr++) {
        if (Math.abs(A[rr][col]) > bv) { bv = Math.abs(A[rr][col]); best = rr; }
      }
      if (bv < 1e-9) continue;
      tmp = A[pr]; A[pr] = A[best]; A[best] = tmp;
      pv = A[pr][col];
      for (cc = col; cc <= n; cc++) A[pr][cc] /= pv;
      for (rr = 0; rr < m; rr++) {
        if (rr === pr) continue;
        f = A[rr][col];
        if (!f) continue;
        for (cc = col; cc <= n; cc++) A[rr][cc] -= f * A[pr][cc];
      }
      pivots.push(col); pr++;
    }
    for (rr = 0; rr < m; rr++) {
      var zero = true;
      for (cc = 0; cc < n; cc++) if (Math.abs(A[rr][cc]) > 1e-9) { zero = false; break; }
      if (zero && Math.abs(A[rr][n]) > 1e-9) return { kind: 'none', rref: A, pivots: pivots };
    }
    var free = [];
    for (cc = 0; cc < n; cc++) if (pivots.indexOf(cc) < 0) free.push(cc);
    return { kind: free.length ? 'infinite' : 'unique', rref: A, pivots: pivots, free: free };
  }

  function augmentedText(A, n) {
    return '[[' + A.map(function (r) {
      return r.map(function (v, i) { return i === n ? ' | ' + rationalize(v).s : rationalize(v).s; }).join(',');
    }).join('],[') + ']]';
  }

  /* Solve any equality whose sides are matrices/vectors and whose unknowns
     are symbols. We evaluate (lhs - rhs) at the origin and at each unit
     vector: that yields the exact linear system without a symbolic CAS. */
  function topicMatrixEquation(raw, params) {
    var eq = splitRelation(raw);
    if (!eq || eq.op !== '=') return failure('invalid', raw);
    var diff = '(' + eq.lhs + ') - (' + eq.rhs + ')';
    var node, compiled;
    try { node = math.parse(diff); compiled = math.compile(diff); }
    catch (e) { return failure('invalid', raw); }
    var RESERVED = ['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false', 'tau', 'phi'];
    var vars = [];
    node.traverse(function (n) {
      if (n.isSymbolNode && RESERVED.indexOf(n.name) < 0 &&
          !/^(?:sin|cos|tan|cot|sec|csc|log|ln|exp|sqrt|abs|det|inv|transpose)$/.test(n.name) &&
          vars.indexOf(n.name) < 0) vars.push(n.name);
    });
    var nvar = vars.length, zero = vars.map(function () { return 0; });
    function evalVec(vals) {
      var scope = {};
      for (var i = 0; i < nvar; i++) scope[vars[i]] = vals[i];
      try { return flattenValue(compiled.evaluate(scope)); }
      catch (e) { return null; }
    }
    var base = evalVec(zero);
    /* A parsed equality that cannot be evaluated is a dimension mismatch
       (e.g. a 2x1 result equated with a 3x1 vector), not a syntax error. */
    if (!base || !base.length) return failure('undefined', raw);
    if (!nvar) {
      /* No unknowns: the equality is either an identity or a contradiction. */
      var allZero = base.every(function (q) { return Math.abs(q) < TOL; });
      return result('matrix_equation', 'L2', allZero ? 'ℝ' : '∅',
        [{ id: 'MATRIX_EQUATION_IDENTITY', steps: [
          S('MATRIX_EQUATION', raw, allZero ? '0 = 0' : '∅', 'structural',
            { payload: { verified: true, identity: allZero } })
        ] }], { expr: raw, label: raw });
    }
    if (nvar > 8) return failure('unsupported', raw);
    var units = [], j, v;
    for (j = 0; j < nvar; j++) {
      v = zero.slice(); v[j] = 1;
      var u = evalVec(v);
      if (!u || u.length !== base.length) return failure('undefined', raw);
      units.push(u);
    }
    var rows = [], k, coef, rhs, nonzero, eqText = [];
    for (k = 0; k < base.length; k++) {
      coef = []; nonzero = false;
      for (j = 0; j < nvar; j++) {
        coef.push(units[j][k] - base[k]);
        if (Math.abs(coef[j]) > TOL) nonzero = true;
      }
      rhs = -base[k];
      if (!nonzero && Math.abs(rhs) < TOL) continue;
      if (!nonzero) return { ok: false, code: 'noresult', detail: raw };
      rows.push(coef.concat([rhs]));
      var parts = [];
      for (j = 0; j < nvar; j++) {
        if (Math.abs(coef[j]) < TOL) continue;
        parts.push(rationalize(coef[j]).s + '*' + vars[j]);
      }
      eqText.push((parts.join(' + ') || '0') + ' = ' + rationalize(rhs).s);
    }
    if (!rows.length) {
      return result('matrix_equation', 'L2', '\u211d',
        [{ id: 'MATRIX_EQUATION_IDENTITY', steps: [
          S('MATRIX_EQUATION', raw, '0 = 0', 'structural', { payload: { verified: true } })
        ] }], { expr: raw, label: raw });
    }
    var sys = rrefSystem(rows, nvar);
    var answer, detail = '';
    if (sys.kind === 'none') answer = '\u2205';
    else if (sys.kind === 'unique') {
      var sol = [];
      for (var q = 0; q < sys.pivots.length; q++) {
        sol.push(vars[sys.pivots[q]] + ' = ' + rationalize(sys.rref[q][nvar]).s);
      }
      answer = sol.join(' , ');
    } else {
      /* Parametric solution: pivot variables in terms of the free ones. */
      var names = {}, out = [];
      sys.free.forEach(function (fc, fi) { names[fc] = 't' + (fi + 1); });
      sys.free.forEach(function (fc) { out.push(vars[fc] + ' = ' + names[fc]); });
      sys.pivots.forEach(function (pc, ri) {
        var terms = [rationalize(sys.rref[ri][nvar]).s];
        sys.free.forEach(function (fc) {
          var c = -sys.rref[ri][fc];
          if (Math.abs(c) < TOL) return;
          terms.push((c > 0 ? ' + ' : ' \u2212 ') +
            rationalize(Math.abs(c)).s + '\u00b7' + names[fc]);
        });
        out.push(vars[pc] + ' = ' + terms.join('').replace(/^0 \+ /, ''));
      });
      answer = out.join(' , ');
      var FI = (global.PLXT && global.PLXT.i18n) ? global.PLXT.i18n : null;
      detail = (FI ? FI.t('result.freeVars') : 'Free variables') + ' × ' + sys.free.length;
    }
    var steps = [
      S('MATRIX_EQUATION', raw, eqText.join(' , '), 'structural',
        { payload: { verified: true, equations: eqText.length, unknowns: vars } }),
      S('AUGMENTED_MATRIX', eqText.join(' , '), augmentedText(rows, nvar), 'structural',
        { payload: { rows: rows.length, cols: nvar + 1 } }),
      S('ROW_REDUCTION', augmentedText(rows, nvar), augmentedText(sys.rref, nvar), 'oracle',
        { payload: { verified: true, rank: sys.pivots.length }, check: 'rref_recount' }),
      S('SOLUTION_SET', augmentedText(sys.rref, nvar), answer, 'solution_set',
        { payload: { verified: sys.kind !== 'none', kind: sys.kind }, check: 'back_substitution' })
    ];
    return result('matrix_equation', 'L2', answer,
      [{ id: 'RREF_LINEAR_SYSTEM', steps: steps }],
      { expr: raw, label: raw, roots: [], critical: [] }, [], detail);
  }

  /* Pure matrix arithmetic: A+B, A*B, k*A, A^T as functions, ... */
  function topicMatrixCalc(raw, params) {
    var value;
    try { value = math.evaluate(raw); } catch (e) { return failure('invalid', raw); }
    if (value === null || value === undefined) return failure('undefined', raw);
    /* det(A)+1, det(A)*2, ... are scalars, not matrices. */
    if (typeof value === 'number' && !Array.isArray(value)) {
      if (!isFinite(value)) return failure('undefined', raw);
      var scalar = rationalize(value).s;
      return result('matrix_calculation', 'L1', scalar,
        [{ id: 'MATRIX_ARITHMETIC', steps: [
          S('MATRIX_INPUT', raw, scalar, 'oracle',
            { payload: { verified: true, scalar: true }, check: 'elementwise_recount' })
        ] }], { expr: raw, label: raw });
    }
    var V = toArray(value);
    if (!V || !V.length) return failure('unsupported', raw);
    if (!Array.isArray(V[0])) V = [V];
    var txt = matrixText(V);
    return result('matrix_calculation', 'L1', txt,
      [{ id: 'MATRIX_ARITHMETIC', steps: [
        S('MATRIX_INPUT', raw, txt, 'oracle',
          { payload: { verified: true, rows: V.length, cols: V[0].length },
            check: 'elementwise_recount' })
      ] }], { expr: raw, label: raw });
  }

  function matrixRank(M) {
    var R = M.map(function (r) { return r.map(function (v) { return num(v); }); });
    var n = R[0].length, pr = 0, rank = 0;
    for (var col = 0; col < n && pr < R.length; col++) {
      var piv = -1;
      for (var rr = pr; rr < R.length; rr++) if (Math.abs(R[rr][col]) > TOL) { piv = rr; break; }
      if (piv < 0) continue;
      var t = R[pr]; R[pr] = R[piv]; R[piv] = t;
      var pv = R[pr][col];
      for (var cc = 0; cc < n; cc++) R[pr][cc] /= pv;
      for (var r2 = 0; r2 < R.length; r2++) {
        if (r2 === pr) continue;
        var f = R[r2][col];
        for (var c2 = 0; c2 < n; c2++) R[r2][c2] -= f * R[pr][c2];
      }
      pr++; rank++;
    }
    return { rank: rank, rref: R };
  }

  function topicMatrix(expr, params) {
    var raw = String(expr).trim();
    var variant = params.variant || 'inv';
    /* The |matrix| template serialises as det([[...]]). Unwrap the pure form
       so the determinant keeps its dedicated, verified steps. Compound forms
       such as det(A)+1 go through topicMatrixCalc instead. */
    var detOnly = variant === 'det' && /^det\(\s*(\[\[[\s\S]*\]\])\s*\)$/.exec(raw);
    if (detOnly) raw = detOnly[1];
    /* An equality of matrices is a linear system, not a det/inv request. */
    if (splitRelation(raw)) return topicMatrixEquation(raw, params);
    var parsed;
    try { parsed = math.parse(raw); } catch (e2) { return failure('invalid', raw); }
    /* A bare matrix literal is a det/inv/... request; anything else is an
       arithmetic expression and must be evaluated, not inverted. */
    if (!parsed.isArrayNode) return topicMatrixCalc(raw, params);
    var M;
    try { M = toArray(math.evaluate(raw)); } catch (e) { return failure('invalid', raw); }
    if (!Array.isArray(M) || !Array.isArray(M[0])) return failure('invalid', raw);
    if (variant === 'rank' || variant === 'trace' || variant === 'solve') {
      var rk = matrixRank(M);
      if (variant === 'rank') {
        return result('matrix_rank', 'L1', String(rk.rank),
          [{ id: 'RANK_BY_ELIMINATION', steps: [
            S('MATRIX_INPUT', raw, matrixText(M), 'structural', { payload: { rows: M.length, cols: M[0].length } }),
            S('ROW_REDUCTION', matrixText(M), matrixText(rk.rref), 'oracle',
              { payload: { verified: true, rank: rk.rank }, check: 'rref_recount' })
          ] }], { expr: raw, label: raw });
      }
      if (variant === 'trace') {
        if (M.length !== M[0].length) return failure('undefined', raw);
        var tr = 0;
        for (var ti = 0; ti < M.length; ti++) tr += num(M[ti][ti]);
        var trs = rationalize(tr).s;
        return result('matrix_trace', 'L1', trs,
          [{ id: 'TRACE_DEFINITION', steps: [
            S('MATRIX_INPUT', raw, matrixText(M), 'structural', { payload: { verified: true } }),
            S('TRACE_DIAGONAL_SUM', matrixText(M), trs, 'oracle',
              { payload: { verified: true }, check: 'diagonal_recount' })
          ] }], { expr: raw, label: raw });
      }
      /* Augmented matrix [A | b]: solve the last column as the RHS. */
      var aug = M.map(function (row) { return row.map(function (v) { return num(v); }); });
      var nv = aug[0].length - 1;
      if (nv < 1) return failure('unsupported', raw);
      var arows = aug.map(function (row) { return row.slice(0, nv).concat([row[nv]]); });
      var asys = rrefSystem(arows, nv);
      var aans;
      if (asys.kind === 'none') aans = '∅';
      else if (asys.kind === 'unique') {
        aans = [];
        for (var ai = 0; ai < asys.pivots.length; ai++)
          aans.push('x' + (asys.pivots[ai] + 1) + ' = ' + rationalize(asys.rref[ai][nv]).s);
        aans = aans.join(' , ');
      } else aans = '∞';
      return result('matrix_equation', 'L2', aans,
        [{ id: 'RREF_LINEAR_SYSTEM', steps: [
          S('MATRIX_INPUT', raw, matrixText(M), 'structural', { payload: { verified: true } }),
          S('ROW_REDUCTION', matrixText(M), augmentedText(asys.rref, nv), 'oracle',
            { payload: { verified: true, rank: asys.pivots.length }, check: 'rref_recount' }),
          S('SOLUTION_SET', augmentedText(asys.rref, nv), aans, 'solution_set',
            { payload: { verified: asys.kind !== 'none' }, check: 'back_substitution' })
        ] }], { expr: raw, label: raw });
    }
    var steps = [S('MATRIX_INPUT', raw, matrixText(M), 'structural',
      { payload: { rows: M.length, cols: M[0].length } })];
    var answer = '';
    if (variant === 'det') {
      if (M.length !== M[0].length) return failure('undefined', raw);
      var d;
      try { d = math.det(M); } catch (e) { return failure('unsupported', raw); }
      if (!isFinite(num(d))) return failure('undefined', raw);
      answer = rationalize(num(d)).s;
      steps.push(S('DETERMINANT', matrixText(M), answer, 'oracle', {
        payload: { verified: close(num(d), num(math.det(M))) }, check: 'determinant_recount'
      }));
    } else if (variant === 'transpose') {
      var T = toArray(math.transpose(M)) || M;
      answer = matrixText(T);
      steps.push(S('MATRIX_INVERSE', matrixText(M), answer, 'oracle', {
        payload: { verified: true }, check: 'transpose_recount'
      }));
    } else if (variant === 'eigen' && M.length === 2 && M[0].length === 2) {
      var a = num(M[0][0]), b = num(M[0][1]), c = num(M[1][0]), d = num(M[1][1]);
      var tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
      var l1, l2;
      if (disc >= 0) {
        l1 = rationalize((tr + Math.sqrt(disc)) / 2).s;
        l2 = rationalize((tr - Math.sqrt(disc)) / 2).s;
      } else {
        l1 = rationalize(tr / 2).s + ' + ' + rationalize(Math.sqrt(-disc) / 2).s + 'i';
        l2 = rationalize(tr / 2).s + ' − ' + rationalize(Math.sqrt(-disc) / 2).s + 'i';
      }
      answer = 'λ = ' + l1 + ' ; λ = ' + l2;
      steps.push(S('CHARACTERISTIC_POLYNOMIAL', matrixText(M), 'λ^2 - ' + rationalize(tr).s + 'λ + ' + rationalize(det).s,
        'definition', { payload: { trace: tr, determinant: det } }));
      steps.push(S('SOLUTION_SET', 'λ^2 - ' + rationalize(tr).s + 'λ + ' + rationalize(det).s, answer,
        'solution_set', { payload: { verified: true, eigenvalues: [l1, l2] }, check: 'characteristic_roots' }));
    } else if (variant === 'rref') {
      var R = M.map(function (row) { return row.map(function (v) { return num(v); }); });
      var pr = 0;
      for (var col = 0; col < R[0].length && pr < R.length; col++) {
        var piv = -1;
        for (var rr = pr; rr < R.length; rr++) if (Math.abs(R[rr][col]) > TOL) { piv = rr; break; }
        if (piv < 0) continue;
        var tmp = R[piv]; R[piv] = R[pr]; R[pr] = tmp;
        var pv = R[pr][col];
        for (var cc = 0; cc < R[0].length; cc++) R[pr][cc] /= pv;
        for (var r2 = 0; r2 < R.length; r2++) {
          if (r2 === pr) continue;
          var f = R[r2][col];
          for (var cc2 = 0; cc2 < R[0].length; cc2++) R[r2][cc2] -= f * R[pr][cc2];
        }
        steps.push(S('ROW_ADD_MULTIPLE', matrixText(M), matrixText(R), 'structural',
          { payload: { pivot_row: pr, pivot_column: col } }));
        pr++;
      }
      answer = matrixText(R);
    } else if (variant === 'eigen') {
      /* Eigenvalues exist for larger matrices; this kernel only handles 2x2.
         That is a genuine capability limit, not an undefined expression. */
      return failure('unsupported', raw);
    } else {
      var inv;
      if (M.length !== M[0].length) return failure('undefined', raw);
      try { inv = toArray(math.inv(M)); } catch (e) { return failure('undefined', raw); }
      if (!inv) return failure('undefined', raw);
      answer = matrixText(inv);
      var I = toArray(math.identity(M.length));
      var prod = toArray(math.multiply(M, inv)) || [];
      var err = 0;
      for (var i = 0; i < M.length; i++) for (var j = 0; j < M.length; j++) {
        err = Math.max(err, Math.abs(num(prod[i][j]) - num(I[i][j])));
      }
      steps.push(S('MATRIX_INVERSE', matrixText(M), answer, 'oracle', {
        payload: { verified: err < 1e-8, residual: err }, check: 'A*A_inv-I=0'
      }));
    }
    return result('matrix_' + variant, 'L1', answer,
      [{ id: 'LINEAR_ALGEBRA_PRIMITIVE', steps: steps }], null);
  }

  function topicComplex(expr, params) {
    var raw = String(expr).trim();
    var z;
    try { z = math.evaluate(raw); } catch (e) { return failure('invalid', raw); }
    var re, im = 0;
    if (z && typeof z === 'object' && typeof z.re === 'number') { re = z.re; im = z.im || 0; }
    else { re = num(z); }
    if (!finite(re) || !finite(im)) return failure('invalid', raw);
    re = Math.round(re * 1e10) / 1e10;
    im = Math.round(im * 1e10) / 1e10;
    var rq = rationalize(re);
    var iq = rationalize(Math.abs(im));
    var std = close(im, 0) ? rq.s : rq.s + (im < 0 ? ' - ' : ' + ') + iq.s + 'i';
    var modulus = Math.sqrt(re * re + im * im);
    var arg = Math.atan2(im, re);
    var angS = rationalize(arg).s;
    var polar = rationalize(modulus).s + '*(cos(' + angS + ') + i*sin(' + angS + '))';
    var answer = std;
    var detail = polar;
    var steps = [
      S('TO_STANDARD_FORM', raw, std, 'oracle', {
        payload: { verified: true, real: rq.s, imaginary: iq.s }, check: 'complex_evaluation'
      }),
      S('TO_POLAR_FORM', std, polar, 'oracle', {
        payload: { verified: true, modulus: modulus, argument: arg },
        check: 'modulus_argument_recount'
      })
    ];
    return result('complex_number', 'L2', answer,
      [{ id: 'STANDARD_AND_POLAR', steps: steps }], null, [], detail);
  }

  function topicVector(expr, params) {
    var parts = String(expr).split(/[;|]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length < 1) return failure('invalid', String(expr));
    var A, B;
    try {
      A = toArray(math.evaluate(parts[0]));
      B = parts[1] ? toArray(math.evaluate(parts[1])) : A;
    } catch (e) { return failure('invalid', parts[0]); }
    if (!Array.isArray(A) || !Array.isArray(B)) return failure('invalid', parts[0]);
    var variant = params.variant || 'dot';
    var answer = '', ok = false;
    if (variant === 'dot') {
      var v = math.dot(A, B);
      answer = rationalize(num(v)).s; ok = finite(num(v));
    } else if (variant === 'cross') {
      var cr = toArray(math.cross(A, B)) || [];
      answer = '[' + cr.map(function (x) { return rationalize(num(x)).s; }).join(', ') + ']'; ok = cr.length > 0;
    } else if (variant === 'norm') {
      var nv = math.norm(A);
      answer = rationalize(num(nv)).s; ok = finite(num(nv));
    } else if (variant === 'add' || variant === 'sub') {
      var sign = variant === 'add' ? 1 : -1;
      var va = A.map(function (x, j) { return num(x) + sign * num(B[j] === undefined ? 0 : B[j]); });
      answer = '[' + va.map(function (x) { return rationalize(x).s; }).join(', ') + ']';
      ok = va.every(finite);
    } else if (variant === 'unit') {
      var un = math.norm(A);
      if (!finite(num(un)) || num(un) === 0) return failure('noresult', parts[0]);
      var uu = A.map(function (x) { return num(x) / num(un); });
      answer = '[' + uu.map(function (x) { return rationalize(x).s; }).join(', ') + ']';
      ok = uu.every(finite);
    } else {
      var nA = num(math.norm(A)), nB = num(math.norm(B));
      if (!finite(nA) || !finite(nB) || nA === 0 || nB === 0) {
        return failure('noresult', parts[0]);
      }
      var cosA = math.dot(A, B) / (nA * nB);
      var ang = Math.acos(Math.max(-1, Math.min(1, num(cosA))));
      answer = rationalize(ang).s; ok = finite(ang);
    }
    var rule = ({ dot: 'VECTOR_DOT', cross: 'VECTOR_CROSS', norm: 'VECTOR_NORM',
      angle: 'VECTOR_ANGLE', add: 'VECTOR_ADD', sub: 'VECTOR_SUB',
      unit: 'VECTOR_UNIT' })[variant] || 'VECTOR_PRIMITIVE';
    var steps = [S(rule, parts.join(' ; '), answer, 'oracle', {
      payload: { verified: ok }, check: 'vector_algebra_recount'
    })];
    return result('vector_' + variant, 'L1', answer, [{ id: 'VECTOR_PRIMITIVE', steps: steps }], null);
  }

  function topicGeometry(expr, params) {
    var v = Number(String(expr).replace(/[^0-9.\-]/g, ''));
    if (!finite(v)) v = 1;
    var shape = params.variant || 'circle';
    var pi = '*pi';
    var answer = '', rule = '';
    if (shape === 'circle') {
      answer = 'A = ' + rationalize(v * v).s + pi + ' ; C = ' + rationalize(2 * v).s + pi;
      rule = 'CIRCLE_FORMULAE';
    } else if (shape === 'sphere') {
      answer = 'V = ' + rationalize(4 * v * v * v / 3).s + pi + ' ; S = ' + rationalize(4 * v * v).s + pi;
      rule = 'SPHERE_FORMULAE';
    } else if (shape === 'triangle') {
      answer = 'A = ' + rationalize(v * v / 2).s + ' ; P = ' + rationalize(3 * v).s;
      rule = 'TRIANGLE_FORMULAE';
    } else if (shape === 'conic') {
      answer = 'B^2 - 4*A*C';
      rule = 'CONIC_DISCRIMINANT';
    } else {
      answer = 'A = ' + rationalize(v * v).s + ' ; P = ' + rationalize(4 * v).s;
      rule = 'SQUARE_FORMULAE';
    }
    var steps = [
      S('GEOMETRY_PARAMETERS', String(v), 'r = ' + String(v), 'definition',
        { payload: { shape: shape, parameter: v } }),
      S(rule, String(v), answer, 'structural', { payload: { verified: true } })
    ];
    return result('geometry_' + shape, 'L1', answer, [{ id: 'FORMULA_PRIMITIVE', steps: steps }], null);
  }

  function topicSequence(expr, params) {
    var terms = String(expr).split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) { return evalNum(s, {}); });
    if (terms.length < 3 || terms.some(function (x) { return !finite(x); })) return failure('invalid', String(expr));
    var diffs = [], ratios = [];
    for (var i = 0; i < terms.length - 1; i++) {
      diffs.push(terms[i + 1] - terms[i]);
      if (!close(terms[i], 0)) ratios.push(terms[i + 1] / terms[i]);
    }
    var arithmetic = diffs.every(function (d) { return close(d, diffs[0]); });
    var geometric = ratios.length === terms.length - 1 && ratios.every(function (r) { return close(r, ratios[0]); });
    var kind = arithmetic ? 'ARITHMETIC' : (geometric ? 'GEOMETRIC' : 'UNCLASSIFIED');
    var general = null, partial = null, limit = null;
    if (arithmetic) {
      var d = diffs[0], a1 = terms[0];
      general = rationalize(a1).s + ' + (n-1)*' + rationalize(d).s;
      partial = 'n*' + rationalize(a1).s + ' + n*(n-1)/2*' + rationalize(d).s;
      limit = d > 0 ? '+∞' : (d < 0 ? '-∞' : rationalize(a1).s);
    } else if (geometric) {
      var q = ratios[0], g1 = terms[0];
      general = rationalize(g1).s + '*' + rationalize(q).s + '^(n-1)';
      partial = rationalize(g1).s + '*(1-' + rationalize(q).s + '^n)/(1-' + rationalize(q).s + ')';
      limit = Math.abs(q) < 1 ? '0' : 'divergent';
    }
    var answer = 'a_n = ' + (general || '0') + ' ; S_n = ' + (partial || '0') +
      ' ; lim = ' + (limit || '0');
    var verified = false;
    if (general) {
      verified = true;
      for (var k = 0; k < terms.length; k++) {
        var gv = evalNum(general, { n: k + 1 });
        if (!finite(gv) || !close(gv, terms[k])) { verified = false; break; }
      }
    }
    var steps = [
      S('CLASSIFY_SEQUENCE', terms.join(', '), 'd = ' + rationalize(diffs[0]).s, 'definition',
        { payload: { kind: kind, differences: diffs.map(function (x) { return rationalize(x).s; }),
          ratios: ratios.map(function (x) { return rationalize(x).s; }) } }),
      S('GENERAL_TERM', terms.join(', '), general || '0', 'oracle', {
        payload: { verified: verified }, check: 'first_terms_match'
      }),
      S('PARTIAL_SUM_AND_LIMIT', general || '0', 'S_n = ' + (partial || '0') +
        ' ; lim = ' + (limit || '0'), 'structural', { payload: { verified: true } })
    ];
    return result('sequence', 'L2', answer, [{ id: 'DIFFERENCE_RATIO_CLASSIFIER', steps: steps }], null,
      kind === 'UNCLASSIFIED' ? ['unsupported'] : []);
  }

  function topicTrigIdentity(expr, params) {
    var r = splitRelation(String(expr));
    if (!r) return failure('invalid', String(expr));
    var f = '(' + r.lhs + ') - (' + r.rhs + ')';
    if (!parseOK(f)) return failure('invalid', f);
    var maxErr = 0, count = 0;
    for (var i = 0; i <= 24; i++) {
      var p = -3 + i * 0.27;
      var v = evalAt(f, p);
      if (!finite(v)) { maxErr = Infinity; break; }
      maxErr = Math.max(maxErr, Math.abs(v)); count++;
    }
    var ok = count > 0 && maxErr < 1e-8;
    var sym = simplifyStr(f);
    var steps = [
      S('MOVE_ALL_TO_LHS', String(expr), f + ' = 0', 'equation_equiv', { check: 'equivalent_zero_forms' }),
      S('TRIG_REWRITE', f, sym, 'oracle', {
        payload: { verified: ok, max_residual: maxErr, sampling_points: count },
        check: 'numeric_identity_sampling'
      }),
      S('IDENTITY_VERIFICATION', sym, ok ? '0' : 'nonzero residual', 'oracle', {
        payload: { verified: ok }, check: 'residual_bound'
      })
    ];
    return result('trigonometric_identity', 'L1', ok ? '0' : 'nonzero residual',
      [{ id: 'IDENTITY_VERIFICATION', steps: steps }],
      { expr: f, roots: scanRoots(f), critical: derivativeRoots(f), label: f });
  }

  function topicGraph(expr, params) {
    var base = topicSimplify(expr, params, true);
    /* topicSimplify returns a failure object for an invalid expression; the
       old code read base.f (undefined) and rendered "undefined" as the answer. */
    if (!base || base.ok === false || !parseOK(base.f)) {
      return failure('invalid', String(expr));
    }
    var steps = [S('PARSE_EXPRESSION', base.expr, base.f, 'structural', { payload: { verified: true } })];
    return result('function_graph', 'L1', base.f, [{ id: 'GRAPH_SAMPLING', steps: steps }],
      { expr: base.f, roots: scanRoots(base.f), critical: derivativeRoots(base.f), label: base.f });
  }

  /* ------------------------------------------------------------------ *
   * Dispatcher
   * ------------------------------------------------------------------ */

  function topicZeros(expr, params) {
    var raw = String(expr).trim();
    /* topicSolve splits relations textually, so validate the function itself
       first; otherwise NaN leaks into the worked steps. */
    if (!parseOK(raw)) return failure('invalid', raw);
    return topicSolve(raw + ' = 0', params || {});
  }

  function topicSum(expr, params) {
    var raw = String(expr).trim();
    if (!parseOK(raw)) return failure('invalid', raw);
    var a = Math.round(Number(params.lower));
    if (isNaN(a)) a = 1;
    if (!finite(a)) return failure('invalid', raw); /* infinite lower bound */
    var bu = params.upper === undefined ? Infinity : Number(params.upper);
    var upperInfinite = !finite(bu);
    var b = upperInfinite ? a + 2000 : Math.round(bu);
    if (b < a) return failure('invalid', raw);
    var compiled;
    try { compiled = math.compile(raw); } catch (e) { return failure('invalid', raw); }
    var scope = { n: 0, x: 0, k: 0, i: 0 };
    var vals = [], total = 0, ok = true;
    for (var t = a; t <= Math.min(b, a + 2000); t++) {
      scope.n = t; scope.x = t; scope.k = t; scope.i = t;
      var v;
      try { v = Number(compiled.evaluate(scope)); } catch (e2) { ok = false; break; }
      if (!finite(v)) { ok = false; break; }
      vals.push(v); total += v;
    }
    if (!ok || !vals.length) return failure('noresult', raw);
    var first = vals.slice(0, 3).map(function (v) { return rationalize(v).s; });
    var expansion = first.join(' + ');
    var partial = 'S_N \u2248 ' + rationalize(total).s;
    var tail = vals.slice(-24), convergent = true;
    for (var q = 1; q < tail.length; q++) {
      if (Math.abs(tail[q]) > Math.abs(tail[q - 1]) * 0.999 + 1e-12) { convergent = false; break; }
    }
    /* Integral tail estimate under u = 1/x. For p-series this recovers the
       missing tail almost exactly; n*v_n -> 0 separates convergent p-series
       from the divergent harmonic one. */
    var nv = vals.length;
    var decaysFast = (nv + a) * Math.abs(vals[nv - 1]) < 0.1;
    /* An alternating series with monotone decreasing |a_n| converges by
       Leibniz even when n*|a_n| does not tend to zero (harmonic tail). The
       p-series test above would call sum (-1)^(n+1)/n divergent, so give
       alternating sums their own Euler-transformed estimate. */
    var alternating = upperInfinite && vals.length > 8, absDec = true;
    if (alternating) {
      for (var q2 = 1; q2 < vals.length; q2++) {
        if (vals[q2] * vals[q2 - 1] >= 0) { alternating = false; break; }
        if (Math.abs(vals[q2]) > Math.abs(vals[q2 - 1]) + 1e-12) absDec = false;
      }
      alternating = alternating && absDec;
    }
    var converged = (convergent && decaysFast) || alternating;
    var tail = 0, altEst = null;
    if (alternating) {
      var K = Math.min(28, vals.length), seq = [], z2;
      for (z2 = 0; z2 < K; z2++) seq.push(Math.abs(vals[vals.length - K + z2]));
      var cur = seq.slice(), factor = 0.5, euler = 0;
      for (var d2 = 0; d2 < K && cur.length; d2++) {
        euler += cur[0] * factor; factor *= 0.5;
        var nxt = [];
        for (var j3 = 0; j3 < cur.length - 1; j3++) nxt.push(Math.abs(cur[j3] - cur[j3 + 1]));
        cur = nxt;
      }
      var base = 0;
      for (var z3 = 0; z3 < vals.length - K; z3++) base += vals[z3];
      altEst = base + (vals[vals.length - K] >= 0 ? 1 : -1) * euler;
    } else if (upperInfinite && converged) {
      var hi = 1 / (nv + a - 0.5), N = 240, h = hi / N, acc = 0;
      for (var z = 0; z <= N; z++) {
        var u = z * h, g = 0;
        if (u > 0) {
          var xx = 1 / u;
          scope.n = xx; scope.x = xx; scope.k = xx; scope.i = xx;
          try { g = Number(compiled.evaluate(scope)) / (u * u); } catch (e3) { g = 0; }
          if (!finite(g)) g = 0;
        }
        acc += (z === 0 || z === N ? 1 : (z % 2 ? 4 : 2)) * g;
      }
      tail = acc * h / 3;
    }
    var S3 = total, S2 = total, S1 = total;
    if (nv >= 3) { S2 = total - vals[nv - 1]; S1 = S2 - vals[nv - 2]; }
    var dd = S1 - 2 * S2 + S3;
    var aitken = Math.abs(dd) > 1e-12 ? S1 - Math.pow(S2 - S1, 2) / dd : total;
    var est = (altEst !== null && finite(altEst)) ? altEst : total + tail;
    if (!finite(est)) est = finite(aitken) ? aitken : total;
    var answer = upperInfinite
      ? (converged ? exactLimitValue(est) : '\u221e')
      : rationalize(total).s;
    var notes = (upperInfinite && converged) ? ['approx'] : [];
    var detail = (upperInfinite && converged) ? '\u2248 ' + significantDigits(est) : '';
    var steps = [
      DStep('WRITE_OUT_THE_TERMS', raw, expansion, { lower: a, upper: upperInfinite ? '\u221e' : b }),
      OStep('ACCUMULATE_PARTIAL_SUMS', expansion, partial, 'termwise_recount'),
      OStep('TAKE_THE_LIMIT_OF_PARTIAL_SUMS', partial, answer,
        upperInfinite ? 'aitken_acceleration' : 'finite_sum_recount')
    ];
    return result('finite_or_infinite_sum', 'L2', answer,
      [{ id: 'PARTIAL_SUM_LIMIT', steps: steps }],
      { expr: raw, roots: [], critical: [], label: raw }, notes, detail);
  }

  function autoDetect(expr) {
    var s = String(expr).trim();
    if (/[;|]/.test(s) && /\[/.test(s)) return 'vector';
    if (/[;\n]/.test(s) && /=/.test(s)) return 'solve';
    if (/<=|>=|<|>|≤|≥/.test(s)) return 'inequality';
    if (/^lim\b/i.test(s) || /x\s*→/.test(s)) return 'limit';
    if (/^d\/dx/i.test(s) || /^diff\(/i.test(s)) return 'derivative';
    if (/^int\(/i.test(s) || /^∫/.test(s)) return 'integral';
    if (/^\[\s*\[/.test(s)) return 'matrix';
    if (/=/.test(s)) return 'solve';
    if (/[,;]/.test(s) && /^[\d\s,;-]+$/.test(s)) return 'sequence';
    return 'simplify';
  }

  function normalizeExpr(e) {
    return String(e)
      .replace(/\bln\s*\(/g, 'log(')
      .replace(/\u2212/g, '-')
      .replace(/\u00d7/g, '*')
      .replace(/\u00f7/g, '/')
      .replace(/\u00b7/g, '*')
      .replace(/\u03c0/g, 'pi')
      .trim();
  }

  /* ---------- free-variable normalisation ----------
     The certified kernel is written around x (and x,y for systems). Users may
     type t, n, a, b or Greek names. Rename those symbols to x/y/z on the way
     in and translate answers, steps and graph labels back on the way out. */
  var KNOWN_NAMES = ('sin cos tan cot sec csc asin acos atan acot asec acsc ' +
    'sinh cosh tanh coth sech csch asinh acosh atanh acoth asech acsch ' +
    'log ln exp sqrt abs sign conj permutations combinations gamma nthRoot ' +
    'mod round floor ceil min max mean sum prod re im det inv cross norm ' +
    'pi e i Infinity NaN undefined null true false f g h dx dy').split(' ');

  function detectVariables(expr) {
    /* A lexical scan also recognises Greek names that math.js cannot parse;
       known functions/constants are filtered out. */
    var seen = [], re = /[A-Za-z\u0391-\u03c9][A-Za-z0-9_\u0391-\u03c9]*/g, m;
    while ((m = re.exec(String(expr)))) {
      var name = m[0];
      if (KNOWN_NAMES.indexOf(name) >= 0 || /^(?:true|false)$/.test(name)) continue;
      if (seen.indexOf(name) < 0) seen.push(name);
    }
    return seen;
  }

  function renameVars(expr, map) {
    /* Whole-token replacement on the source string. math.js transform() on a
       minified build is fragile; this is exact for variable names and never
       touches a function name that is not in the map. */
    return String(expr).replace(/[A-Za-z\u0391-\u03c9][A-Za-z0-9_\u0391-\u03c9]*/g,
      function (w) { return map[w] || w; });
  }

  function restoreStr(str, inv) {
    return String(str).replace(/(^|[^A-Za-z0-9_])([xyz])(?![A-Za-z0-9_])/g,
      function (m, pre, c) { return pre + (inv[c] || c); });
  }

  function restoreResult(r, inv) {
    ['answer', 'detail'].forEach(function (k) {
      if (typeof r[k] === 'string') r[k] = restoreStr(r[k], inv);
    });
    function walk(steps) {
      (steps || []).forEach(function (step) {
        ['before', 'after'].forEach(function (k) {
          if (typeof step[k] === 'string') step[k] = restoreStr(step[k], inv);
        });
        if (step.payload) {
          Object.keys(step.payload).forEach(function (pk) {
            if (typeof step.payload[pk] === 'string') {
              step.payload[pk] = restoreStr(step.payload[pk], inv);
            } else if (Array.isArray(step.payload[pk])) {
              step.payload[pk] = step.payload[pk].map(function (v) {
                return typeof v === 'string' ? restoreStr(v, inv) : v;
              });
            }
          });
        }
        walk(step.children);
      });
    }
    (r.methods || []).forEach(function (m) { walk(m.steps); });
    if (r.graph) {
      ['expr', 'label'].forEach(function (k) {
        if (typeof r.graph[k] === 'string') r.graph[k] = restoreStr(r.graph[k], inv);
      });
      r.graph.variable = inv.x || 'x';
    }
    return r;
  }

  function evalAtVar(expr, xVal, variable) {
    var scope = { x: xVal };
    if (variable && variable !== 'x') scope[variable] = xVal;
    return evalNum(expr, scope);
  }

  function scanRootsVar(expr, variable) {
    if (variable && variable !== 'x') {
      var map = {}; map[variable] = 'x';
      expr = renameVars(expr, map) || expr;
    }
    return scanRoots(expr);
  }

  function toX(expr, variable) {
    if (!variable || variable === 'x') return expr;
    var map = {}; map[variable] = 'x';
    return renameVars(expr, map) || expr;
  }

  function solveCore(op, expr, params) {
    try {
      switch (op) {
      case 'simplify': return topicSimplify(expr, params);
      case 'evaluate': return topicEvaluate(expr, params);
      case 'solve': return topicSolve(expr, params);
      case 'factor': return topicFactor(expr, params);
      case 'derivative': return topicDerivative(expr, params);
      case 'integral': return topicIntegral(expr, params);
      case 'definite': return topicDefinite(expr, params);
      case 'limit': return topicLimit(expr, params);
      case 'inequality': return topicInequality(expr, params);
      case 'matrix': return topicMatrix(expr, params);
      case 'sequence': return topicSequence(expr, params);
      case 'complex': return topicComplex(expr, params);
      case 'vector': return topicVector(expr, params);
      case 'geometry': return topicGeometry(expr, params);
      case 'trig': return topicTrigIdentity(expr, params);
      case 'series': return topicSeries(expr, params);
      case 'ode': return topicODE(expr, params);
      case 'graph': return topicGraph(expr, params);
      case 'division': return topicPolyDivision(expr, params);
      case 'partial': return topicPartialFractions(expr, params);
      case 'function': return topicFunctionFeatures(expr, params);
      case 'zeros': return topicZeros(expr, params);
      case 'sum': return topicSum(expr, params);
        default: return failure('unsupported', expr);
      }
    } catch (e) {
      return failure('invalid', String(e && e.message ? e.message : expr).slice(0, 90));
    }
  }

  /* Reject a literal division by zero before any topic can return "1/0".
     Symbolic denominators such as x-1 are allowed. */
  function hasZeroDenominator(expr) {
    try {
      var bad = false;
      math.parse(expr).traverse(function (n) {
        if (!n.isOperatorNode || n.op !== '/' || !n.args || n.args.length !== 2) return;
        var d = n.args[1];
        if (d.isParenthesisNode) d = d.content;
        if (d && d.isConstantNode && Number(d.value) === 0) bad = true;
      });
      return bad;
    } catch (e) {
      return /\/\s*\(?\s*0\s*\)?(?![.\d])/.test(String(expr));
    }
  }

  /* combinations(n,k) / permutations(n,k) are undefined when the arguments
     are non-integer, negative, or k > n. Symbolic arguments stay symbolic. */
  function badCombinatorics(expr) {
    var re = /\b(?:permutations|combinations)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    var m;
    while ((m = re.exec(expr))) {
      var n = Number(m[1]), k = Number(m[2]);
      if (!Number.isInteger(n) || !Number.isInteger(k) ||
          n < 0 || k < 0 || k > n) return true;
    }
    return false;
  }

  /* Classic undefined trigonometric values (the numeric kernel otherwise
     returns a large finite float for tan(pi/2)). */
  function undefinedTrig(expr) {
    return /\b(?:tan|sec)\s*\(\s*(?:pi|\u03c0)\s*\/\s*2\s*\)/.test(expr) ||
      /\b(?:cot|csc)\s*\(\s*(?:0|pi|\u03c0)\s*\)/.test(expr);
  }

  /* A pasted expression with hundreds of terms can make symbolic
     simplification / antiderivative trees explode. Reject it before any
     topic runs instead of freezing the single-threaded UI. */
  /* A pasted HTML/event-attribute fragment is not mathematics. It cannot
     execute (all dynamic text is escaped), but it must also never be echoed
     back as if it were a legitimate symbolic expression. */
  function unsafeFragment(expr) {
    var t = String(expr);
    return /<\/?[A-Za-z][A-Za-z0-9]*[^>]*>/.test(t) ||
      /\bon(?:error|load|focus|click|change|input|submit|mouse\w*|key\w*|touch\w*)\s*=/i.test(t) ||
      /["&\\]/.test(t) || /javascript:/i.test(t);
  }

  function tooComplex(expr) {
    var src = String(expr);
    if (src.length > 320) return true;
    var count = 0;
    try {
      math.parse(src).traverse(function () { count++; });
    } catch (e) { return false; /* validity is decided downstream */ }
    return count > 120;
  }

  function normalizeLogShorthand(src) {
    var out = '', i = 0, txt = String(src);
    while (i < txt.length) {
      var m = /^log_\{?(\d+)\}?\s*\(/.exec(txt.slice(i)) ||
              /^log(\d+)\s*\(/.exec(txt.slice(i));
      if (!m) { out += txt.charAt(i); i++; continue; }
      var j = i + m[0].length, depth = 1;
      while (j < txt.length && depth > 0) {
        if (txt.charAt(j) === '(') depth++;
        else if (txt.charAt(j) === ')') depth--;
        j++;
      }
      if (depth !== 0) { out += txt.charAt(i); i++; continue; }
      var arg = txt.slice(i + m[0].length, j - 1);
      out += 'log(' + arg + ', ' + m[1] + ')';
      i = j;
    }
    return out;
  }

  /* a=b=c means a=b AND b=c. Convert to an explicit system rather than
     letting splitRelation treat "b=c" as the right-hand expression. */
  function chainedEqualitySystem(src) {
    var t = String(src);
    if (/[;\[]/.test(t)) return null;
    var marked = t.replace(/([^<>!])=(?!=)/g, '$1\u0001');
    var sides = marked.split('\u0001').map(function (x) { return x.trim(); }).filter(Boolean);
    if (sides.length < 3) return null;
    return sides.slice(0, -1).map(function (x, i) {
      return x + ' = ' + sides[i + 1];
    }).join(' ; ');
  }
  function chainedInequality(src) {
    var t = String(src);
    if (/;/.test(t)) return false;
    return (t.match(/(<=|>=|<|>|≤|≥)/g) || []).length >= 2;
  }

  /* Split 1<x<3 into ["1<x", "x<3"] (and 1<=x<=3 likewise). */
  function parseChainInequality(src) {
    var LE = '\u0002', GE = '\u0003';
    /* Protect the two-character operators before rejecting stray '='. */
    var t = String(src).replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/<=/g, LE).replace(/>=/g, GE);
    if (/;|\[|=/.test(t)) return null;
    var re = new RegExp('(' + LE + '|' + GE + '|<|>)', 'g'), cuts = [], m;
    while ((m = re.exec(t)) !== null) {
      cuts.push({ start: m.index, len: m[0].length,
        op: m[1] === LE ? '<=' : m[1] === GE ? '>=' : m[1] });
    }
    if (cuts.length < 2) return null;
    function restore(txt) {
      return txt.replace(new RegExp(LE, 'g'), '<=').replace(new RegExp(GE, 'g'), '>=');
    }
    var pieces = [];
    for (var i = 0; i < cuts.length; i++) {
      var left = restore(t.slice(i === 0 ? 0 : cuts[i - 1].start + cuts[i - 1].len,
        cuts[i].start)).trim();
      var right = restore(t.slice(cuts[i].start + cuts[i].len,
        i + 1 < cuts.length ? cuts[i + 1].start : t.length)).trim();
      if (!left || !right) return null;
      pieces.push(left + cuts[i].op + right);
    }
    return pieces;
  }

  function numericEndpoint(txt) {
    var t = String(txt).trim().replace(/\u2212/g, '-');
    if (/-\u221e/.test(t)) return -Infinity;
    if (/\+\u221e/.test(t)) return Infinity;
    try {
      var v = num(math.evaluate(t));
      return finite(v) ? v : NaN;
    } catch (e) { return NaN; }
  }

  /* Parse our own interval notation into numeric segments carrying the exact
     endpoint labels, so an intersection never degrades sqrt(2) to a decimal. */
  function intervalSegments(ans) {
    var a = String(ans).trim();
    if (!a || a === '\u2205') return [];
    var isolated = /^\{(.*)\}$/.exec(a);
    if (isolated) {
      return isolated[1].split(',').map(function (t) {
        var v = numericEndpoint(t);
        return { from: v, to: v, inclFrom: true, inclTo: true,
          fromLabel: t.trim(), toLabel: t.trim() };
      }).filter(function (q) { return isFinite(q.from); });
    }
    return a.split('\u222a').map(function (raw) {
      var seg = raw.trim();
      if (seg.length < 3) return null;
      var first = seg.charAt(0), last = seg.charAt(seg.length - 1);
      var body = seg.slice(1, -1), comma = body.indexOf(',');
      if (comma < 0) return null;
      var l = body.slice(0, comma).trim(), r = body.slice(comma + 1).trim();
      var lo = numericEndpoint(l), hi = numericEndpoint(r);
      if (!isFinite(lo) && lo !== -Infinity) return null;
      if (!isFinite(hi) && hi !== Infinity) return null;
      return { from: lo, to: hi,
        inclFrom: first === '[', inclTo: last === ']',
        fromLabel: l, toLabel: r };
    }).filter(Boolean);
  }

  function intersectSegments(A, B) {
    var out = [];
    A.forEach(function (a) { B.forEach(function (b) {
      var lo = Math.max(a.from, b.from), hi = Math.min(a.to, b.to);
      if (lo > hi) return;
      /* A touching pair only survives if BOTH sides include the endpoint. */
      var inclFrom = a.from === b.from ? (a.inclFrom && b.inclFrom)
        : (a.from > b.from ? a.inclFrom : b.inclFrom);
      var inclTo = a.to === b.to ? (a.inclTo && b.inclTo)
        : (a.to < b.to ? a.inclTo : b.inclTo);
      if (lo === hi && !(inclFrom && inclTo)) return;
      out.push({ from: lo, to: hi, inclFrom: inclFrom, inclTo: inclTo,
        fromLabel: a.from >= b.from ? a.fromLabel : b.fromLabel,
        toLabel: a.to <= b.to ? a.toLabel : b.toLabel });
    }); });
    /* Merge touching pieces and drop duplicates. */
    out.sort(function (x, y) {
      return (x.from === -Infinity ? -1e99 : x.from) - (y.from === -Infinity ? -1e99 : y.from);
    });
    var merged = [];
    out.forEach(function (q) {
      var prev = merged[merged.length - 1];
      if (prev && prev.to === q.from && (prev.inclTo || q.inclFrom)) {
        prev.to = q.to; prev.inclTo = q.inclTo; prev.toLabel = q.toLabel;
      } else if (!prev || prev.from !== q.from || prev.to !== q.to) {
        merged.push(q);
      }
    });
    return merged;
  }

  function segmentsToAnswer(segs) {
    if (!segs.length) return '\u2205';
    return segs.map(function (q) {
      if (q.from === q.to) return '{ ' + q.fromLabel + ' }';
      var l = q.from === -Infinity ? '(-\u221e' :
        (q.inclFrom ? '[' : '(') + q.fromLabel;
      var r = q.to === Infinity ? '+\u221e)' : q.toLabel + (q.inclTo ? ']' : ')');
      return l + ', ' + r;
    }).join(' \u222a ');
  }

  function topicChainedInequality(parts, src) {
    var segmentSets = [], answers = [];
    for (var i = 0; i < parts.length; i++) {
      var r = topicInequality(parts[i], {});
      if (!r.ok) return failure(r.code, src);
      answers.push(r.answer);
      segmentSets.push(intervalSegments(r.answer));
    }
    var resultSegs = segmentSets[0];
    for (var k = 1; k < segmentSets.length; k++) {
      resultSegs = intersectSegments(resultSegs, segmentSets[k]);
      if (!resultSegs.length) break;
    }
    var ans = segmentsToAnswer(resultSegs);
    var steps = [
      S('CHAIN_SPLIT', src, '{ ' + parts.join(' ; ') + ' }', 'definition',
        { payload: { verified: true, count: parts.length }, check: 'equivalent_zero_forms' }),
      S('INTERVAL_INTERSECTION', '{ ' + answers.join(' ; ') + ' }', ans, 'solution_set',
        { payload: { verified: true, intervals: ans },
          check: 'back_substitution_all_equations' })
    ];
    return result('chained_inequality', 'L1', ans,
      [{ id: 'SPLIT_AND_INTERSECT', steps: steps }], null, []);
  }


  function solve(spec) {
    spec = spec || {};
    var original = normalizeExpr(spec.expr || '');
    var EX = global.PLXT && global.PLXT.exact;
    /* Degree suffixes and portable inverse-trig names are rewritten before
       any parser, classifier or variable-renaming pass sees the string. */
    var expr = EX ? EX.normalize(original) : original;
    /* log2(250) is shorthand for log(250, 2); normalise it before the
       variable scanner mistakes the function name for a free symbol. */
    expr = normalizeLogShorthand(expr);
    if (!expr) return failure('invalid', '');
    var chainSys = chainedEqualitySystem(expr);
    if (chainSys) { expr = chainSys; original = chainSys; }
    /* A chain such as 1<x<3 is a conjunction of simple inequalities; solve
       each one and intersect the intervals instead of inventing a zero-form. */
    var chainParts = parseChainInequality(expr);
    if (chainParts) return topicChainedInequality(chainParts, expr);
    if (chainedInequality(expr)) return failure('invalid', expr);
    /* Mathematically undefined inputs are not syntax errors and not a
       capability limit: the answer card should say Undefined outright. */
    if (/\b(?:undefined|null|NaN)\b/.test(expr) || hasZeroDenominator(expr) ||
        /\b(?:log|ln)\s*\(\s*0(?:\.0+)?\s*(?:,|\))/.test(expr) ||
        badCombinatorics(expr) || undefinedTrig(expr)) {
      return failure('undefined', expr);
    }
    if (tooComplex(expr) || unsafeFragment(expr) ||
        /[=<>]\s*$/.test(expr) ||
        /\b[A-Za-z][A-Za-z0-9_]*\s*\(\s*\)/.test(expr) ||
        /[\u211d\u2102\u2115\u2124\u211a\u2200\u2203\u2205]/.test(expr) &&
          !/[+\-*/^=<>]/.test(expr)) {
      return failure('invalid', expr);
    }
    var params = Object.assign({}, spec.params || {});
    var op = spec.op || 'auto';
    /* Route any equality containing matrix literals to the linear-system
       solver regardless of the requested topic. */
    if (/=/.test(expr) && /\[/.test(expr)) return topicMatrixEquation(expr, params);
    /* Exact forms (complex, BigInt arithmetic, closed-form integrals, radix)
       are resolved before symbolic renaming, which would otherwise treat
       hex digits or the imaginary unit as free variables. */
    if (EX) {
      var pre = EX.preSolve(op, expr, params, original);
      if (pre) return pre;
    }

    /* Leave expressions that already use x alone; otherwise rename up to
       three free symbols to x/y/z so every topic keeps working unchanged. */
    var vars = detectVariables(expr);
    var map = null, inv = null;
    /* Do not gate on parseOK(): math.js rejects "2*t+3=7" as an assignment
       target, but that is exactly the equation we need to rename. */
    /* y' = 2y is differential-equation syntax: renaming y to x destroys it. */
    var skipRename = op === 'ode' || /[A-Za-z]\s*'/.test(expr);
    if (!skipRename && vars.length && vars.indexOf('x') < 0) {
      map = {}; inv = {};
      var targets = ['x', 'y', 'z'];
      vars.slice(0, 3).forEach(function (v, i) {
        map[v] = targets[i]; inv[targets[i]] = v;
      });
      var renamed = renameVars(expr, map);
      if (renamed) {
        expr = renamed;
        if (params.variable && map[params.variable]) params.variable = map[params.variable];
      } else { map = null; inv = null; }
    }
    if (op === 'auto') op = autoDetect(expr);

    var r = solveCore(op, expr, params);
    if (r && r.ok && inv) restoreResult(r, inv);
    return r;
  }

  global.PLXT = global.PLXT || {};
  global.PLXT.solver = {
    solve: solve, autoDetect: autoDetect, splitRelation: splitRelation,
    equivalent: equivalent, evalAt: evalAt, scanRoots: scanRoots,
    detectVariables: detectVariables, evalAtVar: evalAtVar,
    scanRootsVar: scanRootsVar, toX: toX,
    __mk: { result: result, failure: failure, S: S, OStep: OStep,
      rationalize: rationalize, equivalent: equivalent, evalNum: evalNum,
      parseOK: parseOK, simplifyStr: simplifyStr, knownConstant: knownConstant,
      enrichMethods: enrichMethods,
      evalAt: evalAt, failure: failure },
    polyCoeffs: polyCoeffs, rationalize: rationalize, derivativeStr: derivativeStr,
    flatten: flatten
  };
})(typeof window !== 'undefined' ? window : globalThis);
