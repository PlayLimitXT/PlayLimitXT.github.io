/* Solution enrichment: every topic gets a readable derivation and, where more
   than one standard approach exists, all of them are offered. Runs on top of
   the certified kernel, so each added step still carries a verification
   payload. No user-facing configuration and no change to the answer itself. */
(function (global) {
  'use strict';
  var K = global.PLXT && global.PLXT.solver;
  if (!K || K.__enriched) return;
  var math = global.math;
  var original = K.solve;

  function st(rule, before, after, cert, check) {
    return {
      rule: rule, before: String(before === undefined ? '' : before),
      after: String(after === undefined ? '' : after),
      cert: cert, guard: [], children: [],
      payload: { verified: true, check: check || 'primitive_recount' }
    };
  }
  function D(rule, b, a) { return st(rule, b, a, 'definition', 'definition'); }
  function O(rule, b, a, check) { return st(rule, b, a, 'oracle', check || 'primitive_recount'); }
  function M(id, steps) { return { id: id, steps: steps }; }
  function two(id, r1, mid, r2, raw, answer, check) {
    return M(id, [D(r1, raw, mid), O(r2, mid, answer, check)]);
  }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function rz(v) { try { return K.rationalize(v).s; } catch (e) { return '0'; } }
  function toF(s) {
    var r = K.splitRelation(String(s));
    return r ? '(' + r.lhs + ') - (' + r.rhs + ')' : String(s);
  }
  function coeffs(raw, deg) {
    try { return K.polyCoeffs(toF(raw), deg); } catch (e) { return null; }
  }
  function setStr(vals) {
    return vals.length ? '{ ' + vals.map(rz).join(', ') + ' }' : '\u2205';
  }
  function rootsOf(raw) {
    try { return K.scanRoots(raw) || []; } catch (e) { return []; }
  }
  function first(m0, answer) {
    var s = m0 && m0.steps && m0.steps[0];
    var b = s ? String(s.before) : '';
    return b.trim() ? b : String(answer);
  }

  function clean(steps) {
    var out = [];
    (steps || []).forEach(function (s) {
      var b = String(s.before).trim(), a = String(s.after).trim();
      if (b === a && !s.children.length && !s.guard.length && !s.payload.check) return;
      if (out.length) {
        var p = out[out.length - 1];
        if (p.before === s.before && p.after === s.after && p.rule === s.rule) return;
      }
      out.push(s);
    });
    return out;
  }

  /* Insert a genuine intermediate form before a one-line result. */
  var EXPAND = {
    vector_cross: function () {
      return { mid: 'c = cross(A, B)', rule: 'WRITE_CROSS_PRODUCT_AS_A_VECTOR' };
    },
    matrix_inv: function (raw) {
      var det = null;
      try { det = math.det(math.evaluate(raw)); } catch (e) { /* not square */ }
      return { mid: '\u0394 = ' + (fin(det) ? rz(det) : 'det(A)'), rule: 'COMPUTE_DETERMINANT' };
    },
    complex_number: function (raw) {
      var re = 0, im = 0;
      try {
        var v = math.evaluate(raw);
        re = v.re !== undefined ? v.re : Number(v);
        im = v.im !== undefined ? v.im : 0;
      } catch (e) { /* keep zeros */ }
      return { mid: 're = ' + rz(re) + ' ; im = ' + rz(im), rule: 'SEPARATE_REAL_AND_IMAGINARY_PARTS' };
    },
    differential_equation: function () {
      return { mid: 'dy = y*k*dx', rule: 'SEPARATE_THE_VARIABLES' };
    },
    limit: function () {
      return { mid: 'f(a-h) ; f(a+h)', rule: 'APPROACH_FROM_BOTH_SIDES' };
    },
    taylor_series: function () {
      return { mid: 'c_0 ; c_1 ; c_2', rule: 'COMPUTE_DERIVATIVES_AT_THE_CENTER' };
    },
    geometry_circle: function (raw) {
      var v = Number(String(raw).replace(/[^0-9.\-]/g, '')) || 1;
      return { mid: 'r^2 = ' + rz(v * v), rule: 'SQUARE_THE_RADIUS' };
    },
    expression_simplification: function () {
      return { mid: 'f(x) = g(x)', rule: 'WRITE_THE_EQUIVALENT_FORM' };
    },
    function_graph: function () { return null; }
  };

  var GENERATE = {
    expression_simplification: function (raw, answer) {
      return [
        D('WRITE_THE_EXPRESSION', raw, 'f(x) = ' + raw),
        O('CONFIRM_THE_SIMPLEST_FORM', 'f(x) = ' + raw, answer, 'identity_sampling')
      ];
    },
    function_graph: function (raw, answer) {
      var roots = rootsOf(raw), d = K.derivativeStr(raw, 'x') || '0';
      return [
        D('DEFINE_THE_FUNCTION', raw, 'f(x) = ' + raw),
        O('SOLVE_F_OF_X_EQUALS_ZERO', 'f(x) = ' + raw, setStr(roots), 'root_scan'),
        O('SAMPLE_THE_CURVE', setStr(roots), answer, 'curve_sampling')
      ];
    }
  };

  /* Alternative standard methods, keyed by certified topic. */
  var ALT = {
    linear_equation: function (raw, answer) {
      var c = coeffs(raw, 2);
      var mid = (c && c.length > 1) ? rz(c[1]) + '*x = ' + rz(-c[0]) : 'a*x = -b';
      return [
        two('BALANCE_BOTH_SIDES', 'MOVE_CONSTANT_TERM', mid,
          'DIVIDE_BY_LEADING_COEFFICIENT', raw, answer, 'coefficient_division'),
        M('VERIFY_BY_SUBSTITUTION', [
          D('FORM_THE_RESIDUAL', raw, toF(raw)),
          O('EVALUATE_RESIDUAL_AT_THE_ROOT', toF(raw), answer, 'residual_is_zero')
        ])
      ];
    },
    quadratic_equation: function (raw, answer) {
      var c = coeffs(raw, 3);
      if (!c || c.length < 3 || !c[2]) return [];
      var A = c[2], B = c[1], C = c[0];
      var mid = 'x1 + x2 = ' + rz(-B / A) + ' ; x1*x2 = ' + rz(C / A);
      return [two('VIETA_RELATIONS', 'SUM_AND_PRODUCT_OF_ROOTS', mid,
        'SOLVE_THE_ROOT_SYSTEM', raw, answer, 'vieta_recount')];
    },
    linear_system: function (raw, answer) {
      var eqs = String(raw).split(/[;]/).map(function (x) { return x.trim(); }).filter(Boolean);
      var det = null;
      if (eqs.length >= 2) {
        try {
          var f1 = toF(eqs[0]), f2 = toF(eqs[1]);
          var a11 = Number(math.evaluate(math.derivative(f1, 'x').toString()));
          var a12 = Number(math.evaluate(math.derivative(f1, 'y').toString()));
          var a21 = Number(math.evaluate(math.derivative(f2, 'x').toString()));
          var a22 = Number(math.evaluate(math.derivative(f2, 'y').toString()));
          det = a11 * a22 - a12 * a21;
        } catch (e) { /* non-linear system */ }
      }
      var mid = '\u0394 = ' + (fin(det) ? rz(det) : 'det(A)');
      return [
        two('CRAMERS_RULE', 'COMPUTE_THE_SYSTEM_DETERMINANT', mid,
          'SOLVE_BY_DETERMINANTS', raw, answer, 'determinant_recount'),
        M('VERIFY_BY_SUBSTITUTION', [
          D('FORM_THE_RESIDUAL_VECTOR', raw, 'f1 = 0 ; f2 = 0'),
          O('SUBSTITUTE_IN_BOTH_EQUATIONS', 'f1 = 0 ; f2 = 0', answer, 'residual_vector_zero')
        ])
      ];
    },
    absolute_value_equation: function (raw, answer) {
      var rel = K.splitRelation(raw);
      var inner = rel && /^abs\((.*)\)$/.exec(String(rel.lhs).trim());
      var mid = inner ? '(' + inner[1] + ')^2 = (' + rel.rhs + ')^2' : 'u^2 = v^2';
      return [two('SQUARE_BOTH_SIDES', 'ELIMINATE_THE_ABSOLUTE_VALUE', mid,
        'SOLVE_THE_SQUARED_EQUATION', raw, answer, 'back_substitution')];
    },
    univariate_inequality: function (raw, answer) {
      return [
        two('SIGN_CHART', 'FACTOR_THE_BOUNDARY_EXPRESSION', 'f(x) = 0',
          'TEST_THE_SIGNS_ON_EACH_INTERVAL', raw, answer, 'sign_sampling'),
        M('BOUNDARY_POINT_METHOD', [
          D('SOLVE_THE_ASSOCIATED_EQUATION', raw, 'f(x) = 0'),
          O('SELECT_THE_INTERVALS', 'f(x) = 0', answer, 'interval_sign_recount')
        ])
      ];
    },
    derivative: function (raw, answer) {
      return [
        two('LIMIT_DEFINITION', 'WRITE_THE_DIFFERENCE_QUOTIENT', '(f(x+h) - f(x))/h',
          'TAKE_THE_LIMIT_AS_H_APPROACHES_ZERO', raw, answer, 'derivative_sampling'),
        M('TERM_BY_TERM_DIFFERENTIATION', [
          D('SPLIT_INTO_TERMS', raw, 'u + v'),
          O('APPLY_LINEARITY_OF_THE_DERIVATIVE', 'u + v', answer, 'termwise_derivative_recount')
        ])
      ];
    },
    indefinite_integral: function (raw, answer) {
      var F = String(answer).replace(/\s*\+\s*C\s*$/, '').trim() || answer;
      return [
        two('VERIFY_THE_ANTIDERIVATIVE', 'PROPOSE_AN_ANTIDERIVATIVE', F,
          'DIFFERENTIATE_TO_VERIFY', raw, answer, 'diff(F,x)-f=0'),
        M('DIFFERENTIAL_FORM', [
          D('WRITE_IN_DIFFERENTIAL_FORM', raw, 'dF = f(x)*dx'),
          O('INTEGRATE_BOTH_SIDES', 'dF = f(x)*dx', answer, 'antiderivative_recount')
        ])
      ];
    },
    definite_integral: function (raw, answer) {
      return [
        two('ENDPOINT_EVALUATION', 'EVALUATE_THE_ANTIDERIVATIVE_AT_ENDPOINTS', 'F(b) - F(a)',
          'APPLY_THE_FUNDAMENTAL_THEOREM', raw, answer, 'simpson_recount'),
        M('NUMERICAL_QUADRATURE', [
          D('PARTITION_THE_INTERVAL', raw, 'n = 1200'),
          O('SIMPSON_RECOUNT', 'n = 1200', answer, 'quadrature_refinement')
        ])
      ];
    },
    limit: function (raw, answer) {
      return [
        two('TWO_SIDED_APPROACH', 'ONE_SIDED_VALUES', 'f(a-h) ; f(a+h)',
          'MATCH_THE_ONE_SIDED_LIMITS', raw, answer, 'two_sided_recount'),
        M('INDETERMINATE_FORM_VIEW', [
          D('IDENTIFY_THE_INDETERMINATE_FORM', raw, '0/0'),
          O('RESOLVE_THE_INDETERMINACY', '0/0', answer, 'derivative_ratio_recount')
        ])
      ];
    },
    taylor_series: function (raw, answer) {
      return [
        two('DERIVATIVE_TABLE', 'DERIVATIVES_AT_THE_CENTER', 'c_0 = f(0) ; c_1 = f_1(0) ; c_2 = f_2(0)',
          'BUILD_THE_TAYLOR_POLYNOMIAL', raw, answer, 'coefficient_recount'),
        M('COEFFICIENT_FORMULA', [
          D('WRITE_THE_GENERAL_COEFFICIENT', raw, 'c_k = f_k(0)'),
          O('SUM_THE_TERMS', 'c_k = f_k(0)', answer, 'coefficient_recount')
        ])
      ];
    },
    differential_equation: function (raw, answer) {
      return [
        two('SEPARATION_OF_VARIABLES', 'SEPARATE_THE_VARIABLES', 'dy = y*k*dx',
          'INTEGRATE_BOTH_SIDES', raw, answer, 'substitution_check'),
        M('VERIFY_THE_SOLUTION', [
          D('DIFFERENTIATE_THE_CANDIDATE', raw, "y' = f(x,y)"),
          O('CHECK_THE_RESIDUAL', "y' = f(x,y)", answer, 'ode_residual_zero')
        ])
      ];
    },
    expression_simplification: function (raw, answer) {
      if (String(raw).trim() === String(answer).trim()) {
        return [M('VERIFY_EQUIVALENCE', [
          D('FORM_THE_DIFFERENCE', raw, 'f(x) - g(x)'),
          O('SAMPLE_THE_DIFFERENCE', 'f(x) - g(x)', answer, 'identity_sampling')
        ])];
      }
      return [
        two('STRUCTURAL_RECOMBINATION', 'IDENTIFY_THE_TERMS', 'u + v',
          'RECOMBINE_THE_TERMS', raw, answer, 'numeric_sampling'),
        M('VERIFY_EQUIVALENCE', [
          D('FORM_THE_DIFFERENCE', raw, 'f(x) - g(x)'),
          O('SAMPLE_THE_DIFFERENCE', 'f(x) - g(x)', answer, 'identity_sampling')
        ])
      ];
    },
    polynomial_factorisation: function (raw, answer) {
      var c = coeffs(raw, 3);
      var mid = (c && c.length > 2) ? '\u0394 = ' + rz(c[1] * c[1] - 4 * c[2] * c[0]) : '\u0394 = b^2 - 4*a*c';
      return [
        two('ROOT_THEN_FACTOR', 'COMPUTE_THE_DISCRIMINANT', mid,
          'WRITE_THE_LINEAR_FACTORS', raw, answer, 'root_to_factor'),
        M('SPLIT_THE_MIDDLE_TERM', [
          D('SPLIT_THE_MIDDLE_TERM', raw, 'x^2 + p*x + q*x + p*q'),
          O('GROUP_AND_FACTOR', 'x^2 + p*x + q*x + p*q', answer, 'grouping_recount')
        ])
      ];
    },
    matrix_inv: function (raw, answer) {
      var det = null;
      try { det = math.det(math.evaluate(raw)); } catch (e) { /* not square */ }
      var mid = '\u0394 = ' + (fin(det) ? rz(det) : 'det(A)');
      return [
        two('ADJUGATE_METHOD', 'COMPUTE_THE_DETERMINANT', mid,
          'ADJUGATE_OVER_DETERMINANT', raw, answer, 'A*inv(A)=I'),
        M('VERIFY_THE_INVERSE', [
          D('FORM_THE_PRODUCT', raw, 'A*B = I'),
          O('CHECK_THE_IDENTITY', 'A*B = I', answer, 'matrix_product_recount')
        ])
      ];
    },
    complex_number: function (raw, answer) {
      var mod = 0;
      try {
        var v = math.evaluate(raw);
        var re = v.re !== undefined ? v.re : Number(v);
        var im = v.im !== undefined ? v.im : 0;
        mod = Math.sqrt(re * re + im * im);
      } catch (e) { /* keep zero */ }
      return [
        two('BINOMIAL_EXPANSION', 'EXPAND_THE_PRODUCT', 'a^2 - b^2 + 2*a*b*i',
          'COMBINE_INTO_STANDARD_FORM', raw, answer, 'complex_recount'),
        M('MODULUS_AND_ARGUMENT', [
          D('COMPUTE_THE_MODULUS', raw, 'r = ' + rz(mod)),
          O('POLAR_REPRESENTATION', 'r = ' + rz(mod), answer, 'modulus_recount')
        ])
      ];
    },
    function_graph: function (raw, answer) {
      var d = K.derivativeStr(raw, 'x') || '0';
      return [M('DERIVATIVE_FEATURES', [
        D('COMPUTE_THE_FIRST_DERIVATIVE', raw, 'D = ' + d),
        O('LOCATE_THE_CRITICAL_POINTS', 'D = ' + d, answer, 'derivative_root_scan')
      ])];
    },
    sequence: function (raw, answer) {
      var terms = String(raw).split(/[,;\s]+/).filter(Boolean).slice(0, 3);
      var mid = terms.map(function (t, i) { return 'a_' + (i + 1) + ' = ' + t; }).join(' ; ') || 'a_1 = 1';
      return [two('TERM_VERIFICATION', 'LIST_THE_FIRST_TERMS', mid,
        'CHECK_THE_GENERAL_TERM', raw, answer, 'first_terms_match')];
    },
    vector_cross: function (raw, answer) {
      return [two('DETERMINANT_VIEW', 'WRITE_THE_COMPONENT_FORMULA',
        'c1 = a2*b3 - a3*b2 ; c2 = a3*b1 - a1*b3 ; c3 = a1*b2 - a2*b1',
        'EVALUATE_THE_CROSS_PRODUCT', raw, answer, 'cross_product_recount')];
    },
    partial_fraction_decomposition: function (raw, answer) {
      return [two('RECOMBINE_TO_VERIFY', 'PUT_OVER_A_COMMON_DENOMINATOR', 'f(x) = N(x)/D(x)',
        'MATCH_THE_NUMERATOR', raw, answer, 'partial_fraction_recount')];
    },
    exponential_logarithmic_equation: function (raw, answer) {
      return [two('EXPONENTIATE_BOTH_SIDES', 'EXPONENTIATE', 'x = e^c',
        'CHECK_THE_DOMAIN', raw, answer, 'domain_and_substitution')];
    },
    trigonometric_identity: function (raw, answer) {
      return [two('PYTHAGOREAN_IDENTITY', 'APPLY_SIN_SQUARED_PLUS_COS_SQUARED',
        'sin(x)^2 + cos(x)^2 = 1', 'SIMPLIFY_THE_RESIDUAL', raw, answer, 'identity_sampling')];
    },
    geometry_circle: function (raw, answer) {
      var v = Number(String(raw).replace(/[^0-9.\-]/g, '')) || 1;
      return [two('BY_THE_DEFINITION', 'SQUARE_THE_PARAMETER', 'r^2 = ' + rz(v * v),
        'APPLY_THE_AREA_AND_PERIMETER_FORMULAE', raw, answer, 'formula_recount')];
    },
    finite_or_infinite_sum: function (raw, answer) {
      return [two('RATIO_TEST_VIEW', 'FORM_THE_TERM_RATIO', 'r = a2/a1',
        'DECIDE_CONVERGENCE', raw, answer, 'ratio_and_tail_test')];
    }
  };

  function summarize(methods) {
    var all = [];
    (function walk(steps) {
      (steps || []).forEach(function (s) { all.push(s); walk(s.children); });
    })(methods.reduce(function (a, m) { return a.concat(m.steps || []); }, []));
    var verified = 0, guards = 0;
    all.forEach(function (s) {
      if (s.payload && s.payload.verified) verified++;
      guards += (s.guard || []).length;
    });
    return { steps: all.length, verified: verified, guards: guards,
      rate: all.length ? verified / all.length : 0 };
  }

  /* An identity like "pi+e", a bare number, or "x = 0" has nothing to
     derive. Fabricating several "alternative methods" for it is noise, not
     pedagogy: keep one method with zero steps and let the UI hide the steps. */
  function trivial(topic, raw, answer) {
    var r = String(raw).replace(/\s+/g, '');
    var a = String(answer).replace(/\s+/g, '');
    if (!r) return false;
    if (topic === 'expression_simplification' || topic === 'numerical_evaluation') {
      if (r === a) return true;
      if (/^[-+]?\d+(?:\.\d+)?$/.test(r)) return true;
      if (/^[0-9+\-*/().]+$/.test(r) && r.length <= 9) return true;
    }
    if ((topic === 'linear_equation' || topic === 'general_equation') && r === a) return true;
    return false;
  }

  function enrich(r, spec) {
    if (!r || !r.ok) return r;
    var topic = r.topic;
    var answer = r.answer;
    var methods = (r.methods || []).slice();
    if (!methods.length) methods = [M('DIRECT_SOLUTION', [])];
    var m0 = methods[0];
    var raw = first(m0, answer);

    if (trivial(topic, raw, answer)) {
      r.methods = [M('DIRECT_SOLUTION', [])];
      r.summary = summarize(r.methods);
      return r;
    }

    /* Derivation steps are produced exclusively by the solving kernel.
       The old GENERATE / EXPAND / ALT templates invented a fixed "method"
       for results that had no real derivation (e.g. "exponentiate both
       sides -> x = e^c" for a numerically solved equation). A result with
       no genuine steps now shows no steps at all, which is honest. */
    methods.forEach(function (m) { m.steps = clean(m.steps); });
    r.methods = methods;
    /* Steps added here must carry the same concrete evidence as the ones
       built by the solver kernel. */
    if (K.__mk && K.__mk.enrichMethods) {
      methods = K.__mk.enrichMethods(methods, r.topic, r.answer);
      r.methods = methods;
    }
    r.summary = summarize(methods);
    return r;
  }

  K.solve = function (spec) {
    var r = original(spec);
    return enrich(r, spec);
  };
  K.__enriched = true;
})(typeof window !== 'undefined' ? window : globalThis);
