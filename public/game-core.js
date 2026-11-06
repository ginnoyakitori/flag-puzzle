// サーバーとブラウザで共有するゲームロジック(旗データ・板の生成・判定)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  var W = 30, H = 18, PASS = 0.995;
  var COLORS = { W: [255,255,255], K: [0,0,0], R: [255,0,0], G: [0,255,0], B: [0,0,255], Y: [255,255,0] };
  var INKS = { add: ['R','G','B'], sub: ['C','M','Y'] };
  var INK_VEC = { R:[255,0,0], G:[0,255,0], B:[0,0,255], C:[0,255,255], M:[255,0,255], Y:[255,255,0] };

  function r(x, y, w, h) { return { t: 'r', x: x, y: y, w: w, h: h }; }
  function c(cx, cy, rad) { return { t: 'c', cx: cx, cy: cy, r: rad }; }
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
    { id: 'ch', name: 'スイス', regions: [reg('R', r(0,0,30,18)), reg('W', r(13,3,4,12), r(8,7,14,4))] },
    { id: 'bd', name: 'バングラデシュ', regions: [reg('G', r(0,0,30,18)), reg('R', c(13,9,5))] }
  ];

  function inPrim(p, x, y) {
    if (p.t === 'r') return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    var dx = x - p.cx, dy = y - p.cy; return dx * dx + dy * dy <= p.r * p.r;
  }
  function eqv(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

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
  // 各インクの板を生成(使われないインクの板は作らない)。板の正解位置は常に(0,0)
  function buildPlates(flag, mode) {
    var out = [];
    INKS[mode].forEach(function (ink) {
      var ops = [], used = false;
      flag.regions.forEach(function (rg) {
        var on = inksFor(mode, rg.color).indexOf(ink) >= 0;
        rg.prims.forEach(function (p) {
          if (on) { used = true; ops.push({ op: 'add', p: p }); }
          else if (used) ops.push({ op: 'sub', p: p });
        });
      });
      if (used) out.push({ id: ink, ops: ops });
    });
    return out;
  }
  function plateHas(plate, x, y) {
    var s = false;
    plate.ops.forEach(function (o) { if (inPrim(o.p, x, y)) s = o.op === 'add'; });
    return s;
  }
  // placements: { R:{x,y,on}, ... } → 目標との一致率(0〜1)
  function evaluate(flag, mode, placements) {
    var plates = buildPlates(flag, mode), ok = 0, tot = 0, i, j;
    for (i = 0; i < W * 2; i++) for (j = 0; j < H * 2; j++) {
      var x = (i + 0.5) / 2, y = (j + 0.5) / 2, set = [];
      plates.forEach(function (pl) {
        var pc = placements[pl.id];
        if (pc && pc.on && plateHas(pl, x - pc.x, y - pc.y)) set.push(pl.id);
      });
      tot++; if (eqv(mix(mode, set), colorAt(flag, x, y))) ok++;
    }
    return ok / tot;
  }
  return { W: W, H: H, PASS: PASS, FLAGS: FLAGS, INKS: INKS, COLORS: COLORS,
           buildPlates: buildPlates, evaluate: evaluate, colorAt: colorAt, mix: mix };
});
