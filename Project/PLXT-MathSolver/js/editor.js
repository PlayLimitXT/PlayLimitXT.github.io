/* Visual math editor. The caret is a position inside a box tree: arrow keys
   enter and leave child boxes, backspace deletes one atom at a time and
   eventually removes the container itself. No text editing happens here. */
(function (global) {
  'use strict';
  var M = global.PLXT.model;
  var R = global.PLXT.render;

  function sibling(row, delta) {
    var p = row.__p;
    if (!p || !p.node) return null;
    var kids = M.childRows(p.node);
    var j = kids.indexOf(row);
    if (j < 0) return null;
    var k = j + delta;
    return (k >= 0 && k < kids.length) ? kids[k] : null;
  }

  function applyVariant(root, params) {
    if (!params || !params.variant) return;
    (function walk(r) {
      r.forEach(function (n) {
        if (n.t === 'matrix' && !n.variant) n.variant = params.variant;
        M.childRows(n).forEach(walk);
      });
    })(root);
  }

  function Editor(host, onChange) {
    this.host = host;
    this.onChange = onChange || function () {};
    this.root = M.row();
    this.caret = { row: this.root, index: 0 };
    this.selection = null;
    this.intent = null;
    this.params = {};
    this.history = [];
    this.future = [];
    this.map = {};
    M.linkTree(this.root);
  }

  Editor.prototype.snapshot = function () {
    return JSON.stringify(this.root, function (k, v) {
      if (k === '__p') return undefined;
      return v;
    });
  };

  Editor.prototype.push = function () {
    this.history.push(this.snapshot());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  };

  Editor.prototype.undo = function () {
    if (!this.history.length) return;
    this.future.push(this.snapshot());
    try { this.root = JSON.parse(this.history.pop()); } catch (e) { return; }
    M.linkTree(this.root);
    this.selection = null;
    this.caret = { row: this.root, index: this.root.length };
    this.changed();
  };

  Editor.prototype.redo = function () {
    if (!this.future.length) return;
    this.history.push(this.snapshot());
    try { this.root = JSON.parse(this.future.pop()); } catch (e) { return; }
    M.linkTree(this.root);
    this.selection = null;
    this.caret = { row: this.root, index: this.root.length };
    this.changed();
  };

  Editor.prototype.changed = function () {
    M.linkTree(this.root);
    /* When the last box is deleted the template intent must die with it;
       otherwise the next expression is solved with the previous topic. */
    if (!this.root.length) { this.intent = null; this.params = {}; }
    this.render();
    this.onChange();
  };

  Editor.prototype.render = function () {
    var self = this;
    var selectedNode = this.selection && this.selection.row[this.selection.index];
    var out = R.into(this.host, this.root, {
      caretRow: this.caret.row,
      caretIndex: this.caret.index,
      selected: selectedNode,
      onPick: function (hit) { self.pick(hit); }
    });
    this.map = out.map;
    this.rows = out.rows;
  };

  Editor.prototype.pick = function (hit) {
    var row = hit.row;
    if (!row) return;
    var idx = Math.max(0, Math.min(hit.index, row.length));
    if (hit.leafUid && !hit.onChrome) {
      var found = this.map[hit.leafUid];
      if (found && found.row === row) {
        this.selection = { row: row, index: found.index };
        this.caret = { row: row, index: found.index + 1 };
        this.render();
        return;
      }
    }
    this.selection = null;
    this.caret = { row: row, index: idx };
    this.render();
  };

  /* Remove an adjacent placeholder so filling a dashed box replaces it. */
  Editor.prototype.consumeHole = function (r, i) {
    if (r[i] && r[i].t === 'hole') { r.splice(i, 1); return i; }
    if (i > 0 && r[i - 1] && r[i - 1].t === 'hole') { r.splice(i - 1, 1); return i - 1; }
    return i;
  };

  Editor.prototype.insert = function (node, intent, params) {
    this.push();
    /* A key may produce a short row of boxes (a,b or a degree/minute/second
       template), not just one node. */
    var nodes = Array.isArray(node) ? node : [node];
    var r = this.caret.row, i = Math.max(0, Math.min(this.caret.index, r.length));
    if (this.selection) {
      r = this.selection.row;
      i = this.selection.index;
      r.splice.apply(r, [i, 1].concat(nodes));
      this.selection = null;
    } else {
      i = this.consumeHole(r, i);
      r.splice.apply(r, [i, 0].concat(nodes));
    }
    if (intent) this.intent = intent;
    if (params) for (var k in params) this.params[k] = params[k];
    M.linkTree(this.root);
    var box = null;
    for (var q = 0; q < nodes.length && !box; q++) box = M.firstBox(nodes[q]);
    if (box) this.caret = { row: box, index: box.length };
    else this.caret = { row: r, index: i + nodes.length };
    this.changed();
  };

  /* Suffix template: attach an exponent to the atom immediately left of the
     caret. Pressing x² after 7 produces 7², never an extra x. */
  Editor.prototype.suffixPower = function (exponent, enterExponent) {
    this.push();
    var r = this.caret.row, i = Math.max(0, Math.min(this.caret.index, r.length));
    var pw, base;
    if (this.selection) {
      r = this.selection.row; i = this.selection.index;
      base = r[i];
      pw = M.pow([base], exponent.slice());
      r.splice(i, 1, pw);
      this.selection = null;
    } else if (i > 0) {
      base = r[i - 1];
      pw = M.pow([base], exponent.slice());
      r.splice(i - 1, 1, pw);
    } else {
      pw = M.pow([M.hole('a')], exponent.slice());
      r.splice(i, 0, pw);
      this.caret = { row: pw.a, index: 0 };
      M.linkTree(this.root);
      this.changed();
      return;
    }
    M.linkTree(this.root);
    if (enterExponent) {
      this.caret = { row: pw.b, index: pw.b.length };
      if (pw.b.length === 1 && pw.b[0].t === 'hole') {
        this.selection = { row: pw.b, index: 0 };
      }
    } else {
      var at = r.indexOf(pw);
      this.caret = { row: r, index: at + 1 };
    }
    this.changed();
  };

  Editor.prototype.backspace = function () {
    this.push();
    if (this.selection) {
      var sr = this.selection.row, si = this.selection.index;
      sr.splice(si, 1);
      this.caret = { row: sr, index: si };
      this.selection = null;
      this.changed();
      return;
    }
    var r = this.caret.row, i = this.caret.index;
    if (i > 0) {
      /* Backspace always consumes the node immediately left of the caret.
         It must never jump to a sibling row: that used to delete a base while
         leaving an orphan exponent, or remove a symbol on the right. */
      var node = r[i - 1], last = M.lastBox(node);
      if (last && last.length) {
        var single = last.length === 1;
        var popped = last.pop();
        var atomic = popped && (popped.t === 'num' || popped.t === 'sym' ||
          popped.t === 'hole' || popped.t === 'op' || popped.t === 'punct');
        if (!atomic) {
          /* A compound exponent such as (a+b) is edited atom by atom: put
             the caret inside its last sub-box instead of deleting the whole
             power in one keystroke. */
          last.push(popped);
          var inner = M.lastBox(popped);
          this.caret = inner ? { row: inner, index: inner.length }
                            : { row: last, index: last.length };
          this.changed();
          return;
        }
        if (single && !last.length) {
          /* An emptied container is collapsed in place. A power falls back to
             its base (x^2 -> x); a fraction promotes its remaining side;
             other wrappers are removed as a whole. */
          var at = i - 1, repl = null;
          if (node.t === 'pow') repl = node.a.slice();
          else if (node.t === 'frac') repl = (node.a.length ? node.a : node.b).slice();
          if (repl && repl.length) {
            r.splice.apply(r, [at, 1].concat(repl));
            this.caret = { row: r, index: at + repl.length };
          } else {
            r.splice(at, 1);
            this.caret = { row: r, index: at };
          }
        } else {
          this.caret = { row: last, index: last.length };
        }
      } else {
        r.splice(i - 1, 1);
        this.caret = { row: r, index: i - 1 };
      }
    } else {
      /* At offset zero of a nested box, remove the parent container from its
         own parent row. Never delete from an adjacent child box. */
      var p = r.__p;
      if (p && p.node && p.row) {
        /* Inside a brace system, backspace at the start of a line removes
           THAT line, not the whole brace. Only the last remaining line
           collapses the system itself. */
        if (p.node.t === 'system') {
          var lineIdx = p.node.rows.indexOf(r);
          if (lineIdx >= 0) {
            if (p.node.rows.length > 1) {
              p.node.rows.splice(lineIdx, 1);
              var keep = p.node.rows[Math.max(0, lineIdx - 1)];
              this.caret = { row: keep, index: keep.length };
              this.changed();
              return;
            }
          }
        }
        var idx = p.row.indexOf(p.node);
        if (idx >= 0) {
          p.row.splice(idx, 1);
          this.caret = { row: p.row, index: idx };
        } else {
          this.caret = { row: p.row, index: Math.max(0, p.index) };
        }
      }
    }
    this.changed();
  };

  Editor.prototype.move = function (delta) {
    this.selection = null;
    var r = this.caret.row, i = this.caret.index;
    if (delta < 0) {
      if (i > 0) {
        var prev = r[i - 1], last = M.lastBox(prev);
        if (last) this.caret = { row: last, index: last.length };
        else this.caret = { row: r, index: i - 1 };
      } else {
        var before = sibling(r, -1);
        if (before) this.caret = { row: before, index: before.length };
        else if (r.__p && r.__p.row) this.caret = { row: r.__p.row, index: r.__p.index };
      }
    } else {
      if (i < r.length) {
        var next = r[i], first = M.firstBox(next);
        if (first) this.caret = { row: first, index: 0 };
        else this.caret = { row: r, index: i + 1 };
      } else {
        var after = sibling(r, 1);
        if (after) this.caret = { row: after, index: 0 };
        else if (r.__p && r.__p.row) this.caret = { row: r.__p.row, index: r.__p.index + 1 };
      }
    }
    this.render();
  };

  /* Tab / ↳ jumps to the next empty slot, preferring a dashed placeholder. */
  Editor.prototype.nextBox = function () {
    /* Walk every row in structural order (body, lower limit, upper limit),
       then wrap around, so a tab from the integrand reaches the limits. */
    var rows = [];
    (function collect(r) {
      rows.push(r);
      r.forEach(function (n) { M.childRows(n).forEach(collect); });
    })(this.root);
    var start = Math.max(0, rows.indexOf(this.caret.row));
    var order = [], i, j, rr;
    for (i = start + 1; i < rows.length; i++) order.push(i);
    for (i = 0; i <= start; i++) order.push(i);
    for (i = 0; i < order.length; i++) {
      rr = rows[order[i]];
      for (j = 0; j < rr.length; j++) {
        if (rr[j].t === 'hole') {
          this.selection = { row: rr, index: j };
          this.caret = { row: rr, index: j + 1 };
          this.render();
          return;
        }
      }
    }
    for (i = 0; i < order.length; i++) {
      rr = rows[order[i]];
      if (!rr.length) {
        this.selection = null;
        this.caret = { row: rr, index: 0 };
        this.render();
        return;
      }
    }
    this.selection = null;
    this.caret = { row: this.root, index: this.root.length };
    this.render();
  };

  /* Enter / ↵ adds a new equation row. A single expression becomes a
     brace-wrapped system with the caret on the new line. */
  Editor.prototype.newLine = function () {
    this.push();
    var r = this.caret.row;
    var p = r.__p;
    if (p && p.node && p.node.t === 'system') {
      var at = p.node.rows.indexOf(r);
      var nr = M.row();
      p.node.rows.splice(at + 1, 0, nr);
      M.linkTree(this.root);
      this.selection = null;
      this.caret = { row: nr, index: 0 };
      this.changed();
      return;
    }
    var first = this.root.slice();
    var sys = M.system([first, []]);
    this.root = M.row([sys]);
    M.linkTree(this.root);
    this.selection = null;
    this.caret = { row: sys.rows[1], index: 0 };
    this.changed();
  };

  Editor.prototype.insertSystem = function () {
    this.push();
    var sys = M.system([[M.hole('eq 1')], [M.hole('eq 2')]]);
    this.root = M.row([sys]);
    this.intent = 'auto';
    this.params = {};
    M.linkTree(this.root);
    this.selection = { row: sys.rows[0], index: 0 };
    this.caret = { row: sys.rows[0], index: 1 };
    this.changed();
  };

  Editor.prototype.clear = function () {
    this.push();
    this.root = M.row();
    this.caret = { row: this.root, index: 0 };
    this.selection = null;
    this.intent = null;
    this.params = {};
    this.changed();
  };

  Editor.prototype.load = function (str, intent, params) {
    this.push();
    this.root = M.stringToRow(str);
    /* A parsed bare matrix carries no variant; an explicitly supplied one
       (det/inv/rank/...) must win over toSpec's "inv" default. */
    applyVariant(this.root, params);
    M.linkTree(this.root);
    this.selection = null;
    this.caret = { row: this.root, index: this.root.length };
    this.intent = intent || null;
    this.params = params || {};
    this.changed();
  };

  /* Replace the whole tree with a pre-built row (used by LaTeX import). */
  Editor.prototype.loadRow = function (r, intent, params) {
    this.push();
    this.root = M.row(r);
    applyVariant(this.root, params);
    M.linkTree(this.root);
    this.selection = null;
    this.caret = { row: this.root, index: this.root.length };
    this.intent = intent || null;
    this.params = params || {};
    this.changed();
  };

  Editor.prototype.spec = function () {
    var s = M.toSpec(this.root, this.intent);
    for (var k in this.params) {
      if (s.params[k] === undefined && this.params[k] !== undefined) s.params[k] = this.params[k];
    }
    return s;
  };

  Editor.prototype.isEmpty = function () { return this.root.length === 0; };

  global.PLXT = global.PLXT || {};
  global.PLXT.Editor = Editor;
})(typeof window !== 'undefined' ? window : globalThis);
