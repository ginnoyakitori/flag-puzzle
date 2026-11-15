/* client.js : ゲーム本体(ブラウザ側) */
(() => {
  'use strict';
  const { FLAGS, HEX, PRIMARIES, NEED, LEVELS, buildPuzzle, mix, rotate, flip, dailyInfo } = CFP;
  const $ = (s) => document.querySelector(s);

  const MODE_LABEL = { light: '光', paint: '絵の具' };

  const state = {
    flagId: 'fr',
    mode: 'light',
    level: 'normal',
    seed: 0,
    daily: null,          // 今日の1問のとき {date,...}
    puzzle: null,
    placed: [],           // [{id, cells:[[r,c],...]}] 置いた順
    shapes: {},           // id -> 現在の向きの形
    selected: null,
    hover: null,
    hint: false,
    moves: 0,
    startedAt: 0,
    elapsed: 0,
    timer: null,
    cleared: false,
    assisted: false,      // 「答えを見る」を使った
  };

  let cellEls = [];
  let clearedMap = {};
  try { clearedMap = JSON.parse(localStorage.getItem('cfp-cleared') || '{}'); } catch (e) { clearedMap = {}; }

  // ---------- 基本ヘルパー ----------
  const pieceById = (id) => state.puzzle.pieces.find((p) => p.id === id);
  const isPlaced = (id) => state.placed.some((p) => p.id === id);

  function anchorOf(shape) {
    const cr = shape.reduce((s, c) => s + c[0], 0) / shape.length;
    const cc = shape.reduce((s, c) => s + c[1], 0) / shape.length;
    let best = shape[0];
    let bd = 1e9;
    for (const c of shape) {
      const d = (c[0] - cr) ** 2 + (c[1] - cc) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function computeLayers() {
    const P = state.puzzle;
    const layers = Array.from({ length: P.rows }, () => Array.from({ length: P.cols }, () => []));
    for (const pl of state.placed) {
      const color = pieceById(pl.id).color;
      for (const [r, c] of pl.cells) layers[r][c].push(color);
    }
    return layers;
  }

  function canPlace(cells, color, layers) {
    const P = state.puzzle;
    return cells.every(([r, c]) => r >= 0 && c >= 0 && r < P.rows && c < P.cols && !layers[r][c].includes(color));
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ---------- 描画: 国旗サムネイル ----------
  function drawFlag(canvas, grid, unit) {
    const rows = grid.length;
    const cols = grid[0].length;
    const u = unit || Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
    canvas.width = cols * u;
    canvas.height = rows * u;
    const ctx = canvas.getContext('2d');
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = HEX[grid[r][c]];
        ctx.fillRect(c * u, r * u, u, u);
      }
    }
  }

  function renderFlagList() {
    const list = $('#flagList');
    list.innerHTML = '';
    for (const f of FLAGS) {
      const el = document.createElement('div');
      el.className = 'flag-item' + (f.id === state.flagId && !state.daily ? ' active' : '');
      el.dataset.id = f.id;
      const cv = document.createElement('canvas');
      cv.width = 72; cv.height = 48;
      drawFlag(cv, f.grid, 12);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = f.name;
      const bd = document.createElement('div');
      bd.className = 'bd';
      const lt = clearedMap[f.id + ':light'];
      const pt = clearedMap[f.id + ':paint'];
      bd.innerHTML = `<span class="${lt ? 'done' : ''}">光${lt ? '✓' : '・'}</span> <span class="${pt ? 'done' : ''}">絵${pt ? '✓' : '・'}</span>`;
      el.append(cv, nm, bd);
      list.appendChild(el);
    }
    const n = Object.keys(clearedMap).length;
    $('#clearCount').textContent = `(クリア ${n}/${FLAGS.length * 2})`;
  }

  // ---------- 描画: 盤面 ----------
  function buildBoard() {
    const P = state.puzzle;
    const board = $('#board');
    board.innerHTML = '';
    board.classList.remove('win');
    board.style.setProperty('--cols', P.cols);
    board.style.setProperty('--rows', P.rows);
    cellEls = [];
    for (let r = 0; r < P.rows; r++) {
      const row = [];
      for (let c = 0; c < P.cols; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.r = r;
        el.dataset.c = c;
        board.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }
    fitBoard();
  }

  function fitBoard() {
    if (!state.puzzle) return;
    const P = state.puzzle;
    const wrap = $('#boardWrap');
    const avail = Math.max(200, Math.min(wrap.clientWidth || 520, 560) - 20);
    const cs = Math.max(30, Math.min(64, Math.floor((avail - 2 * (P.cols - 1)) / P.cols)));
    $('#board').style.setProperty('--cs', cs + 'px');
  }

  function updateBoard() {
    const P = state.puzzle;
    const layers = computeLayers();

    // 各マスにかかっているピース(輪郭描画用)
    const cover = Array.from({ length: P.rows }, () => Array.from({ length: P.cols }, () => []));
    for (const pl of state.placed) {
      const set = new Set(pl.cells.map(([r, c]) => r * 64 + c));
      const color = pieceById(pl.id).color;
      for (const [r, c] of pl.cells) {
        cover[r][c].push({
          color,
          top: !set.has((r - 1) * 64 + c),
          bottom: !set.has((r + 1) * 64 + c),
          left: !set.has(r * 64 + c - 1),
          right: !set.has(r * 64 + c + 1),
        });
      }
    }

    // ゴースト(置く前のプレビュー)
    const ghostMap = new Map();
    if (state.selected && state.hover) {
      const sh = state.shapes[state.selected];
      const [ar, ac] = anchorOf(sh);
      const cells = sh.map(([r, c]) => [r - ar + state.hover[0], c - ac + state.hover[1]]);
      const color = pieceById(state.selected).color;
      const ok = canPlace(cells, color, layers);
      for (const [r, c] of cells) ghostMap.set(r * 64 + c, { color, ok });
    }

    let match = 0;
    for (let r = 0; r < P.rows; r++) {
      for (let c = 0; c < P.cols; c++) {
        const el = cellEls[r][c];
        const letter = mix(P.mode, layers[r][c]);
        const target = P.grid[r][c];
        const ok = letter === target;
        if (ok) match++;
        el.style.background = HEX[letter];
        el.innerHTML = '';

        for (const cv of cover[r][c]) {
          const idx = PRIMARIES[P.mode].indexOf(cv.color);
          const off = 2 + idx * 4;
          const d = document.createElement('div');
          d.className = 'pc';
          d.style.borderColor = HEX[cv.color];
          d.style.top = (cv.top ? off : 0) + 'px';
          d.style.bottom = (cv.bottom ? off : 0) + 'px';
          d.style.left = (cv.left ? off : 0) + 'px';
          d.style.right = (cv.right ? off : 0) + 'px';
          d.style.borderTopWidth = cv.top ? '3px' : '0';
          d.style.borderBottomWidth = cv.bottom ? '3px' : '0';
          d.style.borderLeftWidth = cv.left ? '3px' : '0';
          d.style.borderRightWidth = cv.right ? '3px' : '0';
          el.appendChild(d);
        }

        const g = ghostMap.get(r * 64 + c);
        if (g) {
          const d = document.createElement('div');
          d.className = 'ghost' + (g.ok ? '' : ' bad');
          d.style.background = HEX[g.color];
          el.appendChild(d);
        }

        if (state.hint) {
          const t = document.createElement('div');
          t.className = 'tgt';
          t.style.background = HEX[target];
          el.appendChild(t);
          const n = document.createElement('div');
          n.className = 'need';
          n.textContent = NEED[P.mode][target].join('') || '–';
          el.appendChild(n);
          if (ok) {
            const k = document.createElement('div');
            k.className = 'chk';
            k.textContent = '✓';
            el.appendChild(k);
          }
        }
      }
    }

    const total = P.rows * P.cols;
    $('#match').textContent = `${match}/${total}`;
    $('#barFill').style.width = (match / total * 100) + '%';
    return match === total;
  }

  // ---------- 描画: トレイ ----------
  function renderTray() {
    const tray = $('#tray');
    tray.innerHTML = '';
    for (const p of state.puzzle.pieces) {
      const shape = state.shapes[p.id];
      const w = Math.max(...shape.map((c) => c[1])) + 1;
      const h = Math.max(...shape.map((c) => c[0])) + 1;
      const el = document.createElement('div');
      el.className = 'piece' + (state.selected === p.id ? ' sel' : '') + (isPlaced(p.id) ? ' placed' : '');
      el.dataset.id = p.id;
      el.style.gridTemplateColumns = `repeat(${w}, 18px)`;
      el.style.gridTemplateRows = `repeat(${h}, 18px)`;
      for (const [r, c] of shape) {
        const m = document.createElement('div');
        m.className = 'mc';
        m.style.gridRow = r + 1;
        m.style.gridColumn = c + 1;
        m.style.background = HEX[p.color];
        el.appendChild(m);
      }
      tray.appendChild(el);
    }
    const left = state.puzzle.pieces.filter((p) => !isPlaced(p.id)).length;
    $('#trayInfo').textContent = `(残り ${left} / ${state.puzzle.pieces.length} 個)`;
  }

  function renderRules() {
    const P = state.puzzle;
    const prim = PRIMARIES[P.mode];
    const swatch = (l) => `<span class="sw" style="background:${HEX[l]}"></span>`;
    let html = '';
    if (P.mode === 'light') {
      html += '<b>光の混色(足し算)</b>';
      html += `<div class="row">何もない=${swatch('K')}黒</div>`;
      html += `<div class="row">${swatch('R')}+${swatch('G')}=${swatch('Y')}黄</div>`;
      html += `<div class="row">${swatch('G')}+${swatch('B')}=${swatch('C')}</div>`;
      html += `<div class="row">${swatch('R')}+${swatch('B')}=${swatch('M')}</div>`;
      html += `<div class="row">${swatch('R')}+${swatch('G')}+${swatch('B')}=${swatch('W')}白</div>`;
    } else {
      html += '<b>絵の具の混色(重ね塗り)</b>';
      html += `<div class="row">何もない=${swatch('W')}白</div>`;
      html += `<div class="row">${swatch('C')}+${swatch('M')}=${swatch('B')}青</div>`;
      html += `<div class="row">${swatch('M')}+${swatch('Y')}=${swatch('R')}赤</div>`;
      html += `<div class="row">${swatch('Y')}+${swatch('C')}=${swatch('G')}緑</div>`;
      html += `<div class="row">${swatch('C')}+${swatch('M')}+${swatch('Y')}=${swatch('K')}黒</div>`;
    }
    html += `<div class="row" style="margin-top:6px">使う原色: ${prim.map((p) => swatch(p)).join(' ')}</div>`;
    $('#ruleBox').innerHTML = html;
  }

  function renderHeader() {
    const P = state.puzzle;
    $('#flagName').textContent = P.name;
    const b = $('#badge');
    b.textContent = state.daily
      ? `今日の1問 ${state.daily.date}`
      : `${MODE_LABEL[P.mode]}・${LEVELS[P.level].label}`;
    b.className = 'badge' + (state.daily ? ' daily' : '');
    if (state.daily) b.textContent += `(${MODE_LABEL[P.mode]})`;
    document.querySelectorAll('#modeSeg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === state.mode));
    document.querySelectorAll('#levelSeg button').forEach((x) => x.classList.toggle('on', x.dataset.level === state.level));
    $('#hintBtn').classList.toggle('on', state.hint);
    $('#moves').textContent = state.moves;
    $('#timer').textContent = fmtTime(state.elapsed);
    drawFlag($('#target'), P.grid, 20);
    document.querySelectorAll('.flag-item').forEach((el) =>
      el.classList.toggle('active', el.dataset.id === state.flagId && !state.daily));
  }

  function renderAll() {
    renderHeader();
    renderTray();
    const done = updateBoard();
    return done;
  }

  // ---------- パズル開始 ----------
  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function startPuzzle(opts = {}) {
    stopTimer();
    if (opts.flagId) state.flagId = opts.flagId;
    if (opts.mode) state.mode = opts.mode;
    if (opts.level) state.level = opts.level;
    state.seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    state.daily = opts.daily || null;
    state.puzzle = buildPuzzle(state.flagId, state.mode, state.level, state.seed);
    state.placed = [];
    state.shapes = {};
    for (const p of state.puzzle.pieces) state.shapes[p.id] = p.shape.map((c) => c.slice());
    state.selected = null;
    state.hover = null;
    state.moves = 0;
    state.startedAt = 0;
    state.elapsed = 0;
    state.cleared = false;
    state.assisted = false;
    buildBoard();
    renderRules();
    renderAll();
    loadRanking();
  }

  function resetCurrent() {
    stopTimer();
    state.placed = [];
    state.selected = null;
    state.hover = null;
    state.moves = 0;
    state.startedAt = 0;
    state.elapsed = 0;
    state.cleared = false;
    state.assisted = false;
    for (const p of state.puzzle.pieces) state.shapes[p.id] = p.shape.map((c) => c.slice());
    $('#board').classList.remove('win');
    renderAll();
  }

  function ensureTimer() {
    if (state.startedAt || state.cleared) return;
    state.startedAt = Date.now();
    state.timer = setInterval(() => {
      state.elapsed = (Date.now() - state.startedAt) / 1000;
      $('#timer').textContent = fmtTime(state.elapsed);
    }, 250);
  }

  // ---------- 操作 ----------
  function select(id) {
    if (state.cleared) return;
    state.selected = state.selected === id ? null : id;
    renderTray();
    updateBoard();
  }

  function transformSelected(fn) {
    if (!state.selected) return;
    state.shapes[state.selected] = fn(state.shapes[state.selected]);
    renderTray();
    updateBoard();
  }

  function shake() {
    const b = $('#board');
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }

  function placeAt(r, c) {
    const id = state.selected;
    const P = state.puzzle;
    const sh = state.shapes[id];
    const [ar, ac] = anchorOf(sh);
    const cells = sh.map(([rr, cc]) => [rr - ar + r, cc - ac + c]);
    const layers = computeLayers();
    if (!canPlace(cells, pieceById(id).color, layers)) { shake(); return; }
    ensureTimer();
    state.placed.push({ id, cells });
    state.selected = null;
    state.moves++;
    $('#moves').textContent = state.moves;
    renderTray();
    const done = updateBoard();
    if (done && !state.cleared) onClear();
  }

  function pickUp(r, c) {
    for (let i = state.placed.length - 1; i >= 0; i--) {
      if (state.placed[i].cells.some(([rr, cc]) => rr === r && cc === c)) {
        const [pl] = state.placed.splice(i, 1);
        state.selected = pl.id;
        state.hover = [r, c];
        renderTray();
        updateBoard();
        return;
      }
    }
  }

  function undo() {
    if (state.cleared || !state.placed.length) return;
    state.placed.pop();
    state.selected = null;
    renderTray();
    updateBoard();
  }

  function showSolution() {
    if (state.cleared) return;
    state.placed = state.puzzle.pieces.map((p) => ({ id: p.id, cells: p.solution.map((c) => c.slice()) }));
    state.selected = null;
    state.assisted = true;
    stopTimer();
    renderTray();
    updateBoard();
    $('#board').classList.add('win');
  }

  // ---------- クリア ----------
  function onClear() {
    state.cleared = true;
    stopTimer();
    if (state.startedAt) state.elapsed = (Date.now() - state.startedAt) / 1000;
    $('#timer').textContent = fmtTime(state.elapsed);
    $('#board').classList.add('win');

    const P = state.puzzle;
    clearedMap[P.flagId + ':' + P.mode] = true;
    try { localStorage.setItem('cfp-cleared', JSON.stringify(clearedMap)); } catch (e) { /* ignore */ }
    renderFlagList();

    $('#clearFlag').textContent = `${P.name}(${MODE_LABEL[P.mode]})を完成!`;
    $('#clearNote').textContent = P.note;
    $('#clearStat').textContent = `タイム ${fmtTime(state.elapsed)} ・ 手数 ${state.moves}`;
    $('#submitMsg').textContent = '';
    $('#submitBtn').disabled = false;
    try { $('#nameInput').value = localStorage.getItem('cfp-name') || ''; } catch (e) { /* ignore */ }
    setTimeout(() => {
      const dlg = $('#clearDialog');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }, 500);
  }

  // ---------- ランキング(サーバー) ----------
  const rankKey = () => (state.daily ? 'daily:' + state.daily.date : `${state.flagId}:${state.mode}:${state.level}`);

  function renderRanking(list) {
    const ol = $('#rankList');
    ol.innerHTML = '';
    if (!list || !list.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.style.listStyle = 'none';
      li.textContent = 'まだ記録がありません';
      ol.appendChild(li);
      return;
    }
    for (const s of list) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = s.name + ' ';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = fmtTime(s.time);
      const m = document.createElement('span');
      m.className = 'm';
      m.textContent = ` (${s.moves}手)`;
      li.append(name, t, m);
      ol.appendChild(li);
    }
  }

  async function loadRanking() {
    const P = state.puzzle;
    $('#rankKey').textContent = state.daily
      ? `今日の1問(${state.daily.date})`
      : `${P.name}・${MODE_LABEL[P.mode]}・${LEVELS[P.level].label}`;
    try {
      const res = await fetch('/api/scores?key=' + encodeURIComponent(rankKey()));
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      renderRanking(data.scores);
    } catch (e) {
      renderRanking(null);
      $('#rankKey').textContent += '(サーバーに接続できません)';
    }
  }

  async function submitScore() {
    const name = $('#nameInput').value.trim();
    try { localStorage.setItem('cfp-name', name); } catch (e) { /* ignore */ }
    $('#submitBtn').disabled = true;
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rankKey(), name, time: state.elapsed, moves: state.moves }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      renderRanking(data.scores);
      $('#submitMsg').textContent = '記録を送りました!ランキングを更新しました。';
    } catch (e) {
      $('#submitMsg').textContent = '送信できませんでした(' + e.message + ')。';
      $('#submitBtn').disabled = false;
    }
  }

  // ---------- 今日の1問 ----------
  async function loadDaily() {
    let info;
    try {
      const res = await fetch('/api/daily');
      if (!res.ok) throw new Error();
      info = await res.json();
    } catch (e) {
      const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      info = dailyInfo(d);
    }
    startPuzzle({ flagId: info.flagId, mode: info.mode, level: info.level, seed: info.seed, daily: info });
  }

  // ---------- イベント ----------
  function cellOf(e) {
    const el = e.target.closest && e.target.closest('.cell');
    return el ? [Number(el.dataset.r), Number(el.dataset.c)] : null;
  }

  function bindEvents() {
    $('#flagList').addEventListener('click', (e) => {
      const it = e.target.closest('.flag-item');
      if (it) startPuzzle({ flagId: it.dataset.id });
    });

    $('#modeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) startPuzzle({ mode: b.dataset.mode });
    });
    $('#levelSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) startPuzzle({ level: b.dataset.level });
    });

    $('#dailyBtn').addEventListener('click', loadDaily);
    $('#newBtn').addEventListener('click', () => startPuzzle({ daily: null }));

    $('#tray').addEventListener('click', (e) => {
      const el = e.target.closest('.piece');
      if (!el || state.cleared) return;
      const id = el.dataset.id;
      if (isPlaced(id)) {
        state.placed = state.placed.filter((p) => p.id !== id);
        state.selected = id;
        renderTray();
        updateBoard();
      } else {
        select(id);
      }
    });

    const board = $('#board');
    board.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const rc = cellOf(e);
      if (!rc) return;
      if (state.hover && state.hover[0] === rc[0] && state.hover[1] === rc[1]) return;
      state.hover = rc;
      if (state.selected) updateBoard();
    });
    board.addEventListener('pointerleave', () => {
      state.hover = null;
      if (state.selected) updateBoard();
    });
    board.addEventListener('click', (e) => {
      if (state.cleared || state.assisted) return;
      const rc = cellOf(e);
      if (!rc) return;
      if (state.selected) placeAt(rc[0], rc[1]);
      else pickUp(rc[0], rc[1]);
    });
    board.addEventListener('contextmenu', (e) => {
      const rc = cellOf(e);
      if (!rc) return;
      e.preventDefault();
      if (!state.cleared && !state.assisted) { state.selected = null; pickUp(rc[0], rc[1]); }
    });

    $('#rotBtn').addEventListener('click', () => transformSelected(rotate));
    $('#flipBtn').addEventListener('click', () => transformSelected(flip));
    $('#undoBtn').addEventListener('click', undo);
    $('#resetBtn').addEventListener('click', resetCurrent);
    $('#hintBtn').addEventListener('click', () => {
      state.hint = !state.hint;
      $('#hintBtn').classList.toggle('on', state.hint);
      updateBoard();
    });
    $('#solveBtn').addEventListener('click', () => {
      if (confirm('答えを表示します。この問題はランキングに記録できなくなります。よろしいですか?')) showSolution();
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'r') transformSelected(rotate);
      else if (k === 'f') transformSelected(flip);
      else if (k === 'escape') { state.selected = null; renderTray(); updateBoard(); }
    });

    $('#submitBtn').addEventListener('click', submitScore);
    $('#nextBtn').addEventListener('click', () => {
      $('#clearDialog').close();
      startPuzzle({ daily: null });
    });
    window.addEventListener('resize', fitBoard);
  }

  // ---------- 起動 ----------
  renderFlagList();
  bindEvents();
  startPuzzle({ flagId: 'fr', mode: 'light', level: 'normal' });
})();