(function () {
  var G = GameCore, S = 14, OX = 8, OY = 6, WW = 46, WH = 30; // 作業台は46×30マス、旗の枠は(8,6)から30×18
  var XMAX = 8, YMAX = 6;
  var INKCOL = { R: '#f00', G: '#0f0', B: '#00f', C: '#0ff', M: '#f0f', Y: '#ff0' };
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), ctx = cv.getContext('2d');
  cv.width = WW * S; cv.height = WH * S;
  var off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
  var octx = off.getContext('2d');

  var mode = 'add', flag, plates = [], sel = null, moves = 0, t0 = 0, solved = false, drag = null, hintTimer = null;

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- 出題 ----
  function start(idx) {
    flag = G.FLAGS[idx]; $('flagSel').value = idx;
    plates = G.buildPlates(flag, mode).map(function (pl) {
      var x, y; do { x = ri(-XMAX, XMAX); y = ri(-YMAX, YMAX); } while (Math.abs(x) + Math.abs(y) < 5);
      return { id: pl.id, ops: pl.ops, x: x, y: y, on: true };
    });
    sel = null; moves = 0; solved = false; t0 = Date.now();
    $('q').textContent = 'お題:「' + flag.name + '」の国旗をつくろう';
    $('result').hidden = true; $('refbox').hidden = true; $('info').textContent = '';
    renderChips(); draw(); loadRank();
  }
  function randomFlag() {
    var n; do { n = ri(0, G.FLAGS.length - 1); } while (G.FLAGS.length > 1 && G.FLAGS[n] === flag);
    start(n);
  }

  // ---- 描画 ----
  function shape(c, p, dx, dy) {
    c.beginPath();
    if (p.t === 'r') c.rect((p.x + dx) * S, (p.y + dy) * S, p.w * S, p.h * S);
    else c.arc((p.cx + dx) * S, (p.cy + dy) * S, p.r * S, 0, Math.PI * 2);
    c.fill();
  }
  function drawPlate(c, pl) {
    c.fillStyle = INKCOL[pl.id];
    pl.ops.forEach(function (o) {
      c.globalCompositeOperation = o.op === 'add' ? 'source-over' : 'destination-out';
      shape(c, o.p, pl.x + OX, pl.y + OY);
    });
    c.globalCompositeOperation = 'source-over';
  }
  function draw() {
    var add = mode === 'add';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = add ? '#000' : '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    plates.forEach(function (pl) {
      if (!pl.on) return;
      octx.clearRect(0, 0, off.width, off.height); drawPlate(octx, pl);
      ctx.globalCompositeOperation = add ? 'lighter' : 'multiply';
      ctx.drawImage(off, 0, 0);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(128,128,128,.4)'; ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height); ctx.rect(OX * S, OY * S, G.W * S, G.H * S); ctx.fill('evenodd');
    ctx.lineWidth = 2; ctx.setLineDash([]); ctx.strokeStyle = add ? '#ddd' : '#444';
    ctx.strokeRect(OX * S, OY * S, G.W * S, G.H * S);
    if (sel && sel.on) {
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 2;
      ctx.strokeRect((sel.x + OX) * S, (sel.y + OY) * S, G.W * S, G.H * S); ctx.setLineDash([]);
    }
  }
  function drawRef() {
    var c = $('ref').getContext('2d'), k = $('ref').width / G.W, x, y;
    for (x = 0; x < G.W; x++) for (y = 0; y < G.H; y++) {
      c.fillStyle = 'rgb(' + G.colorAt(flag, x + 0.5, y + 0.5).join(',') + ')';
      c.fillRect(x * k, y * k, k + 1, k + 1);
    }
  }

  // ---- 操作 ----
  function worldPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * WW - OX, y: (e.clientY - r.top) / r.height * WH - OY };
  }
  function inBox(pl, p) { return p.x >= pl.x && p.x <= pl.x + G.W && p.y >= pl.y && p.y <= pl.y + G.H; }
  function select(pl) {
    sel = pl; plates.splice(plates.indexOf(pl), 1); plates.push(pl); renderChips();
  }
  cv.addEventListener('pointerdown', function (e) {
    if (solved) return; cv.focus();
    var p = worldPos(e), hit = null, i;
    if (sel && sel.on && inBox(sel, p)) hit = sel;
    else for (i = plates.length - 1; i >= 0; i--) if (plates[i].on && inBox(plates[i], p)) { hit = plates[i]; break; }
    if (!hit) return;
    select(hit);
    drag = { pl: hit, px: p.x, py: p.y, x0: hit.x, y0: hit.y };
    cv.setPointerCapture(e.pointerId); draw();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return; var p = worldPos(e);
    drag.pl.x = clamp(Math.round(drag.x0 + p.x - drag.px), -XMAX, XMAX);
    drag.pl.y = clamp(Math.round(drag.y0 + p.y - drag.py), -YMAX, YMAX);
    draw();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.pl.x !== drag.x0 || drag.pl.y !== drag.y0) { moves++; afterMove(); }
    drag = null;
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', function (e) {
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !sel || !sel.on || solved) return; e.preventDefault();
    var nx = clamp(sel.x + d[0], -XMAX, XMAX), ny = clamp(sel.y + d[1], -YMAX, YMAX);
    if (nx === sel.x && ny === sel.y) return;
    sel.x = nx; sel.y = ny; moves++; afterMove();
  });

  function placements() {
    var o = {}; plates.forEach(function (pl) { o[pl.id] = { x: pl.x, y: pl.y, on: pl.on }; }); return o;
  }
  function afterMove() {
    draw(); $('info').textContent = '操作回数:' + moves;
    if (G.evaluate(flag, mode, placements()) >= G.PASS) win();
  }
  function stars() {
    var par = plates.length;
    return moves <= par * 2 ? '★★★' : moves <= par * 3 ? '★★☆' : '★☆☆';
  }
  function win() {
    solved = true; sel = null; draw(); renderChips();
    var sec = Math.round((Date.now() - t0) / 1000);
    $('msg').textContent = '🎉 正解!「' + flag.name + '」 操作' + moves + '回・' + sec + '秒 ' + stars();
    $('name').value = localStorage.getItem('fm-name') || '';
    $('send').disabled = false; $('result').hidden = false;
  }

  function renderChips() {
    var box = $('chips'); box.innerHTML = '';
    plates.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (pl) {
      var b = document.createElement('button'); b.className = 'chip' + (pl === sel ? ' sel' : '');
      var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = INKCOL[pl.id];
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = pl.on; cb.title = '板を使う';
      cb.onclick = function (e) {
        e.stopPropagation(); if (solved) { e.preventDefault(); return; }
        pl.on = cb.checked; moves++; if (!pl.on && sel === pl) sel = null; renderChips(); afterMove();
      };
      b.append(sw, document.createTextNode(pl.id + '板 '), cb);
      b.onclick = function () { if (!solved) { select(pl); draw(); } };
      box.appendChild(b);
    });
  }

  // ---- ボタン類 ----
  $('check').onclick = function () {
    if (solved) return; moves++;
    var r = G.evaluate(flag, mode, placements());
    $('info').textContent = '一致度:' + Math.round(r * 100) + '%  / 操作回数:' + moves;
  };
  $('hint').onclick = function () {
    if (solved) return; moves += 3; drawRef(); $('refbox').hidden = false;
    $('info').textContent = '操作回数:' + moves;
    clearTimeout(hintTimer); hintTimer = setTimeout(function () { $('refbox').hidden = true; }, 3000);
  };
  $('reset').onclick = function () { start(G.FLAGS.indexOf(flag)); };
  $('rand').onclick = randomFlag; $('next').onclick = randomFlag;
  $('flagSel').onchange = function () { start(+this.value); };
  function setMode(m) {
    mode = m; $('m-add').className = m === 'add' ? 'on' : ''; $('m-sub').className = m === 'sub' ? 'on' : '';
    start(G.FLAGS.indexOf(flag));
  }
  $('m-add').onclick = function () { setMode('add'); };
  $('m-sub').onclick = function () { setMode('sub'); };

  // ---- サーバー連携 ----
  $('send').onclick = function () {
    var name = $('name').value.trim() || '名無し'; localStorage.setItem('fm-name', name);
    $('send').disabled = true;
    fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag: flag.id, mode: mode, name: name, moves: moves, ms: Date.now() - t0, placements: placements() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { $('msg').textContent += j.ok ? '(記録しました)' : '(記録に失敗:' + j.error + ')'; loadRank(); })
      .catch(function () { $('msg').textContent += '(通信エラー)'; $('send').disabled = false; });
  };
  function loadRank() {
    fetch('/api/ranking?flag=' + flag.id + '&mode=' + mode).then(function (r) { return r.json(); }).then(function (list) {
      var ol = $('rank'); ol.innerHTML = '';
      if (!list.length) { ol.innerHTML = '<li>まだ記録がありません</li>'; return; }
      list.forEach(function (e) {
        var li = document.createElement('li');
        li.textContent = e.name + ' — ' + e.moves + '回 / ' + Math.round(e.ms / 1000) + '秒'; ol.appendChild(li);
      });
    }).catch(function () { $('rank').innerHTML = '<li>ランキングを取得できません</li>'; });
  }

  G.FLAGS.forEach(function (f, i) {
    var o = document.createElement('option'); o.value = i; o.textContent = f.name; $('flagSel').appendChild(o);
  });
  start(ri(0, G.FLAGS.length - 1));
})();
