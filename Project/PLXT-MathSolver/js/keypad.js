/* On-screen keypad laid out as a reference calculator keypad. The basic page keeps the
   fixed 6x4 grid whose four right columns are always the numeric/operator
   block. Reference pages are full-width template grids: letters, Greek,
   functions, trigonometry, structures, calculus and relations. Keys with a
   red dot expose long-press alternates; a horizontal swipe selects one of
   them directly. */
(function (global) {
  'use strict';

  function def(M) {
    var n = M.num, s = M.sym, o = M.op, p = M.punct, h = M.hole;
    var K = function (label, make, extra) {
      var k = { label: label, make: make };
      if (extra) for (var x in extra) k[x] = extra[x];
      return k;
    };
    var A = function (label, act) { return { label: label, act: act }; };
    var SYM = function (label, value) {
      return K(label, function () { return s(value || label); });
    };
    var FN = function (label, name, withBase) {
      return K(label, function () {
        return withBase ? M.fn(name, [h('x')], withBase === true ? [h('b')] : withBase)
                       : M.fn(name, [h('x')]);
      });
    };

    var DIGITS = [
      ['7', '8', '9', '\u00f7'],
      ['4', '5', '6', '\u00d7'],
      ['1', '2', '3', '\u2212'],
      ['0', '.', '=', '+']
    ];
    function digit(lbl) {
      if (/^\d$/.test(lbl)) return K(lbl, function () { return n(Number(lbl)); });
      if (lbl === '.') return K('.', function () { return n('.'); });
      if (lbl === '=') return K('=', function () { return o('='); });
      return K(lbl, function () { return o(lbl); });
    }
    /* Basic page: two template columns + the invariant numeric block. */
    function page(id, name, short, left) {
      var keys = [];
      for (var r = 0; r < 4; r++) {
        keys.push(left[r * 2], left[r * 2 + 1]);
        for (var c = 0; c < 4; c++) keys.push(digit(DIGITS[r][c]));
      }
      return { id: id, name: name, short: short, keys: keys };
    }
    /* Reference pages: all 24 cells are templates, no numeric block. */
    function full(id, name, short, keys) {
      return { id: id, name: name, short: short, keys: keys, full: true };
    }

    var paren = function () { return M.paren([h('a')], '()'); };
    var frac = function () { return M.frac([h('a')], [h('b')]); };
    var sqrtN = function () { return M.radical([h('a')], [h('n')]); };
    var mat2 = function (variant) {
      return M.matrix([[[h('a')], [h('b')]], [[h('c')], [h('d')]]], variant);
    };
    /* Every cell is a dashed placeholder box, so a freshly inserted matrix
       is never silently solved with empty entries. */

    var limLo = function (variable) {
      return [s(variable || 'x'), o('\u2192'), h('a')];
    };
    var limKey = function (label, side) {
      return K(label, function () {
        return M.big('lim', [h('f(x)')], limLo('x'), side ? [o(side)] : null);
      }, { intent: 'limit' });
    };
    var derivKey = function (label, variable) {
      return K(label, function () {
        return M.big('deriv', [h('f(x)')], variable ? [s(variable)] : [h('x')]);
      }, { intent: 'derivative' });
    };
    var intKey = function (label, bounded) {
      return K(label, function () {
        return bounded ? M.big('intab', [h('f(x)')], [h('a')], [h('b')])
                       : M.big('int', [h('f(x)')]);
      }, { intent: bounded ? 'definite' : 'integral' });
    };
    var sumKey = function (label, upper) {
      return K(label, function () {
        return M.big('sum', [h('a\u2099')], [h('n=1')], [upper || h('\u221e')]);
      }, { intent: 'sum' });
    };
    var listKey = function (label) {
      return K(label, function () {
        return [h('a'), p(','), h('b'), p(','), s('\u22ef')];
      });
    };

    /* ------------------------------ pages ------------------------------ */
    var basic = page('basic', 'keypad.basic', ['+ \u2212', '\u00d7 \u00f7'], [
      K('( )', paren),
      K('>', function () { return o('>'); }),
      K('a/b', frac),
      K('\u221a', function () { return M.radical([h('a')]); }),
      A('x\u00b2', 'pow2'),
      K('x', function () { return s('x'); }),
      K('\u03c0', function () { return s('\u03c0'); }),
      K('n!', function () { return o('!'); })
    ]);

    var letters = full('letters', 'keypad.letters', ['abc', 'a\u2013x'],
      'a b c d e f g h i j k l m n o p q r s t u v w x'.split(' ')
        .map(function (c) { return SYM(c); }));

    var greek = full('greek', 'keypad.greek', ['\u03b1\u03b2\u03b3', 'y z'],
      ['y','z','\u03b1','\u03b2','\u03b3','\u03b4','\u03b5','\u03b6','\u03b7','\u03b8',
       '\u03b9','\u03ba','\u03bb','\u03bc','\u03bd','\u03c9','\u03c0','\u03c1',
       '\u03c3','\u03c4','\u03c5','\u03c6','\u03c7','\u03c8']
        .map(function (c) { return SYM(c); }));

    var symbols = full('symbols', 'keypad.symbols', ['\u0393\u0394\u03a9', '\u221e \u2202'], [
      SYM('\u03be'), SYM('\u0393'), SYM('\u0394'), SYM('\u0398'), SYM('\u039b'), SYM('\u039e'),
      SYM('\u03a0'), SYM('\u03a3'), SYM('\u03a6'), SYM('\u03a8'), SYM('\u03a9'),
      SYM('\u221e'), SYM('i'), SYM('e'), SYM('\u211d'), SYM('\u2202'),
      SYM('\u2207'), SYM('\u03bf'), SYM('%'), SYM('rad'),
      K('\u25a1\u00b0\u25a1\u2032\u25a1\u2033', function () {
        return [h('d'), o('\u00b0'), h('m'), o('\u2032'), h('s'), o('\u2033')];
      }),
      K('\u22ef', function () { return s('\u22ef'); }),
      K('\u2229', function () { return o('\u2229'); }),
      K('\u2208', function () { return o('\u2208'); })
    ]);

    var func = full('func', 'keypad.func', ['f(x) e', 'log ln'], [
      K('|a|', function () { return M.abs([h('a')]); }),
      FN('f(x)', 'f'),
      FN('log\u2081\u2080', 'log', [n(10)]),
      K('\u207f\u221a', sqrtN),
      SYM('i'),
      K('\u25a1,\u25a1', function () { return [h('a'), p(','), h('b')]; }),
      K('\u25a1^\u25a1', function () { return M.pow([h('a')], [h('b')]); }),
      K('f(\u25a1)', function () { return M.fn('f', [h('x')]); }),
      FN('log\u2082', 'log', [n(2)]),
      K('nPr', function () { return M.fn('permutations', [h('n')], [h('k')]); }),
      SYM('z'),
      K('!', function () { return o('!'); }),
      SYM('e'),
      K('f(x,y)', function () { return M.fn('f', [h('x'), p(','), h('y')]); }),
      FN('log\u2095', 'log', true),
      K('nCr', function () { return M.fn('combinations', [h('n')], [h('k')]); }),
      K('z\u0305', function () { return M.fn('conj', [h('z')]); }),
      K('2\u00d72', function () { return mat2('inv'); }, { intent: 'matrix', params: { variant: 'inv' } }),
      FN('exp', 'exp'),
      K('f(\u25a1,\u25a1)', function () { return M.fn('f', [h('a'), p(','), h('b')]); }),
      FN('ln', 'ln'),
      K('(a/b)', frac),
      FN('sign', 'sign'),
      K('|2\u00d72|', function () { return mat2('det'); }, { intent: 'matrix', params: { variant: 'det' } })
    ]);

    var TRIG = [
      ['sin','sin'], ['cos','cos'], ['tan','tan'], ['cot','cot'], ['sec','sec'], ['csc','csc'],
      ['arcsin','asin'], ['arccos','acos'], ['arctan','atan'], ['arccot','acot'],
      ['arcsec','asec'], ['arccsc','acsc'],
      ['sinh','sinh'], ['cosh','cosh'], ['tanh','tanh'], ['coth','coth'],
      ['sech','sech'], ['csch','csch'],
      ['arsinh','asinh'], ['arcosh','acosh'], ['artanh','atanh'], ['arcoth','acoth'],
      ['arsech','asech'], ['arcsch','acsch']
    ];
    var trig = full('trig', 'keypad.trig', ['sin cos', 'tan cot'],
      TRIG.map(function (t) { return FN(t[0], t[1]); }));

    var struct = full('struct', 'keypad.struct', ['( ) \u221a', 'x\u207f \u2211'], [
      K('(', function () { return p('('); }),
      K(')', function () { return p(')'); }),
      K('[', function () { return p('['); }),
      K(']', function () { return p(']'); }),
      K('( )', paren),
      K('[ ]', function () { return M.paren([h('a')], '[]'); }),
      K('{ }', function () { return M.setNode([h('a')]); }),
      K('|a|', function () { return M.abs([h('a')]); }),
      K('a/b', frac),
      K('\u207f\u221a', sqrtN),
      A('x\u207f', 'pown'),
      K('2\u00d72', function () { return mat2('inv'); }, { intent: 'matrix', params: { variant: 'inv' } }),
      K('{ \u22ee }', function () { return M.system([[], []]); }, { act: 'system' }),
      K('\u25a1,\u25a1,\u25a1', listKey('\u25a1,\u25a1,\u25a1').make),
      K('\u25a1\u00b0', function () { return M.pow([h('a')], [o('\u00b0')]); }),
      K('\u25a1\u2032', function () { return M.sym('x\u2032'); }),
      K('|2\u00d72|', function () { return mat2('det'); }, { intent: 'matrix', params: { variant: 'det' } }),
      K('a\u2099', function () { return M.sym('a_n'); }),
      K('\u2211', sumKey('\u2211').make, { intent: 'sum' }),
      K('\u221e', function () { return s('\u221e'); }),
      K('\u2229', function () { return o('\u2229'); }),
      K('n!', function () { return o('!'); }),
      K(';', function () { return p(';'); }),
      K('\u2248', function () { return o('\u2248'); })
    ]);
    /* The system key is an action, not a make(): rebuild it explicitly. */
    struct.keys[12] = A('{ \u22ee }', 'system');

    var calc = full('calc', 'keypad.calc', ['lim \u222b', '\u2211 \u221e'], [
      limKey('lim'), derivKey('d/dx', 'x'), intKey('\u222bdx', false),
      K('dy/dx', function () { return M.frac([h('d'), s('y')], [h('d'), s('x')]); }),
      K('a\u2099', function () { return M.sym('a_n'); }),
      K('\u25a1', function () { return h('x'); }),
      limKey('lim\u207a', '+'), derivKey('d/d\u25a1'), intKey('\u222bd\u25a1', false),
      K('dx', function () { return M.sym('dx'); }), listKey('\u25a1,\u25a1,\u2026'),
      K('lim\u207b', function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('\u2212')]); }, { intent: 'limit' }),
      K('d/d\u209c', function () { return M.big('deriv', [h('f(x)')], [s('t')]); }, { intent: 'derivative' }),
      intKey('\u222b\u2090\u1d47', true),
      K('dy', function () { return M.sym('dy'); }),
      K('\u211d', function () { return s('\u211d'); }),
      K('\u221e', function () { return s('\u221e'); }),
      sumKey('\u2211'),
      K('y\u2032', function () { return M.big('ode', [h('f(x,y)')]); }, { intent: 'ode' }),
      K('\u2202', function () { return s('\u2202'); }),
      K('\u2207', function () { return s('\u2207'); }),
      K('\u00b0', function () { return o('\u00b0'); }),
      K('i', function () { return s('i'); }),
      K('n', function () { return s('n'); })
    ]);

    var rel = full('rel', 'keypad.rel', ['= < >', '\u2264 \u2265 \u2260'], [
      K('\u2248', function () { return o('\u2248'); }),
      K('<', function () { return o('<'); }),
      K('>', function () { return o('>'); }),
      K('\u2264', function () { return o('\u2264'); }),
      K('\u2265', function () { return o('\u2265'); }),
      K('\u2260', function () { return o('\u2260'); }),
      K(';', function () { return p(';'); }),
      K(',', function () { return p(','); }),
      K('\u222a', function () { return o('\u222a'); }),
      K('\u2229', function () { return o('\u2229'); }),
      K('\u2208', function () { return o('\u2208'); }),
      K('\u2261', function () { return o('\u2261'); }),
      K('=', function () { return o('='); }),
      K('\u2192', function () { return o('\u2192'); }),
      K('\u00b1', function () { return o('\u00b1'); }),
      K('\u221e', function () { return s('\u221e'); }),
      K('\u2205', function () { return s('\u2205'); }),
      K('\u211d', function () { return s('\u211d'); }),
      K('\u2223', function () { return o('|'); }),
      K('\u2225', function () { return o('\u2225'); }),
      K('\u222a\u2229', function () { return o('\u2229'); }),
      K('\u2200', function () { return s('\u2200'); }),
      K('\u2203', function () { return s('\u2203'); }),
      K('\u2190', function () { return o('\u2190'); })
    ]);

    var pages = [basic, func, trig, struct, calc, rel];

    /* The "abc" tool opens one vertically scrollable symbol panel instead of
       three separate tabs. Constants with a mathematical meaning come first. */
    var SPECIAL = ['\u221e','\u03c0','e','i','\u03b8','\u03c9','\u0393','\u0394','\u03a9',
      '\u211d','\u2102','\u2115','\u2124','\u211a','\u2202','\u2207',
      '\u22ef','\u00b0','\u2032','\u2033','%','\u00b1'];
    var LATIN = 'abcdefghijklmnopqrstuvwxyz'.split('');
    var GREEK_LOW = ['\u03b1','\u03b2','\u03b3','\u03b4','\u03b5','\u03b6','\u03b7','\u03b8',
      '\u03b9','\u03ba','\u03bb','\u03bc','\u03bd','\u03be','\u03bf','\u03c0',
      '\u03c1','\u03c3','\u03c4','\u03c5','\u03c6','\u03c7','\u03c8','\u03c9'];
    var GREEK_CAP = ['\u0391','\u0392','\u0393','\u0394','\u0395','\u0396','\u0397','\u0398',
      '\u0399','\u039a','\u039b','\u039c','\u039d','\u039e','\u039f','\u03a0',
      '\u03a1','\u03a3','\u03a4','\u03a5','\u03a6','\u03a7','\u03a8','\u03a9'];
    var RELATIONS = ['\u2248','<','>','\u2264','\u2265','\u2260','\u2261','\u2192','\u2190',
      '\u222a','\u2229','\u2208','\u2282','\u2283','\u2200','\u2203','\u2205','\u2223','\u2225'];
    var OP_LIKE = { '<': 1, '>': 1, '\u2264': 1, '\u2265': 1, '\u2260': 1,
      '\u2248': 1, '\u00b1': 1, '\u222a': 1, '\u2229': 1, '\u2208': 1,
      '\u2261': 1, '\u2192': 1, '\u2190': 1, '%': 1, '\u2223': 1,
      '\u2225': 1, '\u2282': 1, '\u2283': 1 };
    function symbolKeys(list) {
      return list.map(function (c) {
        return K(c, OP_LIKE[c]
          ? function () { return o(c); }
          : function () { return s(c); });
      });
    }
    var SYMBOL_GROUPS = [
      { id: 'common', name: 'symbols.common', keys: symbolKeys(SPECIAL) },
      { id: 'latin', name: 'symbols.latin', keys: symbolKeys(LATIN) },
      { id: 'greek', name: 'symbols.greek', keys: symbolKeys(GREEK_LOW.concat(GREEK_CAP)) },
      { id: 'relations', name: 'symbols.relations', keys: symbolKeys(RELATIONS) }
    ];

    /* Radix and complex templates live in the same scrollable abc panel.
       Long-press or swipe cycles between the five conversion functions. */
    var BASE_DEFS = [
      ['bin(\u25a1)', 'bin', 1], ['hex(\u25a1)', 'hex', 1],
      ['oct(\u25a1)', 'oct', 1], ['dec(\u25a1)', 'dec', 1],
      ['base(\u25a1,\u25a1)', 'base', 2], ['conj(\u25a1)', 'conj', 1],
      ['|z|', 'abs', 1], ['arg(\u25a1)', 'arg', 1], ['i', null, 0],
      ['\u221a(\u22121)', null, 0], ['e^(i\u03c0)', null, 0], ['0x\u25a1', null, 0]
    ];
    function baseNode(name, arity, label) {
      if (name === null) {
        if (label === 'i') return s('i');
        if (label.indexOf('\u221a') === 0) {
          return M.radical([M.op('\u2212'), M.num(1)]);
        }
        if (label.indexOf('0x') === 0) return [s('0'), s('x'), h('F')];
        /* e^(i*pi): a genuine complex exponential, not an empty exponent. */
        return M.pow([M.sym('e')], [s('i'), o('*'), s('pi')]);
      }
      var args = arity === 2 ? [h('n'), p(',') ,h('r')] : [h('n')];
      return M.fn(name, args);
    }
    var baseKeys = BASE_DEFS.map(function (d) {
      var label = d[0], name = d[1], arity = d[2];
      var make = function () { return baseNode(name, arity, label); };
      var alts = BASE_DEFS.filter(function (x) { return x[0] !== label && x[1]; })
        .slice(0, 5).map(function (x) {
          return { label: x[0], make: function () { return baseNode(x[1], x[2], x[0]); } };
        });
      return K(label, make, { alts: alts });
    });
    SYMBOL_GROUPS.push({ id: 'numeric', name: 'symbols.numeric', keys: baseKeys });

    var tools = [
      A('abc', 'letters'), A('\u21b6', 'undo'), A('\u21b7', 'redo'),
      A('\u25c0', 'left'), A('\u25b6', 'right'),
      A('\u21b5', 'newline'), A('\u232b', 'back')
    ];
    /* Attach alternates by action, so adding the abc key cannot shift them. */
    tools.forEach(function (t) {
      if (t.act === 'back') t.alts = [{ label: 'AC', act: 'clear' }];
      if (t.act === 'newline') t.alts = [
        { label: '\u21b5', act: 'newline' },
        { label: '\u21b3', act: 'next' }
      ];
      /* "abc" is a single toggle now: one panel, no sub-menu. */
    });

    /* Long-press / swipe alternates. The first entry repeats the base key. */
    var MATRIX_SIZES = [];
    for (var mr = 1; mr <= 5; mr++) {
      for (var mc = 1; mc <= 5; mc++) {
        MATRIX_SIZES.push({ label: mr + '\u00d7' + mc, rows: mr, cols: mc });
      }
    }
    MATRIX_SIZES.picker = 'matrix';

   var ALTS = {
      '( )': [
        { label: '( )', make: paren },
        { label: '(', make: function () { return p('('); } },
        { label: ')', make: function () { return p(')'); } },
        { label: '[ ]', make: function () { return M.paren([h('a')], '[]'); } },
        { label: '{ }', make: function () { return M.setNode([h('a')]); } },
        { label: '|a|', make: function () { return M.abs([h('a')]); } }
      ],
      '(': [
        { label: '(', make: function () { return p('('); } },
        { label: ')', make: function () { return p(')'); } },
        { label: '[', make: function () { return p('['); } },
        { label: ']', make: function () { return p(']'); } },
        { label: '( )', make: paren }
      ],
      ')': [
        { label: ')', make: function () { return p(')'); } },
        { label: '(', make: function () { return p('('); } },
        { label: ']', make: function () { return p(']'); } },
        { label: '( )', make: paren }
      ],
      '>': [
        { label: '>', make: function () { return o('>'); } },
        { label: '<', make: function () { return o('<'); } },
        { label: '\u2264', make: function () { return o('\u2264'); } },
        { label: '\u2265', make: function () { return o('\u2265'); } },
        { label: '\u2260', make: function () { return o('\u2260'); } }
      ],
      'a/b': [
        { label: 'a/b', make: frac },
        { label: '1/x', make: function () { return M.frac([n(1)], [h('x')]); } }
      ],
      '\u221a': [
        { label: '\u221a', make: function () { return M.radical([h('a')]); } },
        { label: '\u207f\u221a', make: sqrtN }
      ],
      'x\u00b2': [
        { label: 'x\u00b2', act: 'pow2' },
        { label: 'x\u00b3', act: 'pow3' },
        { label: 'x\u207f', act: 'pown' }
      ],
      'x': [
        { label: 'x', make: function () { return s('x'); } },
        { label: 'y', make: function () { return s('y'); } },
        { label: 'z', make: function () { return s('z'); } },
        { label: 'n', make: function () { return s('n'); } },
        { label: 't', make: function () { return s('t'); } },
        { label: '\u03b8', make: function () { return s('\u03b8'); } }
      ],
      '\u03c0': [
        { label: '\u03c0', make: function () { return s('\u03c0'); } },
        { label: 'e', make: function () { return s('e'); } },
        { label: 'i', make: function () { return s('i'); } },
        { label: '\u221e', make: function () { return s('\u221e'); } },
        { label: '\u03b8', make: function () { return s('\u03b8'); } },
        { label: '%', make: function () { return o('%'); } },
        { label: '\u03c9', make: function () { return s('\u03c9'); } },
        { label: '\u03be', make: function () { return s('\u03be'); } },
        { label: '\u0393', make: function () { return s('\u0393'); } },
        { label: '\u03a9', make: function () { return s('\u03a9'); } }
      ],
      'sin': [
        { label: 'sin', make: function () { return M.fn('sin', [h('x')]); } },
        { label: 'cos', make: function () { return M.fn('cos', [h('x')]); } },
        { label: 'tan', make: function () { return M.fn('tan', [h('x')]); } },
        { label: 'arcsin', make: function () { return M.fn('asin', [h('x')]); } },
        { label: 'sinh', make: function () { return M.fn('sinh', [h('x')]); } }
      ],
      'cos': [
        { label: 'cos', make: function () { return M.fn('cos', [h('x')]); } },
        { label: 'sin', make: function () { return M.fn('sin', [h('x')]); } },
        { label: 'arccos', make: function () { return M.fn('acos', [h('x')]); } },
        { label: 'cosh', make: function () { return M.fn('cosh', [h('x')]); } }
      ],
      'tan': [
        { label: 'tan', make: function () { return M.fn('tan', [h('x')]); } },
        { label: 'cot', make: function () { return M.fn('cot', [h('x')]); } },
        { label: 'arctan', make: function () { return M.fn('atan', [h('x')]); } },
        { label: 'tanh', make: function () { return M.fn('tanh', [h('x')]); } }
      ],
      'log': [
        { label: 'log', make: function () { return M.fn('log', [h('x')]); } },
        { label: 'log\u2082', make: function () { return M.fn('log', [h('x')], [n(2)]); } },
        { label: 'log\u2081\u2080', make: function () { return M.fn('log', [h('x')], [n(10)]); } },
        { label: 'log\u2095', make: function () { return M.fn('log', [h('x')], [h('b')]); } },
        { label: 'ln', make: function () { return M.fn('ln', [h('x')]); } },
        { label: 'exp', make: function () { return M.fn('exp', [h('x')]); } }
      ],
      'log\u2082': [
        { label: 'log\u2082', make: function () { return M.fn('log', [h('x')], [n(2)]); } },
        { label: 'log\u2081\u2080', make: function () { return M.fn('log', [h('x')], [n(10)]); } },
        { label: 'log\u2095', make: function () { return M.fn('log', [h('x')], [h('b')]); } },
        { label: 'log', make: function () { return M.fn('log', [h('x')]); } }
      ],
      'log\u2081\u2080': [
        { label: 'log\u2081\u2080', make: function () { return M.fn('log', [h('x')], [n(10)]); } },
        { label: 'log\u2082', make: function () { return M.fn('log', [h('x')], [n(2)]); } },
        { label: 'log\u2095', make: function () { return M.fn('log', [h('x')], [h('b')]); } }
      ],
      'log\u2095': [
        { label: 'log\u2095', make: function () { return M.fn('log', [h('x')], [h('b')]); } },
        { label: 'log\u2082', make: function () { return M.fn('log', [h('x')], [n(2)]); } }
      ],
      'ln': [
        { label: 'ln', make: function () { return M.fn('ln', [h('x')]); } },
        { label: 'log', make: function () { return M.fn('log', [h('x')]); } }
      ],
      'exp': [
        { label: 'exp', make: function () { return M.fn('exp', [h('x')]); } },
        { label: 'e\u02e3', make: function () { return M.pow([s('e')], [h('x')]); } }
      ],
      '\u207f\u221a': [
        { label: '\u207f\u221a', make: sqrtN },
        { label: '\u221a', make: function () { return M.radical([h('a')]); } }
      ],
      '[ ]': [
        { label: '[ ]', make: function () { return M.paren([h('a')], '[]'); } },
        { label: '( )', make: paren },
        { label: '|a|', make: function () { return M.abs([h('a')]); } }
      ],
      '{ }': [
        { label: '{ }', make: function () { return M.setNode([h('a')]); } },
        { label: '( )', make: paren },
        { label: '{ \u22ee }', act: 'system' }
      ],
      '|a|': [
        { label: '|a|', make: function () { return M.abs([h('a')]); } },
        { label: '( )', make: paren }
      ],
      /* Long-pressing a matrix key opens a size picker. The array carries a
         marker so the keypad host renders a grid instead of a flat palette. */
      '2\u00d72': MATRIX_SIZES,
      '|2\u00d72|': MATRIX_SIZES,
      '\u222bdx': [
        { label: '\u222bdx', make: function () { return M.big('int', [h('f(x)')]); }, intent: 'integral' },
        { label: '\u222b\u2090\u1d47', make: function () { return M.big('intab', [h('f(x)')], [h('a')], [h('b')]); }, intent: 'definite' }
      ],
      '\u222bd\u25a1': [
        { label: '\u222bd\u25a1', make: function () { return M.big('int', [h('f(x)')]); }, intent: 'integral' },
        { label: '\u222b\u2090\u1d47', make: function () { return M.big('intab', [h('f(x)')], [h('a')], [h('b')]); }, intent: 'definite' }
      ],
      '\u222b\u2090\u1d47': [
        { label: '\u222b\u2090\u1d47', make: function () { return M.big('intab', [h('f(x)')], [h('a')], [h('b')]); }, intent: 'definite' },
        { label: '\u222bdx', make: function () { return M.big('int', [h('f(x)')]); }, intent: 'integral' }
      ],
      'lim': [
        { label: 'lim', make: function () { return M.big('lim', [h('f(x)')], limLo('x')); }, intent: 'limit' },
        { label: 'lim\u207a', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('+')]); }, intent: 'limit' },
        { label: 'lim\u207b', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('\u2212')]); }, intent: 'limit' },
        { label: 'x\u2192', make: function () { return o('\u2192'); } }
      ],
      'lim\u207a': [
        { label: 'lim\u207a', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('+')]); }, intent: 'limit' },
        { label: 'lim\u207b', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('\u2212')]); }, intent: 'limit' },
        { label: 'lim', make: function () { return M.big('lim', [h('f(x)')], limLo('x')); }, intent: 'limit' }
      ],
      'lim\u207b': [
        { label: 'lim\u207b', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('\u2212')]); }, intent: 'limit' },
        { label: 'lim\u207a', make: function () { return M.big('lim', [h('f(x)')], limLo('x'), [o('+')]); }, intent: 'limit' },
        { label: 'lim', make: function () { return M.big('lim', [h('f(x)')], limLo('x')); }, intent: 'limit' }
      ],
      'd/dx': [
        { label: 'd/dx', make: function () { return M.big('deriv', [h('f(x)')], [s('x')]); }, intent: 'derivative' },
        { label: 'd/d\u25a1', make: function () { return M.big('deriv', [h('f(x)')], [h('x')]); }, intent: 'derivative' },
        { label: 'd/d\u209c', make: function () { return M.big('deriv', [h('f(x)')], [s('t')]); }, intent: 'derivative' }
      ],
      'd/d\u25a1': [
        { label: 'd/d\u25a1', make: function () { return M.big('deriv', [h('f(x)')], [h('x')]); }, intent: 'derivative' },
        { label: 'd/dx', make: function () { return M.big('deriv', [h('f(x)')], [s('x')]); }, intent: 'derivative' }
      ],
      'y\u2032': [
        { label: 'y\u2032', make: function () { return M.big('ode', [h('f(x,y)')]); }, intent: 'ode' },
        { label: 'd/dx', make: function () { return M.big('deriv', [h('f(x)')], [s('x')]); }, intent: 'derivative' }
      ],
      '\u2211': [
        { label: '\u2211', make: function () { return M.big('sum', [h('a\u2099')], [h('n=1')], [h('\u221e')]); }, intent: 'sum' },
        { label: '\u2211\u2099', make: function () { return M.big('sum', [h('a\u2099')], [h('n=1')], [h('N')]); }, intent: 'sum' }
      ],
      'n': [
        { label: 'n', make: function () { return s('n'); } },
        { label: 'i', make: function () { return s('i'); } },
        { label: 'k', make: function () { return s('k'); } }
      ],
      '\u2248': [
        { label: '\u2248', make: function () { return o('\u2248'); } },
        { label: '=', make: function () { return o('='); } },
        { label: '\u2261', make: function () { return o('\u2261'); } }
      ],
      '=': [
        { label: '=', make: function () { return o('='); } },
        { label: '\u2260', make: function () { return o('\u2260'); } },
        { label: '\u2248', make: function () { return o('\u2248'); } }
      ],
      '<': [
        { label: '<', make: function () { return o('<'); } },
        { label: '\u2264', make: function () { return o('\u2264'); } },
        { label: '>', make: function () { return o('>'); } }
      ],
      '\u2264': [
        { label: '\u2264', make: function () { return o('\u2264'); } },
        { label: '<', make: function () { return o('<'); } },
        { label: '\u2265', make: function () { return o('\u2265'); } }
      ],
      '\u2265': [
        { label: '\u2265', make: function () { return o('\u2265'); } },
        { label: '>', make: function () { return o('>'); } },
        { label: '\u2264', make: function () { return o('\u2264'); } }
      ],
      '\u2260': [
        { label: '\u2260', make: function () { return o('\u2260'); } },
        { label: '=', make: function () { return o('='); } }
      ],
      ';': [
        { label: ';', make: function () { return p(';'); } },
        { label: ',', make: function () { return p(','); } }
      ],
      '\u222a': [
        { label: '\u222a', make: function () { return o('\u222a'); } },
        { label: '\u2229', make: function () { return o('\u2229'); } },
        { label: '\u2208', make: function () { return o('\u2208'); } }
      ]
    };
    /* Every full-width page key and the two basic template columns may show a
       red dot; the invariant numeric/operator block stays clean. */
    pages.forEach(function (pg) {
      pg.keys.forEach(function (k, i) {
        if ((pg.full || i % 6 < 2) && ALTS[k.label]) k.alts = ALTS[k.label];
      });
    });
    return { pages: pages, tools: tools, symbolGroups: SYMBOL_GROUPS };
  }

  global.PLXT = global.PLXT || {};
  global.PLXT.keypad = { def: def };
})(typeof window !== 'undefined' ? window : globalThis);
