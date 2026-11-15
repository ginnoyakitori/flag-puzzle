(function () {
  var FW = 30, FH = 18, $ = function (id) { return document.getElementById(id); };
  var PAL = { W: '#fff', K: '#000', R: '#f00', G: '#0f0', B: '#00f', Y: '#ff0' };
  var result = {};

  // SVGの文字列を、旗の枠(30×18)の比率の canvas に描いてピクセルを返す
  function rasterize(text, W, H) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('SVGとして読めません');
    var vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number), vw, vh;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { vw = vb[2]; vh = vb[3]; }
    else {
      vw = parseFloat(svg.getAttribute('width')); vh = parseFloat(svg.getAttribute('height'));
      if (!(vw > 0 && vh > 0)) throw new Error('大きさ(viewBox)がありません');
      svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    }
    var ratio = vw / vh, stretch = ratio >= 1.3 && ratio <= 2.1, dw = W, dh = H, ox = 0, oy = 0;
    if (!stretch) { var s = Math.min(W / vw, H / vh); dw = Math.round(vw * s); dh = Math.round(vh * s); ox = Math.floor((W - dw) / 2); oy = Math.floor((H - dh) / 2); }
    svg.setAttribute('width', dw); svg.setAttribute('height', dh);
    svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('shape-rendering', 'crispEdges');
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    return new Promise(function (ok, ng) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(img, ox, oy, dw, dh); URL.revokeObjectURL(url);
        if (!stretch) { // 縦横比がちがう旗は、はしの1ピクセルを引きのばして余白をうめる
          if (ox > 0) { x.drawImage(c, ox, 0, 1, H, 0, 0, ox, H); x.drawImage(c, ox + dw - 1, 0, 1, H, ox + dw, 0, W - ox - dw, H); }
          if (oy > 0) { x.drawImage(c, 0, oy, W, 1, 0, 0, W, oy); x.drawImage(c, 0, oy + dh - 1, W, 1, 0, oy + dh, W, H - oy - dh); }
        }
        ok({ data: x.getImageData(0, 0, W, H).data, stretch: stretch, ratio: ratio });
      };
      img.onerror = function () { URL.revokeObjectURL(url); ng(new Error('SVGを描画できません')); };
      img.src = url;
    });
  }

  function drawRegions(canvas, regions, k) {
    var c = canvas.getContext('2d'); canvas.width = FW * k; canvas.height = FH * k;
    regions.forEach(function (rg) {
      c.fillStyle = PAL[rg[0]]; c.beginPath();
      for (var i = 0; i < rg[1].length; i += 2) i ? c.lineTo(rg[1][i] * k, rg[1][i + 1] * k) : c.moveTo(rg[1][i] * k, rg[1][i + 1] * k);
      c.closePath(); c.fill();
    });
  }
  // 多角形を描き直した結果が、変換前の6色画像とどれだけ同じか
  function agreement(regions, labels, W, H) {
    var k = 8, cv = document.createElement('canvas'), c, d, i, ok = 0, tot = 0, x, y, p, q;
    drawRegions(cv, regions, k); c = cv.getContext('2d', { willReadFrequently: true }); d = c.getImageData(0, 0, FW * k, FH * k).data;
    for (y = 0; y < FH * k; y++) for (x = 0; x < FW * k; x++) {
      p = (y * FW * k + x) * 4; q = Vectorize.quant(d[p], d[p + 1], d[p + 2], d[p + 3]);
      if (q === labels[Math.floor((y + 0.5) / (FH * k) * H) * W + Math.floor((x + 0.5) / (FW * k) * W)]) ok++; tot++;
    }
    return ok / tot;
  }

  function rowFor(f) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + f[0] + '</td><td>' + f[1] + '</td><td class="mute">待機中</td><td></td><td></td><td></td><td></td>';
    $('tb').appendChild(tr); return tr;
  }
  function setState(tr, text, cls) { var td = tr.children[2]; td.textContent = text; td.className = cls || ''; }

  function toFile() {
    var ids = Object.keys(result).sort(), lines = ids.map(function (id) {
      return '"' + id + '":[' + result[id].map(function (rg) { return '["' + rg[0] + '",[' + rg[1].join(',') + ']]'; }).join(',') + ']';
    });
    return '// 国旗SVGから tools/convert.html で変換した旗データ(自動生成・手で編集しないでください)\n// 形式: 国ID: [[色, [x1,y1,x2,y2,...]], ...] 下から順に重ねる。座標は旗の枠(30×18)の単位。\n' +
      '(function (root, factory) {\n  if (typeof module === \'object\' && module.exports) module.exports = factory();\n  else root.FlagSvg = factory();\n})(typeof window !== \'undefined\' ? window : this, function () {\n  return {\n' +
      lines.join(',\n') + '\n  };\n});\n';
  }

  $('go').onclick = async function () {
    $('go').disabled = true; $('dl').disabled = true; $('tb').innerHTML = ''; result = {};
    var res = Math.max(16, Math.min(64, +$('res').value || 32)), W = FW * res, H = FH * res, minArea = +$('minA').value, all = $('all').checked;
    var n = 0, none = 0, bad = 0, polys = 0;
    var skipped = 0;
    for (var i = 0; i < FlagData.length; i++) {
      var f = FlagData[i], tr = null;
      if (f[2] === 0 && !all) { skipped++; continue; }
      try {
        var resp = await fetch('../flags/' + f[0] + '.svg');
        if (!resp.ok) { none++; continue; }
        tr = rowFor(f); setState(tr, '変換中…');
        var text = await resp.text(), img = await rasterize(text, W, H);
        var out = Vectorize.run(img.data, W, H, { minArea: minArea });
        var agr = agreement(out.regions, out.labels, W, H);
        result[f[0]] = out.regions; n++; polys += out.regions.length;
        var cls = agr >= 0.985 ? 'ok' : 'warn';
        setState(tr, '変換済み' + (img.stretch ? '' : '(比率が違うので余白をのばしました)'), cls);
        tr.children[3].textContent = out.regions.length; tr.children[4].textContent = (agr * 100).toFixed(1) + '%'; tr.children[4].className = cls;
        var o = document.createElement('img'); o.className = 'o'; o.src = '../flags/' + f[0] + '.svg'; tr.children[5].appendChild(o);
        var cv = document.createElement('canvas'); drawRegions(cv, out.regions, 8); tr.children[6].appendChild(cv);
      } catch (e) { if (!tr) tr = rowFor(f); setState(tr, 'エラー: ' + e.message, 'ng'); bad++; }
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    $('sum').textContent = '変換 ' + n + ' / SVGなし ' + none + ' / q=0で対象外 ' + skipped + ' / エラー ' + bad + ' / 多角形 計' + polys;
    $('go').disabled = false; $('dl').disabled = n === 0;
  };
  $('dl').onclick = function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toFile()], { type: 'text/javascript' })); a.download = 'flags-svg.js'; a.click();
  };
  window.__toFile = toFile; // 動作確認用
})();
