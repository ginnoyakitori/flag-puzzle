(function () {
  var G = GameCore, S = 14, OX = G.WS.ox, OY = G.WS.oy, WW = G.WS.w, WH = G.WS.h; // 作業台46×30、旗の枠は(8,6)から30×18
  var INKCOL = { R: '#f00', G: '#0f0', B: '#00f', C: '#0ff', M: '#f0f', Y: '#ff0' };
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), ctx = cv.getContext('2d');
  cv.width = WW * S; cv.height = WH * S;
  var off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
  var octx = off.getContext('2d');

  var mode = 'add', tab = 'stage', stageNo = 0, qIdx = 0, stageList = [], qStars = [], flag, plates = [], sel = null, moves = 0, par = 1, t0 = 0, solved = false, drag = null, hintTimer = null;

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- 出題 ----
  function pool() { return G.available($('allFlags').checked); }
  function fillSelect() {
    var sl = $('flagSel'); sl.innerHTML = '';
    pool().forEach(function (f) {
      var o = document.createElement('option'); o.value = f.id; o.textContent = f.name + (f.q && !f.svg ? '(簡略)' : ''); sl.appendChild(o);
    });
  }
  // opts: 最初に板をずらす内容(ステージ1は位置だけ、2以降で回転、3以降で拡大縮小)
  function start(id, opts) {
    opts = opts || { rot: true, scale: true };
    flag = G.flagById(id); if ([].some.call($('flagSel').options, function (o) { return o.value === id; })) $('flagSel').value = id;
    var rg = G.range(); par = 0;
    plates = G.buildPlates(flag, mode).map(function (sp) {
      var x, y, k = opts.rot && Math.random() < 0.6 ? ri(1, 3) : 0, s10 = opts.scale && Math.random() < 0.6 ? ri(6, 14) : 10;
      if (opts.rot && opts.scale && s10 === 10 && k === 0) k = 1;
      do { x = ri(rg.x0 + 2, rg.x1 - 2); y = ri(rg.y0 + 2, rg.y1 - 2); } while (Math.abs(x - sp.x) + Math.abs(y - sp.y) < 4);
      par += 1 + Math.min(k, 4 - k) + Math.abs(s10 - 10);
      return { id: sp.id, ink: sp.ink, ops: sp.ops, bb: sp.bb, hole: sp.hole, kind: sp.kind, x: x, y: y, rot: k * 90, s10: s10, on: true };
    });
    var byInk = {};
    plates.forEach(function (pl) { (byInk[pl.ink] = byInk[pl.ink] || []).push(pl); });
    Object.keys(byInk).forEach(function (k) {
      var g = byInk[k], nums = g.map(function (_, i) { return i + 1; });
      nums.sort(function () { return Math.random() - 0.5; });
      g.forEach(function (pl, i) { pl.dn = k + '板' + (g.length > 1 ? nums[i] : ''); });
    });
    plates.sort(function (a, b) { return a.dn < b.dn ? -1 : 1; });
    sel = null; moves = 0; solved = false; t0 = Date.now();
    $('q').textContent = 'お題:「' + flag.name + '」の国旗をつくろう(板は' + plates.length + '枚)';
    $('result').hidden = true; $('refbox').hidden = true; $('info').textContent = '';
    renderChips(); draw(); loadRank();
  }
  function randomFlag() {
    var list = pool(), n;
    do { n = list[ri(0, list.length - 1)]; } while (list.length > 1 && n === flag);
    start(n.id);
  }

  // ---- ステージ ----
  function loadProg() { try { return JSON.parse(localStorage.getItem('fm-progress') || '{}'); } catch (e) { return {}; } }
  function saveProg(p) { try { localStorage.setItem('fm-progress', JSON.stringify(p)); } catch (e) { /* 保存できなくても遊べる */ } }
  function showView(play) { $('stageView').hidden = play; $('playView').hidden = !play; $('freeBar').hidden = tab !== 'free'; $('stageBar').hidden = tab !== 'stage'; }
  function renderStages() {
    showView(false);
    var prog = loadProg()[mode] || {}, all = $('unlockAll').checked, grid = $('stageGrid'); grid.innerHTML = '';
    stageList = G.stages(mode);
    $('stageHead').textContent = (mode === 'add' ? '加法混色' : '減法混色') + 'のステージ(全' + stageList.length + ')';
    stageList.forEach(function (_, i) {
      var n = i + 1, b = document.createElement('button'), st = prog[n] ? prog[n].stars : 0;
      b.className = 'stg'; b.disabled = !(all || n === 1 || prog[n - 1]);
      b.innerHTML = (b.disabled ? '🔒 ' : '') + n + '<small>' + (st ? '★★★'.slice(0, st) + '☆☆☆'.slice(0, 3 - st) : '未クリア') + '</small>';
      b.onclick = function () { startStage(n); };
      grid.appendChild(b);
    });
    $('stageNote').textContent = 'ステージ1は位置合わせだけ、2から板の向きがずれ、3から大きさもずれます。5問クリアで次のステージが開きます。';
  }
  function startStage(n) { stageNo = n; qIdx = 0; qStars = []; playQ(); }
  function playQ() {
    showView(true);
    $('stageInfo').textContent = 'ステージ' + stageNo + '  第' + (qIdx + 1) + '問 / ' + stageList[stageNo - 1].length;
    start(stageList[stageNo - 1][qIdx], { rot: stageNo >= 2, scale: stageNo >= 3 });
  }
  function finishQuestion() {
    var last = qIdx === stageList[stageNo - 1].length - 1, st = (stars().match(/★/g) || []).length;
    qStars[qIdx] = st; $('next').textContent = last ? 'ステージ選択へ' : '次の問題へ';
    if (!last) return;
    var avg = Math.max(1, Math.round(qStars.reduce(function (a, b) { return a + b; }, 0) / qStars.length));
    var p = loadProg(); p[mode] = p[mode] || {};
    if (!p[mode][stageNo] || p[mode][stageNo].stars < avg) p[mode][stageNo] = { stars: avg };
    saveProg(p); $('msg').textContent += '  🏆 ステージ' + stageNo + ' クリア!(' + '★★★'.slice(0, avg) + ')';
  }
  function nextAction() {
    if (tab === 'free') return randomFlag();
    if (qIdx < stageList[stageNo - 1].length - 1) { qIdx++; playQ(); } else renderStages();
  }

  // ---- 描画(単色の板を lighter=加法 / multiply=減法 で重ねる) ----
  function path(c, p) {
    c.beginPath();
    if (p.t === 'r') c.rect(p.x, p.y, p.w, p.h);
    else if (p.t === 'c') c.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
    else { p.pts.forEach(function (q, i) { i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); }
  }
  function applyTf(c, pl) {
    c.translate((pl.x + OX) * S, (pl.y + OY) * S); c.rotate(pl.rot * Math.PI / 180); c.scale(pl.s10 / 10 * S, pl.s10 / 10 * S);
  }
  function draw() {
    var add = mode === 'add';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = add ? '#000' : '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    plates.forEach(function (pl) {
      if (!pl.on) return;
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height);
      octx.save(); applyTf(octx, pl); octx.fillStyle = INKCOL[pl.ink];
      pl.ops.forEach(function (o) {
        octx.globalCompositeOperation = o.op === 'add' ? 'source-over' : 'destination-out';
        path(octx, o.p); octx.fill();
      });
      octx.restore(); octx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = add ? 'lighter' : 'multiply';
      ctx.drawImage(off, 0, 0);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(128,128,128,.4)'; ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height); ctx.rect(OX * S, OY * S, G.W * S, G.H * S); ctx.fill('evenodd');
    ctx.lineWidth = 2; ctx.setLineDash([]); ctx.strokeStyle = add ? '#ddd' : '#444';
    ctx.strokeRect(OX * S, OY * S, G.W * S, G.H * S);
    if (sel && sel.on) { // 選択中の板:点線の枠と中心(●)
      ctx.save(); applyTf(ctx, sel);
      ctx.lineWidth = 2 / (sel.s10 / 10 * S); ctx.setLineDash([6 / S, 4 / S]); ctx.strokeStyle = '#4a90e2';
      ctx.strokeRect(sel.bb.x0, sel.bb.y0, sel.bb.x1 - sel.bb.x0, sel.bb.y1 - sel.bb.y0);
      ctx.restore();
      ctx.fillStyle = '#4a90e2'; ctx.beginPath(); ctx.arc((sel.x + OX) * S, (sel.y + OY) * S, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
    }
    updateTools();
  }
  // お手本:板と同じく図形(長方形・円・多角形)のまま塗る
  function drawRef() {
    var rc = $('ref'), c = rc.getContext('2d'), k = 20;
    rc.width = G.W * k; rc.height = G.H * k;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = 'rgb(' + G.COLORS.K.join(',') + ')'; c.fillRect(0, 0, G.W, G.H);
    flag.regions.forEach(function (rg) {
      c.fillStyle = 'rgb(' + G.COLORS[rg.color].join(',') + ')';
      rg.prims.forEach(function (p) {
        if (p.t === 'r') { c.beginPath(); c.rect(p.x, p.y, p.w + 0.03, p.h + 0.03); } // 隣の図形との細い隙間を防ぐ
        else path(c, p);
        c.fill();
      });
    });
  }

  // お手本の表示:public/flags/<国ID>.svg があればそれを表示し、無ければ図形で描いた近似版にもどる
  function showRef() {
    var img = $('refimg'), rc = $('ref'), id = flag.id;
    img.hidden = true; rc.hidden = true;
    img.onload = function () { if (flag.id === id) { rc.hidden = true; img.hidden = false; } };
    img.onerror = function () { if (flag.id === id) { img.hidden = true; drawRef(); rc.hidden = false; } };
    img.src = 'flags/' + id + '.svg';
  }

  // ---- 操作 ----
  function worldPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * WW - OX, y: (e.clientY - r.top) / r.height * WH - OY };
  }
  function local(pl, p) { // 世界座標→板の座標
    var a = pl.rot * Math.PI / 180, s = pl.s10 / 10, dx = p.x - pl.x, dy = p.y - pl.y;
    return { x: (dx * Math.cos(a) + dy * Math.sin(a)) / s, y: (-dx * Math.sin(a) + dy * Math.cos(a)) / s };
  }
  function hits(pl, p) { var q = local(pl, p), b = pl.bb; return q.x >= b.x0 && q.x <= b.x1 && q.y >= b.y0 && q.y <= b.y1; }
  function area(pl) { var b = pl.bb, s = pl.s10 / 10; return (b.x1 - b.x0) * (b.y1 - b.y0) * s * s; }
  function select(pl) { sel = pl; renderChips(); }
  cv.addEventListener('pointerdown', function (e) {
    if (solved) return; cv.focus();
    var p = worldPos(e), hit = null;
    plates.forEach(function (pl) { if (pl.on && hits(pl, p) && (!hit || area(pl) < area(hit))) hit = pl; });
    if (!hit) return;
    select(hit);
    drag = { pl: hit, px: p.x, py: p.y, x0: hit.x, y0: hit.y };
    cv.setPointerCapture(e.pointerId); draw();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return; var p = worldPos(e), rg = G.range();
    drag.pl.x = clamp(Math.round(drag.x0 + p.x - drag.px), rg.x0, rg.x1);
    drag.pl.y = clamp(Math.round(drag.y0 + p.y - drag.py), rg.y0, rg.y1);
    draw();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.pl.x !== drag.x0 || drag.pl.y !== drag.y0) { moves++; afterMove(); }
    drag = null;
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  function move(dx, dy) {
    if (!sel || !sel.on || solved) return; var rg = G.range();
    var nx = clamp(sel.x + dx, rg.x0, rg.x1), ny = clamp(sel.y + dy, rg.y0, rg.y1);
    if (nx === sel.x && ny === sel.y) return; sel.x = nx; sel.y = ny; moves++; afterMove();
  }
  function rotate(d) { if (!sel || !sel.on || solved) return; sel.rot = (sel.rot + d + 360) % 360; moves++; renderChips(); afterMove(); }
  function scale(d) {
    if (!sel || !sel.on || solved) return; var n = clamp(sel.s10 + d, 5, 20);
    if (n === sel.s10) return; sel.s10 = n; moves++; renderChips(); afterMove();
  }
  cv.addEventListener('keydown', function (e) {
    var k = e.key, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (d) { e.preventDefault(); move(d[0], d[1]); }
    else if (k === 'q' || k === 'Q') rotate(e.shiftKey ? -90 : -15);
    else if (k === 'e' || k === 'E') rotate(e.shiftKey ? 90 : 15);
    else if (k === '-') scale(-1); else if (k === '+' || k === '=') scale(1);
  });
  $('rotL90').onclick = function () { rotate(-90); }; $('rotL15').onclick = function () { rotate(-15); };
  $('rotR15').onclick = function () { rotate(15); }; $('rotR90').onclick = function () { rotate(90); };
  $('scDown').onclick = function () { scale(-1); }; $('scUp').onclick = function () { scale(1); };
  function updateTools() {
    var dis = !(sel && sel.on) || solved;
    ['rotL90', 'rotL15', 'rotR15', 'rotR90', 'scDown', 'scUp'].forEach(function (id) { $(id).disabled = dis; });
  }

  function placements() {
    var o = {}; plates.forEach(function (pl) { o[pl.id] = { x: pl.x, y: pl.y, rot: pl.rot, s10: pl.s10, on: pl.on }; }); return o;
  }
  function afterMove() {
    draw(); $('info').textContent = '操作回数:' + moves;
    if (G.evaluate(flag, mode, placements()) >= G.PASS) win();
  }
  function stars() { return moves <= par * 1.5 ? '★★★' : moves <= par * 2.5 ? '★★☆' : '★☆☆'; }
  function win() {
    solved = true; sel = null; draw(); renderChips();
    var sec = Math.round((Date.now() - t0) / 1000);
    $('msg').textContent = '🎉 正解!「' + flag.name + '」 操作' + moves + '回・' + sec + '秒 ' + stars();
    $('name').value = localStorage.getItem('fm-name') || '';
    $('send').disabled = false; $('result').hidden = false;
    $('next').textContent = tab === 'free' ? '次の国旗へ' : '次の問題へ';
    if (tab === 'stage') finishQuestion();
  }

  function label(pl) { return pl.dn; } // 形・角度・倍率は表示しない
  function renderChips() {
    var box = $('chips'); box.innerHTML = '';
    plates.forEach(function (pl) {
      var b = document.createElement('button'); b.className = 'chip' + (pl === sel ? ' sel' : '');
      var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = INKCOL[pl.ink];
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = pl.on; cb.title = '板を使う';
      cb.onclick = function (e) {
        e.stopPropagation(); if (solved) { e.preventDefault(); return; }
        pl.on = cb.checked; moves++; if (!pl.on && sel === pl) sel = null; renderChips(); afterMove();
      };
      b.append(sw, document.createTextNode(label(pl) + ' '), cb);
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
    if (solved) return; moves += 3; showRef(); $('refbox').hidden = false;
    $('info').textContent = '操作回数:' + moves;
    clearTimeout(hintTimer); hintTimer = setTimeout(function () { $('refbox').hidden = true; }, 3000);
  };
  $('reset').onclick = function () { tab === 'stage' ? playQ() : start(flag.id); };
  $('rand').onclick = randomFlag; $('next').onclick = nextAction;
  $('flagSel').onchange = function () { start(this.value); };
  $('allFlags').onchange = function () { fillSelect(); randomFlag(); };
  $('back').onclick = renderStages; $('unlockAll').onchange = renderStages;
  function setTab(t) {
    tab = t; $('t-stage').className = t === 'stage' ? 'on' : ''; $('t-free').className = t === 'free' ? 'on' : '';
    if (t === 'stage') renderStages(); else { fillSelect(); showView(true); randomFlag(); }
  }
  $('t-stage').onclick = function () { setTab('stage'); }; $('t-free').onclick = function () { setTab('free'); };
  function setMode(m) {
    mode = m; $('m-add').className = m === 'add' ? 'on' : ''; $('m-sub').className = m === 'sub' ? 'on' : '';
    tab === 'stage' ? renderStages() : start(flag.id);
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

  fillSelect();
  flag = G.FLAGS[0]; renderStages();
})();