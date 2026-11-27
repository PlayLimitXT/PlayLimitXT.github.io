/* Canvas function plotter with deterministic sampling and discontinuity handling.
   Supports wheel / pinch / button zoom, drag pan, tap-to-read coordinates and
   snapping to roots, extrema and intercepts. */
(function (global) {
  'use strict';

  var solver = global.PLXT.solver;

  function niceStep(range) {
    var raw = range / 8;
    var mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
    var norm = raw / mag;
    var step = norm < 1.5 ? 1 : (norm < 3.5 ? 2 : (norm < 7.5 ? 5 : 10));
    return step * mag;
  }

  function fmt(v) {
    if (!isFinite(v)) return '';
    if (Math.abs(v) < 1e-9) return '0';
    if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(1);
    return String(Math.round(v * 1000) / 1000);
  }

  function Plot(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = {
      expr: '', secondary: '', series: null, variable: 'x', roots: [], critical: [], intersections: [], specials: [],
      showGrid: true, showRoots: true,
      xmin: -8, xmax: 8, ymin: -5, ymax: 5, autoY: true,
      dragging: false, lastX: 0, lastY: 0, moved: false,
      downX: 0, downY: 0, downT: 0, lastTap: 0,
      pointers: {}, pinch: null, pick: null, hover: null
    };
    this.onPick = null;
    this._bind();
    this.resize();
  }

  Plot.prototype._bind = function () {
    var self = this, c = this.canvas, s = this.state;

    function local(ev) {
      var r = c.getBoundingClientRect();
      return { px: ev.clientX - r.left, py: ev.clientY - r.top,
        left: r.left, top: r.top, w: r.width, h: r.height };
    }
    function zoomAt(factor, ax, ay) {
      s.xmin = ax + (s.xmin - ax) * factor;
      s.xmax = ax + (s.xmax - ax) * factor;
      /* Equal aspect: the y-span follows the x-span and the canvas ratio,
         centred on the zoom anchor so the point under the cursor stays put. */
      /* Use the same pixel dimensions as draw() to avoid a rounding drift
         between getBoundingClientRect() and the DPR-scaled canvas bitmap. */
      var r = { width: c.width / (self.dpr || 1), height: c.height / (self.dpr || 1) };
      var span = (s.xmax - s.xmin) * (r.height || 1) / (r.width || 1);
      s.ymin = ay - span / 2;
      s.ymax = ay + span / 2;
      s.autoY = false;
      self.draw();
    }

    c.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var q = local(ev), fx = q.px / q.w, fy = q.py / q.h;
      var factor = ev.deltaY > 0 ? 1.16 : 1 / 1.16;
      zoomAt(factor, s.xmin + (s.xmax - s.xmin) * fx,
        s.ymin + (s.ymax - s.ymin) * (1 - fy));
    }, { passive: false });

    c.addEventListener('pointerdown', function (ev) {
      s.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(s.pointers);
      if (ids.length === 2) {
        var a = s.pointers[ids[0]], b = s.pointers[ids[1]];
        var q = local(ev);
        /* Keep the canvas rect: pointer coordinates are viewport-based and
           must be offset by rect.left/top before being turned into fractions
           of the plot width/height. */
        s.pinch = {
          d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          xmin: s.xmin, xmax: s.xmax, ymin: s.ymin, ymax: s.ymax,
          cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rect: q
        };
        s.dragging = false;
        return;
      }
      s.dragging = true; s.moved = false;
      s.lastX = ev.clientX; s.lastY = ev.clientY;
      s.downX = ev.clientX; s.downY = ev.clientY; s.downT = Date.now();
      try { c.setPointerCapture(ev.pointerId); } catch (e) { /* capture may be held */ }
    });

    c.addEventListener('pointermove', function (ev) {
      var q;
      if (s.pointers[ev.pointerId]) {
        s.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      }
      if (s.pinch) {
        var ids = Object.keys(s.pointers);
        if (ids.length < 2) return;
        var a = s.pointers[ids[0]], b = s.pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        var factor = Math.max(0.15, Math.min(6, s.pinch.d0 / d));
        var pr = c.getBoundingClientRect();
        var r0 = s.pinch.rect;
        /* Fractions are measured from the canvas top-left, never from the
           viewport origin. Using clientX/clientY directly was the source of
           the instant y-axis jump on the first pinch move. */
        var fx = Math.max(0, Math.min(1, (s.pinch.cx - r0.left) / (r0.w || 1)));
        var fy = Math.max(0, Math.min(1, (s.pinch.cy - r0.top) / (r0.h || 1)));
        var xspan0 = s.pinch.xmax - s.pinch.xmin;
        var yspan0 = s.pinch.ymax - s.pinch.ymin;
        var ax0 = s.pinch.xmin + xspan0 * fx;
        var ay0 = s.pinch.ymin + yspan0 * (1 - fy);
        var xspan = xspan0 * factor;
        /* Equal aspect: derive the y-span exactly as draw() does. */
        var W = c.width / (self.dpr || 1), H = c.height / (self.dpr || 1);
        var yspan = xspan * (H || 1) / (W || 1);
        var nxmin = ax0 - xspan * fx;
        var nymin = ay0 - yspan * (1 - fy);
        /* Two-finger pan: moving the midpoint translates the whole view,
           with one screen pixel representing the same amount on both axes. */
        var ccx = (a.x + b.x) / 2, ccy = (a.y + b.y) / 2;
        var unit = xspan / (pr.width || r0.w || 1);
        var dx = (ccx - s.pinch.cx) * unit;
        var dy = (ccy - s.pinch.cy) * unit;
        s.xmin = nxmin - dx; s.xmax = nxmin - dx + xspan;
        s.ymin = nymin + dy; s.ymax = nymin + dy + yspan;
        s.autoY = false;
        self.draw();
        return;
      }
      if (s.dragging) {
        var rect = c.getBoundingClientRect();
        /* px-per-unit is identical on both axes, so a single unit converts
           both horizontal and vertical pointer movement. */
        var unit = (s.xmax - s.xmin) / (rect.width || 1);
        var dxPx = ev.clientX - s.lastX, dyPx = ev.clientY - s.lastY;
        if (Math.abs(ev.clientX - s.downX) + Math.abs(ev.clientY - s.downY) > 5) s.moved = true;
        s.xmin -= dxPx * unit; s.xmax -= dxPx * unit;
        s.ymin += dyPx * unit; s.ymax += dyPx * unit;
        s.autoY = false;
        s.lastX = ev.clientX; s.lastY = ev.clientY;
        self.draw();
        return;
      }
      /* PC: a lightweight hover crosshair that shows the live coordinate. */
      if (ev.pointerType === 'mouse' && s.expr) {
        q = local(ev);
        var hx = s.xmin + (s.xmax - s.xmin) * q.px / q.w;
        var hy = solver.evalAtVar(s.expr, hx, s.variable);
        s.hover = isFinite(hy) ? { x: hx, y: hy } : null;
        self.draw();
        if (self.onHover) self.onHover(s.hover);
      }
    });

    function endPointer(ev) {
      delete s.pointers[ev.pointerId];
      if (s.pinch) {
        if (Object.keys(s.pointers).length < 2) {
          s.pinch = null;
          /* Lifting one finger leaves a normal one-finger drag: keep the
             remaining pointer as the anchor instead of freezing the view. */
          var leftId = Object.keys(s.pointers)[0];
          var leftPt = leftId && s.pointers[leftId];
          if (leftPt) {
            s.dragging = true; s.moved = true;
            s.lastX = leftPt.x; s.lastY = leftPt.y;
            s.downX = leftPt.x; s.downY = leftPt.y; s.downT = Date.now();
          }
        }
        try { c.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        return;
      }
      if (s.dragging && !s.moved && Date.now() - s.downT < 500) {
        self.pickAt(ev.clientX, ev.clientY);
        var now = Date.now();
        if (now - s.lastTap < 320) self.reset();
        s.lastTap = now;
      }
      s.dragging = false;
      try { c.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', function (ev) {
      delete s.pointers[ev.pointerId];
      s.pinch = null; s.dragging = false;
    });
    c.addEventListener('pointerleave', function () {
      if (!s.dragging && s.hover) { s.hover = null; self.draw(); if (self.onHover) self.onHover(null); }
    });
    c.addEventListener('dblclick', function () { self.reset(); });

    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.resize(); self.draw(); });
      this._ro.observe(c);
    } else {
      global.addEventListener('resize', function () { self.resize(); self.draw(); });
    }
  };

  Plot.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = global.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.dpr = dpr;
  };

  Plot.prototype.zoom = function (factor) {
    var s = this.state;
    var ax = (s.xmin + s.xmax) / 2, ay = (s.ymin + s.ymax) / 2;
    s.xmin = ax + (s.xmin - ax) * factor;
    s.xmax = ax + (s.xmax - ax) * factor;
    var dpr = this.dpr || 1;
    var r = { width: this.canvas.width / dpr, height: this.canvas.height / dpr };
    var span = (s.xmax - s.xmin) * (r.height || 1) / (r.width || 1);
    s.ymin = ay - span / 2; s.ymax = ay + span / 2;
    s.autoY = false;
    this.draw();
  };

  Plot.prototype.reset = function () {
    var s = this.state;
    s.xmin = -8; s.xmax = 8; s.ymin = -1; s.ymax = 1; s.autoY = true;
    s.pick = null; s.hover = null;
    this.draw();
    if (this.onPick) this.onPick(null);
  };

  Plot.prototype.setGraph = function (graph, secondary) {
    var s = this.state;
    s.expr = graph && graph.expr ? String(graph.expr) : '';
    s.variable = (graph && graph.variable) || 'x';
    s.roots = graph && Array.isArray(graph.roots) ? graph.roots.slice() : [];
    s.critical = graph && Array.isArray(graph.critical) ? graph.critical.slice() : [];
    s.intersections = graph && Array.isArray(graph.intersections) ? graph.intersections.slice() : [];
    s.secondary = secondary || '';
    s.series = graph && Array.isArray(graph.series) && graph.series.length > 1
      ? graph.series.slice() : null;
    s.xmin = -8; s.xmax = 8; s.ymin = -1; s.ymax = 1; s.autoY = true;
    s.pick = null; s.hover = null;
    /* Special points get priority when the user taps nearby. */
    var sp = [];
    s.roots.forEach(function (r) {
      if (isFinite(r)) sp.push({ x: r, y: 0, kind: 'root' });
    });
    s.critical.forEach(function (cx) {
      var cy = solver.evalAtVar(s.expr, cx, s.variable);
      if (isFinite(cx) && isFinite(cy)) sp.push({ x: cx, y: cy, kind: 'extremum' });
    });
    /* Intersections of the two curves are the equation's solutions. */
    s.intersections.forEach(function (q) {
      if (isFinite(q.x) && isFinite(q.y)) {
        sp.push({ x: q.x, y: q.y, kind: 'intersection' });
      }
    });
    var y0 = solver.evalAtVar(s.expr, 0, s.variable);
    if (isFinite(y0)) sp.push({ x: 0, y: y0, kind: 'intercept' });
    s.specials = sp;
    this.draw();
    if (this.onPick) this.onPick(null);
  };

  Plot.prototype.pickAt = function (clientX, clientY) {
    var s = this.state;
    if (!s.expr) return;
    var rect = this.canvas.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var W = rect.width, H = rect.height;
    var best = null, bd = 22;
    s.specials.forEach(function (sp) {
      var p = this._toPx(sp.x, sp.y, W, H);
      var d = Math.hypot(p.px - px, p.py - py);
      if (d < bd) { bd = d; best = sp; }
    }, this);
    /* Roots and extrema are thin targets: also accept a tap on the same
       vertical line, slightly above or below the marker. */
    if (!best) {
      s.specials.some(function (sp) {
        var p = this._toPx(sp.x, sp.y, W, H);
        if (Math.abs(p.px - px) < 11 && Math.abs(p.py - py) < 48) { best = sp; return true; }
        return false;
      }, this);
    }
    if (best) {
      s.pick = { x: best.x, y: best.y, kind: best.kind };
    } else {
      var x = s.xmin + (s.xmax - s.xmin) * px / W;
      var y = solver.evalAtVar(s.expr, x, s.variable);
      s.pick = isFinite(y) ? { x: x, y: y, kind: 'point' } : null;
    }
    this.draw();
    if (this.onPick) this.onPick(s.pick);
  };

  Plot.prototype._sample = function (expr, count) {
    var s = this.state, out = [];
    if (!expr) return out;
    for (var i = 0; i <= count; i++) {
      var x = s.xmin + (s.xmax - s.xmin) * i / count;
      var y = solver.evalAtVar(expr, x, s.variable);
      out.push({ x: x, y: y, ok: typeof y === 'number' && isFinite(y) && Math.abs(y) < 1e7 });
    }
    return out;
  };

  /* Choose a vertical centre for the equal-aspect window. The span itself is
     never stretched to the data (that would break the 1:1 axis scale); instead
     a function that lives entirely above/below the origin is brought into view
     by aligning its lower/upper edge with the window. */
  Plot.prototype._autoCenter = function (samples, target) {
    var vals = [];
    for (var i = 0; i < samples.length; i++) if (samples[i].ok) vals.push(samples[i].y);
    if (vals.length < 8) return 0;
    vals.sort(function (a, b) { return a - b; });
    var lo = vals[Math.floor(vals.length * 0.02)];
    var hi = vals[Math.floor(vals.length * 0.98)];
    if (!isFinite(lo) || !isFinite(hi)) return 0;
    if (hi - lo <= target) return (lo + hi) / 2;
    if (lo > target * 0.5) return lo + target / 2;
    if (hi < -target * 0.5) return hi - target / 2;
    return 0;
  };

  /* Force (ymax-ymin) = (xmax-xmin) * H / W so one unit is the same number of
     pixels on both axes. Idempotent: re-applying keeps the same centre. */
  Plot.prototype._equalize = function (W, H, center) {
    var s = this.state;
    var xspan = s.xmax - s.xmin;
    if (!(xspan > 0) || !(W > 0) || !(H > 0)) return;
    var span = xspan * H / W;
    var cy = center === undefined ? (s.ymin + s.ymax) / 2 : center;
    s.ymin = cy - span / 2;
    s.ymax = cy + span / 2;
    s.equalAspect = true;
  };

  Plot.prototype._toPx = function (x, y, W, H) {
    var s = this.state;
    return {
      px: (x - s.xmin) / (s.xmax - s.xmin) * W,
      py: H - (y - s.ymin) / (s.ymax - s.ymin) * H
    };
  };

  function currentThemeIsDark() {
    try { return document.documentElement.getAttribute('data-theme') === 'dark'; }
    catch (e) { return false; }
  }

  function cssVar(name, fallback) {
    try {
      var v = global.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  Plot.prototype.draw = function () {
    this.resize();
    var ctx = this.ctx, s = this.state;
    var W = this.canvas.width / this.dpr;
    var H = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var bg = cssVar('--plot-bg', '#ffffff');
    var grid = cssVar('--plot-grid', 'rgba(36, 54, 84, 0.07)');
    var axis = cssVar('--plot-axis', 'rgba(36, 54, 84, 0.32)');
    var tick = cssVar('--plot-text', '#8b95a5');
    var primaryColor = cssVar('--accent', '#1b4fd8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var primary = this._sample(s.expr, 1400);
    var secondary = s.secondary ? this._sample(s.secondary, 1400) : [];
    var seriesPts = [], allPts = primary.concat(secondary);
    if (s.series && s.series.length > 1) {
      seriesPts = s.series.map(function (q) { return this._sample(q.expr, 1400); }, this);
      seriesPts.forEach(function (pts) { allPts = allPts.concat(pts); });
    }
    var target = (s.xmax - s.xmin) * H / W;
    if (s.autoY) {
      this._equalize(W, H, this._autoCenter(allPts, target));
    } else {
      this._equalize(W, H);
    }

    /* Grid and tick labels */
    if (s.showGrid) {
      /* One shared step keeps grid cells square on an equal-aspect plot. */
      var stepX = niceStep(s.xmax - s.xmin);
      var sx = stepX, sy = stepX;
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.font = '10px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = tick;
      var startX = Math.ceil(s.xmin / sx) * sx;
      for (var gx = startX; gx <= s.xmax + 1e-9; gx += sx) {
        var p = this._toPx(gx, 0, W, H);
        ctx.beginPath(); ctx.moveTo(p.px, 0); ctx.lineTo(p.px, H); ctx.stroke();
        if (Math.abs(gx) > 1e-9 && p.px > 30 && p.px < W - 18) ctx.fillText(fmt(gx), p.px + 3, H - 5);
      }
      var startY = Math.ceil(s.ymin / sy) * sy;
      for (var gy = startY; gy <= s.ymax + 1e-9; gy += sy) {
        var q = this._toPx(0, gy, W, H);
        ctx.beginPath(); ctx.moveTo(0, q.py); ctx.lineTo(W, q.py); ctx.stroke();
        if (Math.abs(gy) > 1e-9 && q.py > 24 && q.py < H - 18) ctx.fillText(fmt(gy), 4, q.py - 4);
      }
    }

    /* Coordinate axes */
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.2;
    var ax = this._toPx(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(0, ax.py); ctx.lineTo(W, ax.py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax.px, 0); ctx.lineTo(ax.px, H); ctx.stroke();
    ctx.fillStyle = tick;
    ctx.fillText('x', W - 12, Math.min(H - 6, Math.max(12, ax.py - 6)));
    ctx.fillText('y', Math.min(W - 12, Math.max(4, ax.px + 6)), 12);

    if (s.series && s.series.length > 1) {
      var dark = currentThemeIsDark();
      var palette = dark
        ? ['#6f9bff', '#ffb26b', '#4ade80', '#c4b5fd', '#fb923c', '#67e8f9']
        : ['#1b4fd8', '#b06000', '#16734a', '#8b5cf6', '#c2410c', '#0891b2'];
      seriesPts.forEach(function (pts, i) {
        this._curve(pts, palette[i % palette.length], i === 0 ? 2.1 : 1.8);
      }, this);
    } else {
      this._curve(primary, primaryColor, 2.1);
      if (s.secondary) this._curve(secondary,
        currentThemeIsDark() ? '#ffb26b' : '#b06000', 1.8);
    }

    /* Root markers on the x axis */
    if (s.showRoots && s.roots.length) {
      ctx.fillStyle = cssVar('--ok', '#16734a');
      ctx.strokeStyle = bg;
      ctx.lineWidth = 1.5;
      for (var i = 0; i < s.roots.length; i++) {
        var r = s.roots[i];
        if (!isFinite(r) || r < s.xmin || r > s.xmax) continue;
        var rp = this._toPx(r, 0, W, H);
        ctx.beginPath(); ctx.arc(rp.px, rp.py, 4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }

    /* Solution markers: intersections of the two plotted curves. */
    if (s.showRoots && s.intersections && s.intersections.length) {
      for (var ii = 0; ii < s.intersections.length; ii++) {
        var q = s.intersections[ii];
        if (!isFinite(q.x) || !isFinite(q.y) || q.x < s.xmin || q.x > s.xmax) continue;
        var ip = this._toPx(q.x, q.y, W, H);
        if (ip.px < 0 || ip.px > W || ip.py < 0 || ip.py > H) continue;
        ctx.save();
        ctx.translate(ip.px, ip.py);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = cssVar('--accent', '#1b4fd8');
        ctx.strokeStyle = bg; ctx.lineWidth = 1.6;
        ctx.fillRect(-4.2, -4.2, 8.4, 8.4);
        ctx.strokeRect(-4.2, -4.2, 8.4, 8.4);
        ctx.restore();
        var itag = 'x=' + fmt(q.x);
        ctx.font = '600 10.5px ' + getComputedStyle(document.body).fontFamily;
        var itw = ctx.measureText(itag).width + 10;
        var itx = Math.min(Math.max(2, ip.px + 9), W - itw - 2);
        var ity = Math.min(Math.max(14, ip.py - 9), H - 4);
        ctx.fillStyle = primaryColor;
        ctx.fillRect(itx, ity - 12, itw, 16);
        ctx.fillStyle = bg;
        ctx.fillText(itag, itx + 5, ity - 1);
      }
    }

    /* Critical point markers */
    if (s.critical && s.critical.length) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.4;
      for (var k = 0; k < s.critical.length; k++) {
        var cx = s.critical[k];
        if (!isFinite(cx) || cx < s.xmin || cx > s.xmax) continue;
        var cy = solver.evalAtVar(s.expr, cx, s.variable);
        if (!isFinite(cy)) continue;
        var cp = this._toPx(cx, cy, W, H);
        if (cp.py < 0 || cp.py > H) continue;
        ctx.fillStyle = primaryColor;
        ctx.beginPath(); ctx.arc(cp.px, cp.py, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = bg; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }

    /* Tap / hover readout: guide lines, marker and a coordinate label. */
    var focus = s.pick || s.hover;
    if (focus) {
      var fp = this._toPx(focus.x, focus.y, W, H);
      var strong = !!s.pick;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = primaryColor;
      ctx.beginPath();
      ctx.moveTo(fp.px, 0); ctx.lineTo(fp.px, H);
      ctx.moveTo(0, fp.py); ctx.lineTo(W, fp.py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = strong ? primaryColor : primaryColor;
      ctx.strokeStyle = bg;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fp.px, fp.py, strong ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (strong) {
        var label = '(' + fmt(focus.x) + ', ' + fmt(focus.y) + ')';
        ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
        var tw = ctx.measureText(label).width + 12;
        var lx = Math.min(Math.max(2, fp.px + 8), W - tw - 2);
        var ly = Math.min(Math.max(16, fp.py - 10), H - 6);
        ctx.fillStyle = primaryColor;
        ctx.fillRect(lx, ly - 14, tw, 18);
        ctx.fillStyle = bg;
        ctx.fillText(label, lx + 6, ly - 1);
      }
      ctx.restore();
    }

    if (!s.expr) {
      ctx.fillStyle = tick;
      ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.fillText('—', W / 2, H / 2);
      ctx.textAlign = 'left';
    }
  };

  Plot.prototype._curve = function (samples, color, width) {
    if (!samples.length) return;
    var ctx = this.ctx;
    var W = this.canvas.width / this.dpr;
    var H = this.canvas.height / this.dpr;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    var started = false, prev = null;
    for (var i = 0; i < samples.length; i++) {
      var pt = samples[i];
      if (!pt.ok) { started = false; prev = null; continue; }
      var p = this._toPx(pt.x, pt.y, W, H);
      var outside = p.py < -H * 2 || p.py > H * 3;
      var jump = prev && Math.abs(p.py - prev.py) > H * 0.55;
      if (outside) {
        /* A point far outside the viewport must not become a moveTo anchor:
           the next valid sample used to lineTo all the way back across the
           canvas, drawing a spurious segment near an asymptote. */
        started = false; prev = null; continue;
      }
      if (!started || jump) {
        ctx.moveTo(p.px, p.py);
        started = true;
      } else {
        ctx.lineTo(p.px, p.py);
      }
      prev = p;
    }
    ctx.stroke();
  };

  global.PLXT = global.PLXT || {};
  global.PLXT.plot = {
    create: function (canvas) { return new Plot(canvas); },
    PALETTE: ['#1b4fd8', '#b06000', '#16734a', '#8b5cf6', '#c2410c', '#0891b2']
  };
})(typeof window !== 'undefined' ? window : globalThis);
