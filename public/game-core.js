// サーバーとブラウザで共有するゲームロジック(旗データ・板の生成・判定)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GameCore = factory(root);
})(typeof window !== 'undefined' ? window : this, function (root) {
  var DATA = (typeof module === 'object' && module.exports) ? require('./flags-data.js') : root.FlagData;
  var W = 30, H = 18, PASS = 0.995;
  var WS = { w: 46, h: 30, ox: 8, oy: 6 }; // 作業台の大きさと旗の枠の位置
  var COLORS = { W: [255,255,255], K: [0,0,0], R: [255,0,0], G: [0,255,0], B: [0,0,255], Y: [255,255,0] };
  var INKS = { add: ['R','G','B'], sub: ['C','M','Y'] };
  var INK_VEC = { R:[255,0,0], G:[0,255,0], B:[0,0,255], C:[0,255,255], M:[255,0,255], Y:[255,255,0] };

  // ---- 図形(長方形・円・多角形) ----
  function r(x, y, w, h) { return { t: 'r', x: x, y: y, w: w, h: h }; }
  function c(cx, cy, rad) { return { t: 'c', cx: cx, cy: cy, r: rad, pv: [cx, cy] }; }
  function poly(pts, pv) { return { t: 'p', pts: pts, pv: pv }; }
  // 星:rot=回転(度)、n=頂点数、inner=内側の半径比
  function star(cx, cy, R, rot, n, inner) {
    n = n || 5; inner = inner || (n === 5 ? 0.382 : 0.5); rot = (rot || 0) * Math.PI / 180;
    var pts = [], i, a, rr;
    for (i = 0; i < 2 * n; i++) { a = -Math.PI / 2 + rot + i * Math.PI / n; rr = i % 2 ? R * inner : R; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return poly(pts, [cx, cy]);
  }
  // 三日月:外円(中心cx,cy・半径R)から、右にdずれた内円(半径rr)を引いた形。angだけ時計回りに回す(0=右向きに開く)
  function crescent(cx, cy, R, rr, d, ang) {
    var flip = d < 0; d = Math.abs(d); if (flip) ang += 180;
    var a = (R * R - rr * rr + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
    var t0 = Math.atan2(h, a), p0 = Math.atan2(h, a - d), N = 24, pts = [], i, t, u, q = ang * Math.PI / 180;
    for (i = 0; i <= N; i++) { t = t0 + (2 * Math.PI - 2 * t0) * i / N; pts.push([R * Math.cos(t), R * Math.sin(t)]); }
    for (i = 0; i <= N; i++) { u = (2 * Math.PI - p0) + (2 * p0 - 2 * Math.PI) * i / N; pts.push([d + rr * Math.cos(u), rr * Math.sin(u)]); }
    return poly(pts.map(function (v) { return [cx + v[0] * Math.cos(q) - v[1] * Math.sin(q), cy + v[0] * Math.sin(q) + v[1] * Math.cos(q)]; }), [cx, cy]);
  }
  function reg(color, prims) { return { color: color, prims: prims }; }
  var rd = function (v) { return Math.round(v * 1e6) / 1e6; };
  // スペック文字列 → 領域リスト(後の領域ほど上に重なる)
  function parseSpec(spec) {
    var out = [];
    spec.split(';').forEach(function (tk) {
      tk = tk.trim(); if (!tk) return;
      var i = tk.indexOf(':'), k = tk.slice(0, i), a = tk.slice(i + 1), n, cs, wt, tot, cum, j;
      if (k === 'H' || k === 'V') {
        var parts = a.split('@'); cs = parts[0].split('');
        wt = parts[1] ? parts[1].split(',').map(Number) : cs.map(function () { return 1; });
        tot = wt.reduce(function (x, y) { return x + y; }, 0); cum = 0;
        cs.forEach(function (col, idx) {
          var a0 = rd(cum / tot), a1 = rd((cum + wt[idx]) / tot); cum += wt[idx];
          out.push(reg(col, [k === 'H' ? r(0, rd(a0 * H), W, rd((a1 - a0) * H)) : r(rd(a0 * W), 0, rd((a1 - a0) * W), H)]));
        });
        return;
      }
      if (k === 'J') { // ユニオンジャック(x0,y0,w,h の範囲に収める。縞の太さは目安)
        n = a.split(',').map(Number); var x0 = n[0], y0 = n[1], w = n[2], h = n[3], tw = w * 0.17, tr = w * 0.08;
        var diag = function (t) { return [poly([[x0,y0],[x0 + t,y0],[x0 + w,y0 + h],[x0 + w - t,y0 + h]], null), poly([[x0 + w - t,y0],[x0 + w,y0],[x0 + t,y0 + h],[x0,y0 + h]], null)]; };
        out.push(reg('W', diag(tw)), reg('R', diag(tr)),
          reg('W', [r(x0 + w * 0.4, y0, w * 0.2, h), r(x0, y0 + h * 0.33, w, h * 0.34)]),
          reg('R', [r(x0 + w * 0.45, y0, w * 0.1, h), r(x0, y0 + h * 0.42, w, h * 0.16)]));
        return;
      }
      var args = a.split(','), col = args[0]; n = args.slice(1).map(Number);
      if (k === 'bg') out.push(reg(col, [r(0, 0, W, H)]));
      else if (k === 'r') out.push(reg(col, [r(n[0], n[1], n[2], n[3])]));
      else if (k === 'c') out.push(reg(col, [c(n[0], n[1], n[2])]));
      else if (k === 's') out.push(reg(col, [star(n[0], n[1], n[2], n[3], n[4], n[5])]));
      else if (k === 'm') out.push(reg(col, [crescent(n[0], n[1], n[2], n[3], n[4], n[5] || 0)]));
      else if (k === 'o') { // 星の輪(または弧): cx,cy,輪の半径,星の半径,個数,開始角,終了角(0=右,90=下)
        var st = [], full = n[6] - n[5] >= 360, i2;
        for (i2 = 0; i2 < n[4]; i2++) { var ang = (n[5] + (n[6] - n[5]) * i2 / (full ? n[4] : n[4] - 1)) * Math.PI / 180; st.push(star(n[0] + n[2] * Math.cos(ang), n[1] + n[2] * Math.sin(ang), n[3])); }
        out.push(reg(col, st));
      }
      else if (k === 'p') { var pts = []; for (j = 0; j + 1 < n.length; j += 2) pts.push([n[j], n[j + 1]]); out.push(reg(col, [poly(pts, null)])); }
      else if (k === '+') out.push(reg(col, [r(n[0], 0, n[1], H), r(0, n[2], W, n[3])]));
      else if (k === 'k') out.push(reg(col, [r(n[0] - n[2] / 2, n[1] - n[3] / 2, n[2], n[3]), r(n[0] - n[3] / 2, n[1] - n[2] / 2, n[3], n[2])]));
      else if (k === 'x') out.push(reg(col, [poly([[0,0],[n[0],0],[W,H],[W - n[0],H]], null), poly([[W - n[0],0],[W,0],[n[0],H],[0,H]], null)]));
    });
    return out;
  }
  // q: 0=忠実 / 4=紋章を円・星・多角形で近似(0と4がステージ出題の対象) / 1=色を近似 / 2=細部を省略 / 3=両方
  var FLAGS_ALL = DATA.map(function (d) { return { id: d[0], name: d[1], q: d[2], regions: parseSpec(d[3]) }; });
  function flagById(id) { return FLAGS_ALL.filter(function (f) { return f.id === id; })[0]; }

  function inPoly(pts, x, y) {
    var inside = false, i, j;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function inPrim(p, x, y) {
    if (p.t === 'r') return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    if (p.t === 'c') { var dx = x - p.cx, dy = y - p.cy; return dx * dx + dy * dy <= p.r * p.r; }
    return inPoly(p.pts, x, y);
  }
  function eqv(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

  // ---- 混色 ----
  function mix(mode, inks) {
    var v = mode === 'add' ? [0,0,0] : [255,255,255];
    inks.forEach(function (n) {
      var k, e = INK_VEC[n];
      for (k = 0; k < 3; k++) v[k] = mode === 'add' ? Math.min(255, v[k] + e[k]) : Math.round(v[k] * e[k] / 255);
    });
    return v;
  }
  var cache = {};
  function inksFor(mode, colorKey) {
    var key = mode + colorKey; if (cache[key]) return cache[key];
    var inks = INKS[mode], m, res = [];
    for (m = 0; m < 8; m++) {
      var set = inks.filter(function (_, i) { return (m >> i) & 1; });
      if (eqv(mix(mode, set), COLORS[colorKey])) { res = set; break; }
    }
    return (cache[key] = res);
  }
  function colorAt(flag, x, y) {
    var out = 'K';
    flag.regions.forEach(function (rg) { if (rg.prims.some(function (p) { return inPrim(p, x, y); })) out = rg.color; });
    return COLORS[out];
  }

  // ---- 板の生成 ----
  // 板 = 単色インクの図形(ops: add=色のある部分 / sub=透明な穴)。穴は「入れないと旗にならない板」だけに付く。
  function stateAt(ops, x, y, addOnly) {
    var s = false;
    ops.forEach(function (o) { if (inPrim(o.p, x, y)) { if (o.op === 'add') s = true; else if (!addOnly) s = false; } });
    return s;
  }
  function grid(fn) { var i, j; for (i = 0; i < W * 2; i++) for (j = 0; j < H * 2; j++) fn((i + 0.5) / 2, (j + 0.5) / 2); }
  function near(a, b) { return Math.abs(a - b) < 1e-6; }
  function mergeRects(L) {
    var again = true;
    while (again) {
      again = false;
      outer: for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
        var a = L[i], b = L[j], m = null;
        if (near(a.y, b.y) && near(a.h, b.h) && (near(a.x + a.w, b.x) || near(b.x + b.w, a.x)))
          m = { t: 'r', x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
        else if (near(a.x, b.x) && near(a.w, b.w) && (near(a.y + a.h, b.y) || near(b.y + b.h, a.y)))
          m = { t: 'r', x: a.x, y: Math.min(a.y, b.y), w: a.w, h: a.h + b.h };
        if (m) { L.splice(j, 1); L[i] = m; again = true; break outer; }
      }
    }
    return L;
  }
  function bboxOf(p) {
    if (p.t === 'r') return [p.x, p.y, p.x + p.w, p.y + p.h];
    if (p.t === 'c') return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
    var xs = p.pts.map(function (q) { return q[0]; }), ys = p.pts.map(function (q) { return q[1]; });
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  }
  function inBox(a, b) { var e = 1e-6; return b[0] >= a[0] - e && b[1] >= a[1] - e && b[2] <= a[2] + e && b[3] <= a[3] + e; }
  function shift(p, dx, dy) {
    if (p.t === 'r') return { t: 'r', x: p.x - dx, y: p.y - dy, w: p.w, h: p.h };
    if (p.t === 'c') return { t: 'c', cx: p.cx - dx, cy: p.cy - dy, r: p.r };
    return { t: 'p', pts: p.pts.map(function (q) { return [q[0] - dx, q[1] - dy]; }) };
  }
  function opsFor(flag, mode, ink) {
    var ops = [], used = false;
    flag.regions.forEach(function (rg) {
      var on = inksFor(mode, rg.color).indexOf(ink) >= 0;
      rg.prims.forEach(function (p) {
        if (on) { used = true; ops.push({ op: 'add', p: p }); } else if (used) ops.push({ op: 'sub', p: p });
      });
    });
    return used ? ops : null;
  }
  // このインクの板は穴なし(単色の図形だけ)で作れるか?
  function needsHole(ops) {
    var need = false;
    grid(function (x, y) { if (!need && stateAt(ops, x, y, false) !== stateAt(ops, x, y, true)) need = true; });
    return need;
  }
  // 実際に何かを消している穴だけ残す
  function usefulSubs(ops) {
    return ops.filter(function (o, i) {
      if (o.op === 'add') return true;
      var before = ops.slice(0, i), hit = false;
      grid(function (x, y) { if (!hit && inPrim(o.p, x, y) && stateAt(before, x, y, false)) hit = true; });
      return hit;
    });
  }
  function mergeRuns(ops) {
    var out = [], run = [];
    function flush() {
      var rects = mergeRects(run.filter(function (o) { return o.p.t === 'r'; }).map(function (o) { return o.p; }));
      rects.forEach(function (q) { out.push({ op: 'add', p: q }); });
      run.filter(function (o) { return o.p.t !== 'r'; }).forEach(function (o) { out.push(o); });
      run = [];
    }
    ops.forEach(function (o) { if (o.op === 'add') run.push(o); else { flush(); out.push(o); } });
    flush(); return out;
  }
  function solidGroups(ops) {
    var ps = ops.filter(function (o) { return o.op === 'add'; }).map(function (o) { return o.p; });
    var rects = mergeRects(ps.filter(function (p) { return p.t === 'r'; }));
    var others = ps.filter(function (p) { return p.t !== 'r'; });
    rects = rects.filter(function (b, i) {
      var bb = bboxOf(b);
      return !rects.some(function (a, j) { return j !== i && inBox(bboxOf(a), bb) && (!inBox(bb, bboxOf(a)) || j < i); });
    });
    others = others.filter(function (q) { return !rects.some(function (a) { return inBox(bboxOf(a), bboxOf(q)); }); });
    return rects.concat(others).map(function (p) { return [{ op: 'add', p: p }]; });
  }
  function makePlate(id, ink, ops) {
    var adds = ops.filter(function (o) { return o.op === 'add'; }), pv = null, bb = null;
    adds.forEach(function (o) {
      var b = bboxOf(o.p);
      bb = bb ? [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])] : b;
    });
    if (adds.length === 1 && adds[0].p.pv) pv = adds[0].p.pv;
    var px = Math.round(pv ? pv[0] : (bb[0] + bb[2]) / 2), py = Math.round(pv ? pv[1] : (bb[1] + bb[3]) / 2);
    var local = ops.map(function (o) { return { op: o.op, p: shift(o.p, px, py) }; });
    return { id: id, ink: ink, ops: local, x: px, y: py,
             bb: { x0: bb[0] - px, y0: bb[1] - py, x1: bb[2] - px, y1: bb[3] - py },
             hole: ops.some(function (o) { return o.op === 'sub'; }),
             kind: adds.length === 1 ? adds[0].p.t : 'x' };
  }
  var sets = {};
  function buildPlates(flag, mode) {
    var key = flag.id + mode; if (sets[key]) return sets[key];
    var out = [];
    INKS[mode].forEach(function (ink) {
      var ops = opsFor(flag, mode, ink), n = 0;
      if (!ops) return;
      if (needsHole(ops)) out.push(makePlate(ink + (++n), ink, mergeRuns(usefulSubs(ops))));
      else solidGroups(ops).forEach(function (g) { out.push(makePlate(ink + (++n), ink, g)); });
    });
    return (sets[key] = out);
  }
  function available(all) { return all ? FLAGS_ALL : FLAGS; }
  // 難しさ=板の枚数+穴あき×1.5+多角形×1。ステージ=難しい順に5問ずつ(端数は前のステージへ)
  function difficulty(flag, mode) {
    var pl = buildPlates(flag, mode);
    return pl.length + 1.5 * pl.filter(function (p) { return p.hole; }).length + pl.filter(function (p) { return p.kind === 'p'; }).length;
  }
  var stageCache = {};
  function stages(mode, size) {
    size = size || 5; var key = mode + size; if (stageCache[key]) return stageCache[key];
    var list = FLAGS.map(function (f) { return { id: f.id, d: difficulty(f, mode) }; })
      .sort(function (a, b) { return a.d - b.d || (a.id < b.id ? -1 : 1); });
    var out = [], i;
    for (i = 0; i < list.length; i += size) out.push(list.slice(i, i + size).map(function (x) { return x.id; }));
    if (out.length > 1 && out[out.length - 1].length < 3) out[out.length - 2] = out[out.length - 2].concat(out.pop());
    return (stageCache[key] = out);
  }
  function range() { return { x0: -WS.ox, x1: WS.w - WS.ox, y0: -WS.oy, y1: WS.h - WS.oy }; }

  // ---- 判定 ----
  // placements: { R1:{x,y,rot,s10,on}, ... }  rot=度(15刻み)、s10=倍率×10(10=等倍)
  function evaluate(flag, mode, placements) {
    var plates = buildPlates(flag, mode), ok = 0, tot = 0;
    var tf = plates.map(function (p) {
      var c = placements[p.id]; if (!c || !c.on) return null;
      var rot = c.rot || 0, a = rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      if (rot % 90 === 0) { cs = Math.round(cs); sn = Math.round(sn); }
      return { x: c.x, y: c.y, cs: cs, sn: sn, s: (c.s10 || 10) / 10, p: p };
    });
    grid(function (x, y) {
      var set = [];
      tf.forEach(function (t) {
        if (!t) return;
        var dx = x - t.x, dy = y - t.y;
        if (stateAt(t.p.ops, (dx * t.cs + dy * t.sn) / t.s, (-dx * t.sn + dy * t.cs) / t.s, false)) set.push(t.p.ink);
      });
      tot++; if (eqv(mix(mode, set), colorAt(flag, x, y))) ok++;
    });
    return ok / tot;
  }
  // ステージ出題用の旗:q=0または4で、板が両モードとも10枚以下に収まるもの
  var FLAGS = FLAGS_ALL.filter(function (f) {
    return (f.q === 0 || f.q === 4) && ['add', 'sub'].every(function (m) { return buildPlates(f, m).length <= 10; });
  });
  return { W: W, H: H, PASS: PASS, WS: WS, FLAGS: FLAGS, FLAGS_ALL: FLAGS_ALL, flagById: flagById, stages: stages, difficulty: difficulty, INKS: INKS, COLORS: COLORS,
           buildPlates: buildPlates, available: available, evaluate: evaluate, colorAt: colorAt, mix: mix, range: range };
});