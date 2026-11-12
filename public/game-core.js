// サーバーとブラウザで共有するゲームロジック(旗データ・板の生成・判定)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  var W = 30, H = 18, PASS = 0.995;
  var WS = { w: 46, h: 30, ox: 8, oy: 6 }; // 作業台の大きさと旗の枠の位置
  var COLORS = { W: [255,255,255], K: [0,0,0], R: [255,0,0], G: [0,255,0], B: [0,0,255], Y: [255,255,0] };
  var INKS = { add: ['R','G','B'], sub: ['C','M','Y'] };
  var INK_VEC = { R:[255,0,0], G:[0,255,0], B:[0,0,255], C:[0,255,255], M:[255,0,255], Y:[255,255,0] };

  // ---- 図形(長方形・円・多角形) ----
  function r(x, y, w, h) { return { t: 'r', x: x, y: y, w: w, h: h }; }
  function c(cx, cy, rad) { return { t: 'c', cx: cx, cy: cy, r: rad, pv: [cx, cy] }; }
  function poly(pts, pv) { return { t: 'p', pts: pts, pv: pv }; }
  function star(cx, cy, R) {
    var pts = [], i, a, rr;
    for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; rr = i % 2 ? R * 0.382 : R; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return poly(pts, [cx, cy]);
  }
  function reg(color) { return { color: color, prims: Array.prototype.slice.call(arguments, 1) }; }
  function vert(a, b, d) { return [reg(a, r(0,0,10,18)), reg(b, r(10,0,10,18)), reg(d, r(20,0,10,18))]; }
  function hor3(a, b, d) { return [reg(a, r(0,0,30,6)), reg(b, r(0,6,30,6)), reg(d, r(0,12,30,6))]; }
  function hor2(a, b) { return [reg(a, r(0,0,30,9)), reg(b, r(0,9,30,9))]; }

  var FLAGS = [
    { id: 'jp', name: '日本', regions: [reg('W', r(0,0,30,18)), reg('R', c(15,9,5))] },
    { id: 'de', name: 'ドイツ', regions: hor3('K','R','Y') },
    { id: 'it', name: 'イタリア', regions: vert('G','W','R') },
    { id: 'fr', name: 'フランス', regions: vert('B','W','R') },
    { id: 'be', name: 'ベルギー', regions: vert('K','Y','R') },
    { id: 'ng', name: 'ナイジェリア', regions: vert('G','W','G') },
    { id: 'nl', name: 'オランダ', regions: hor3('R','W','B') },
    { id: 'at', name: 'オーストリア', regions: hor3('R','W','R') },
    { id: 'hu', name: 'ハンガリー', regions: hor3('R','W','G') },
    { id: 'ru', name: 'ロシア', regions: hor3('W','B','R') },
    { id: 'ua', name: 'ウクライナ', regions: hor2('B','Y') },
    { id: 'pl', name: 'ポーランド', regions: hor2('W','R') },
    { id: 'id', name: 'インドネシア', regions: hor2('R','W') },
    { id: 'se', name: 'スウェーデン', regions: [reg('B', r(0,0,30,18)), reg('Y', r(9,0,3,18), r(0,7,30,3))] },
    { id: 'fi', name: 'フィンランド', regions: [reg('W', r(0,0,30,18)), reg('B', r(7,0,4,18), r(0,7,30,4))] },
    { id: 'dk', name: 'デンマーク', regions: [reg('R', r(0,0,30,18)), reg('W', r(9,0,3,18), r(0,7,30,3))] },
    { id: 'ch', name: 'スイス', regions: [reg('R', r(0,0,30,18)), reg('W', r(13,3,4,12), r(8,7,14,4))] },
    { id: 'bd', name: 'バングラデシュ', regions: [reg('G', r(0,0,30,18)), reg('R', c(13,9,5))] },
    { id: 'cz', name: 'チェコ', regions: [reg('W', r(0,0,30,9)), reg('R', r(0,9,30,9)), reg('B', poly([[0,0],[15,9],[0,18]], null))] },
    { id: 'vn', name: 'ベトナム', regions: [reg('R', r(0,0,30,18)), reg('Y', star(15,9,6))] }
  ];

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
  function mergeRects(L) {
    var again = true;
    while (again) {
      again = false;
      outer: for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
        var a = L[i], b = L[j], m = null;
        if (a.y === b.y && a.h === b.h && (a.x + a.w === b.x || b.x + b.w === a.x))
          m = { t: 'r', x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
        else if (a.x === b.x && a.w === b.w && (a.y + a.h === b.y || b.y + b.h === a.y))
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
  function inBox(a, b) { return b[0] >= a[0] && b[1] >= a[1] && b[2] <= a[2] && b[3] <= a[3]; }
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
  function available() { return FLAGS; }
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
  return { W: W, H: H, PASS: PASS, WS: WS, FLAGS: FLAGS, INKS: INKS, COLORS: COLORS,
           buildPlates: buildPlates, available: available, evaluate: evaluate, colorAt: colorAt, mix: mix, range: range };
});
