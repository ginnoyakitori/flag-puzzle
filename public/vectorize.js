// 旗の画像(ピクセル)→ 6色の領域(多角形)への変換。ブラウザ・Node 共通。
// 入力: RGBA ピクセル列(旗の枠 30×18 を w×h ピクセルにしたもの)
// 出力: [[色, [x1,y1,x2,y2,...]], ...] 面積の大きい順(後のものが上に重なる)。座標は旗の枠(30×18)の単位。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vectorize = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  var FW = 30, FH = 18;
  var NAMES = ['W', 'K', 'R', 'G', 'B', 'Y'];

  // 任意の色を 6色(W K R G B Y)のどれかにする。色相で決めるので、濃い緑や水色もそれらしく寄る。
  function quant(r, g, b, a) {
    if (a < 128) return 0; // 透明は白
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
    if (v < 0.2) return 1;
    if (s < 0.22) return v > 0.55 ? 0 : 1;
    var d = mx - mn, h;
    if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
    if (h < 25 || h >= 300) return 2;  // R(赤・桃・赤紫)
    if (h < 75) return 5;              // Y(橙・黄)
    if (h < 165) return 3;             // G
    return 4;                          // B(水色・青・紫)
  }

  // 4近傍でつながった同じ色のかたまり(成分)に番号をふる
  function label(lab, w, h) {
    var n = w * h, comp = new Int32Array(n).fill(-1), stack = new Int32Array(n), area = [], bb = [], perim = [], c = 0, p, sp, q, x, y, x0, y0, x1, y1, cnt;
    for (p = 0; p < n; p++) {
      if (comp[p] >= 0) continue;
      var col = lab[p]; sp = 0; stack[sp++] = p; comp[p] = c; cnt = 0; x0 = w; y0 = h; x1 = -1; y1 = -1;
      while (sp) {
        q = stack[--sp]; cnt++; x = q % w; y = (q - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && comp[q - 1] < 0 && lab[q - 1] === col) { comp[q - 1] = c; stack[sp++] = q - 1; }
        if (x < w - 1 && comp[q + 1] < 0 && lab[q + 1] === col) { comp[q + 1] = c; stack[sp++] = q + 1; }
        if (y > 0 && comp[q - w] < 0 && lab[q - w] === col) { comp[q - w] = c; stack[sp++] = q - w; }
        if (y < h - 1 && comp[q + w] < 0 && lab[q + w] === col) { comp[q + w] = c; stack[sp++] = q + w; }
      }
      area.push(cnt); bb.push([x0, y0, x1, y1]); perim.push(0); c++;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      p = y * w + x;
      if (x < w - 1 && comp[p] !== comp[p + 1]) { perim[comp[p]]++; perim[comp[p + 1]]++; }
      if (y < h - 1 && comp[p] !== comp[p + w]) { perim[comp[p]]++; perim[comp[p + w]]++; }
    }
    return { comp: comp, n: c, area: area, bb: bb, perim: perim };
  }

  // 細いすじ(境界のにじみ・アンチエイリアスで出る1〜2ピクセルの線)を、まわりの色にとりこむ
  function removeSlivers(lab, w, h, minWidth) {
    var pass, c, p, x, y, info, sliver, nl, changed, votes, k, best, bi, nb;
    for (pass = 0; pass < 6; pass++) {
      info = label(lab, w, h); sliver = [];
      var any = false;
      for (c = 0; c < info.n; c++) { sliver[c] = info.perim[c] > 0 && 2 * info.area[c] / info.perim[c] < minWidth; if (sliver[c]) any = true; }
      if (!any) break;
      nl = new Uint8Array(lab); changed = false;
      for (p = 0; p < w * h; p++) {
        if (!sliver[info.comp[p]]) continue;
        x = p % w; y = (p - x) / w; votes = [0, 0, 0, 0, 0, 0];
        nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (k = 0; k < 4; k++) if (nb[k] >= 0 && !sliver[info.comp[nb[k]]]) votes[lab[nb[k]]]++;
        best = 0; bi = -1;
        for (k = 0; k < 6; k++) if (votes[k] > best) { best = votes[k]; bi = k; }
        if (bi >= 0) { nl[p] = bi; changed = true; }
      }
      lab = nl; if (!changed) break;
    }
    return lab;
  }

  // 1つの成分の外周を、ピクセルの辺をたどって求める(内側が進行方向の右。画面座標で時計まわり=面積が正)
  function outerLoop(info, c, lab, w, h) {
    var comp = info.comp, b = info.bb[c], W1 = w + 1, from = [], to = [], outs = {}, x, y, p, e;
    function add(x0, y0, x1, y1) {
      var id = from.length; from.push(y0 * W1 + x0); to.push(y1 * W1 + x1);
      (outs[from[id]] = outs[from[id]] || []).push(id);
    }
    for (y = b[1]; y <= b[3]; y++) for (x = b[0]; x <= b[2]; x++) {
      p = y * w + x; if (comp[p] !== c) continue;
      if (y === 0 || comp[p - w] !== c) add(x, y, x + 1, y);
      if (x === w - 1 || comp[p + 1] !== c) add(x + 1, y, x + 1, y + 1);
      if (y === h - 1 || comp[p + w] !== c) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || comp[p - 1] !== c) add(x, y + 1, x, y);
    }
    var used = new Uint8Array(from.length), best = null, bestA = 0, s, cur, loop, v, cand, i, pick, pr, cr, d0x, d0y, nx, ny;
    function vx(v) { return v % W1; } function vy(v) { return (v - v % W1) / W1; }
    for (s = 0; s < from.length; s++) {
      if (used[s]) continue;
      used[s] = 1; cur = s; loop = [from[s]];
      for (var guard = 0; guard < from.length + 2; guard++) {
        v = to[cur];
        cand = (outs[v] || []).filter(function (e2) { return !used[e2] || e2 === s; });
        if (!cand.length) break;
        d0x = vx(to[cur]) - vx(from[cur]); d0y = vy(to[cur]) - vy(from[cur]);
        pick = -1; pr = 9;
        for (i = 0; i < cand.length; i++) { // 左折 → 直進 → 右折 の順に選ぶ(つながった外周を1周にする)
          nx = vx(to[cand[i]]) - vx(from[cand[i]]); ny = vy(to[cand[i]]) - vy(from[cand[i]]);
          cr = d0x * ny - d0y * nx; // >0 右折(画面座標)
          if (cr < pr) { pr = cr; pick = cand[i]; }
        }
        if (pick === s) break;
        used[pick] = 1; loop.push(from[pick]); cur = pick;
      }
      var A = 0, k, m = loop.length;
      for (k = 0; k < m; k++) { var a = loop[k], bb2 = loop[(k + 1) % m]; A += vx(a) * vy(bb2) - vx(bb2) * vy(a); }
      A /= 2;
      if (A > bestA) { bestA = A; best = loop; }
    }
    if (!best) return null;
    return { pts: best.map(function (v2) { return [vx(v2), vy(v2)]; }), area: bestA };
  }

  function dropCollinear(pts) {
    var out = [], n = pts.length, i, a, b, c;
    for (i = 0; i < n; i++) {
      a = pts[(i + n - 1) % n]; b = pts[i]; c = pts[(i + 1) % n];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
    }
    return out;
  }
  function dpChain(pts, tol) { // Douglas–Peucker(開いた折れ線)。端点は残す
    var n = pts.length, keep = new Uint8Array(n), st = [[0, n - 1]], t, i, a, b, dmax, idx, dx, dy, len, d;
    keep[0] = keep[n - 1] = 1;
    while (st.length) {
      t = st.pop(); a = pts[t[0]]; b = pts[t[1]]; dmax = 0; idx = -1; dx = b[0] - a[0]; dy = b[1] - a[1]; len = Math.sqrt(dx * dx + dy * dy);
      for (i = t[0] + 1; i < t[1]; i++) {
        d = len ? Math.abs(dx * (a[1] - pts[i][1]) - dy * (a[0] - pts[i][0])) / len : Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (idx >= 0 && dmax > tol) { keep[idx] = 1; st.push([t[0], idx], [idx, t[1]]); }
    }
    return pts.filter(function (_, i2) { return keep[i2]; });
  }
  function simplify(pts, tol) {
    if (pts.length < 8) return pts;
    var far = 0, dm = -1, i, d;
    for (i = 1; i < pts.length; i++) { d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > dm) { dm = d; far = i; } }
    var c1 = dpChain(pts.slice(0, far + 1), tol), c2 = dpChain(pts.slice(far).concat([pts[0]]), tol);
    return c1.concat(c2.slice(1, -1));
  }
  function polyArea(p) { var s = 0, i, n = p.length; for (i = 0; i < n; i++) s += p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1]; return Math.abs(s) / 2; }

  // opt: tol(単純化の許容誤差・ピクセル)、minWidth(消す細さ・ピクセル)、minArea(消す小ささ・旗の単位²)、maxRegions
  function run(rgba, w, h, opt) {
    opt = opt || {};
    var tol = opt.tol || 0.9, minWidth = opt.minWidth || 2.5, minArea = opt.minArea == null ? 0.04 : opt.minArea, maxRegions = opt.maxRegions || 400;
    var lab = new Uint8Array(w * h), p;
    for (p = 0; p < w * h; p++) lab[p] = quant(rgba[4 * p], rgba[4 * p + 1], rgba[4 * p + 2], rgba[4 * p + 3]);
    lab = removeSlivers(lab, w, h, minWidth);
    var info = label(lab, w, h), sx = FW / w, sy = FH / h, regions = [], c, loop, pts, q, out, i, x, y;
    var minPx = minArea / (sx * sy);
    for (c = 0; c < info.n; c++) {
      if (info.area[c] < minPx) continue;
      loop = outerLoop(info, c, lab, w, h); if (!loop) continue;
      pts = simplify(dropCollinear(loop.pts), tol); if (pts.length < 3) continue;
      out = []; q = null;
      for (i = 0; i < pts.length; i++) {
        x = pts[i][0] * sx; y = pts[i][1] * sy;
        if (x < 0.06) x = 0; else if (x > FW - 0.06) x = FW; if (y < 0.06) y = 0; else if (y > FH - 0.06) y = FH;
        x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
        if (q && q[0] === x && q[1] === y) continue; q = [x, y]; out.push(q);
      }
      if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
      if (out.length < 3 || polyArea(out) < minArea) continue;
      regions.push({ color: NAMES[colorOf(info, c, lab, w)], pts: out, area: polyArea(out) });
    }
    regions.sort(function (a, b) { return b.area - a.area; });
    if (regions.length > maxRegions) regions = regions.slice(0, maxRegions);
    return { regions: regions.map(function (r) { return [r.color, [].concat.apply([], r.pts)]; }), labels: lab };
  }
  function colorOf(info, c, lab, w) { // 成分 c の色(成分内のどれか1ピクセルから)
    var b = info.bb[c], x, y;
    for (y = b[1]; y <= b[3]; y++) for (x = b[0]; x <= b[2]; x++) if (info.comp[y * w + x] === c) return lab[y * w + x];
    return 0;
  }

  return { run: run, quant: quant, NAMES: NAMES, FW: FW, FH: FH };
});
