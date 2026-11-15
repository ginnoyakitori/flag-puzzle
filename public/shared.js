/* shared.js : サーバーとブラウザの両方で使う共通ロジック
 * - 国旗データ(33か国)
 * - 混色ルール(光=加法混色 / 絵の具=減法混色)
 * - 「必ず解ける」パズル生成(解を先に作り、それをピースに分割する)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CFP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 色 ----------
  const PRIMARIES = { light: ['R', 'G', 'B'], paint: ['C', 'M', 'Y'] };

  // 表示色(光モード・絵の具モード共通)
  const HEX = {
    R: '#d7263d', G: '#1b9e4b', B: '#1f4fbf', Y: '#ffd23f',
    W: '#f7f7f2', K: '#16161a', C: '#22c7d9', M: '#d23fb3',
  };

  // 国旗の色(R,G,B,Y,W,K)を作るのに必要な原色
  const NEED = {
    light: { R: ['R'], G: ['G'], B: ['B'], Y: ['R', 'G'], W: ['R', 'G', 'B'], K: [] },
    paint: { R: ['M', 'Y'], G: ['C', 'Y'], B: ['C', 'M'], Y: ['Y'], W: [], K: ['C', 'M', 'Y'] },
  };

  // 原色の組み合わせ → 結果の色
  const MIX = {
    light: { '': 'K', R: 'R', G: 'G', B: 'B', RG: 'Y', GB: 'C', RB: 'M', RGB: 'W' },
    paint: { '': 'W', C: 'C', M: 'M', Y: 'Y', MY: 'R', CY: 'G', CM: 'B', CMY: 'K' },
  };

  function mix(mode, list) {
    const order = PRIMARIES[mode];
    return MIX[mode][order.filter((p) => list.includes(p)).join('')];
  }

  const LEVELS = {
    easy: { lo: 4, hi: 5, label: 'かんたん' },
    normal: { lo: 3, hi: 5, label: 'ふつう' },
    hard: { lo: 2, hi: 4, label: 'むずかしい' },
  };

  // ---------- 国旗データ ----------
  const H = (colors, w, n) => {
    const g = [];
    colors.forEach((c) => { for (let i = 0; i < n; i++) g.push(c.repeat(w)); });
    return g;
  };
  const V = (colors, h, n) => {
    const row = colors.map((c) => c.repeat(n)).join('');
    return Array.from({ length: h }, () => row);
  };

  const FLAGS = [
    { id: 'ng', name: 'ナイジェリア', grid: V(['G', 'W', 'G'], 4, 2), note: '緑は豊かな国土と農業、白は平和を表すとされます。' },
    { id: 'pe', name: 'ペルー', grid: V(['R', 'W', 'R'], 4, 2), note: '赤・白・赤の縦三色旗。独立運動の時代の軍旗に由来するとされます。' },
    { id: 'at', name: 'オーストリア', grid: H(['R', 'W', 'R'], 6, 2), note: '赤白赤の横三色旗は、中世の公爵家の紋章に由来するとされます。' },
    { id: 'fr', name: 'フランス', grid: V(['B', 'W', 'R'], 4, 2), note: 'パリ市の青と赤に、王家の白を合わせたものとされます。' },
    { id: 'nl', name: 'オランダ', grid: H(['R', 'W', 'B'], 6, 2), note: '独立戦争の時代の旗に由来する、世界最古級の三色旗の一つです。' },
    { id: 'ru', name: 'ロシア', grid: H(['W', 'B', 'R'], 6, 2), note: '白青赤の三色旗は、ピョートル大帝の時代の船旗に由来するとされます。' },
    { id: 'it', name: 'イタリア', grid: V(['G', 'W', 'R'], 4, 2), note: 'ナポレオン時代のイタリアの三色旗に由来します。' },
    { id: 'hu', name: 'ハンガリー', grid: H(['R', 'W', 'G'], 6, 2), note: '赤白緑は、国の紋章の色に由来するとされます。' },
    { id: 'bg', name: 'ブルガリア', grid: H(['W', 'G', 'R'], 6, 2), note: '白は平和、緑は農業と自然、赤は勇気を表すとされます。' },
    { id: 'ml', name: 'マリ', grid: V(['G', 'Y', 'R'], 4, 2), note: '緑・黄・赤は、アフリカの独立の象徴である「汎アフリカ色」です。' },
    { id: 'lt', name: 'リトアニア', grid: H(['Y', 'G', 'R'], 6, 2), note: '黄は麦畑、緑は森、赤は国のために流された血を表すとされます。' },
    { id: 'de', name: 'ドイツ', grid: H(['K', 'R', 'Y'], 6, 2), note: '黒・赤・金は、19世紀の自由と統一を求める運動の色です。(金は黄で表現)' },
    { id: 'be', name: 'ベルギー', grid: V(['K', 'Y', 'R'], 4, 2), note: '黒・黄・赤は、ブラバント公国の紋章の色に由来します。' },
    { id: 'gn', name: 'ギニア', grid: V(['R', 'Y', 'G'], 4, 2), note: '赤・黄・緑の汎アフリカ色を使った縦三色旗です。' },
    { id: 'ga', name: 'ガボン', grid: H(['G', 'Y', 'B'], 6, 2), note: '緑は森、黄は赤道、青は海を表すとされます。' },
    { id: 'ro', name: 'ルーマニア', grid: V(['B', 'Y', 'R'], 4, 2), note: '青・黄・赤の縦三色旗は、19世紀半ばの革命の時代に広まりました。' },
    { id: 'ye', name: 'イエメン', grid: H(['R', 'W', 'K'], 6, 2), note: '赤・白・黒は、アラブ諸国に共通する汎アラブ色です。' },
    { id: 'ee', name: 'エストニア', grid: H(['B', 'K', 'W'], 6, 2), note: '青は空と海、黒は大地、白は雪や希望を表すとされます。' },
    {
      id: 'ae', name: 'アラブ首長国連邦',
      grid: ['RRGGGGGG', 'RRGGGGGG', 'RRWWWWWW', 'RRWWWWWW', 'RRKKKKKK', 'RRKKKKKK'],
      note: '赤・緑・白・黒の4色は、汎アラブ色です。',
    },
    { id: 'id', name: 'インドネシア', grid: H(['R', 'W'], 6, 2), note: '「メラ・プティ(赤と白)」と呼ばれます。赤は勇気、白は純粋さを表します。' },
    { id: 'pl', name: 'ポーランド', grid: H(['W', 'R'], 6, 2), note: '白と赤は、国章の白い鷲と赤い盾に由来します。' },
    { id: 'ua', name: 'ウクライナ', grid: H(['B', 'Y'], 6, 2), note: '青は空、黄は小麦畑を表すとされます。' },
    {
      id: 'co', name: 'コロンビア',
      grid: ['YYYYYY', 'YYYYYY', 'BBBBBB', 'RRRRRR'],
      note: '黄は大地の恵み、青は海、赤は独立のために流された血を表すとされます。',
    },
    { id: 'sl', name: 'シエラレオネ', grid: H(['G', 'W', 'B'], 6, 2), note: '緑は農業と山地、白は団結、青は海と港を表すとされます。(水色は青で表現)' },
    { id: 'mu', name: 'モーリシャス', grid: H(['R', 'B', 'Y', 'G'], 6, 1), note: '赤・青・黄・緑の4色の横縞旗です。' },
    { id: 'lu', name: 'ルクセンブルク', grid: H(['R', 'W', 'B'], 6, 2), note: 'オランダ国旗とよく似ていますが、下の帯は明るい水色です。(ここでは青で表現)' },
    {
      id: 'bj', name: 'ベナン',
      grid: ['GGYYY', 'GGYYY', 'GGRRR', 'GGRRR'],
      note: '緑・黄・赤の汎アフリカ色。左に緑の縦帯があります。',
    },
    {
      id: 'mg', name: 'マダガスカル',
      grid: ['WWRRRR', 'WWRRRR', 'WWGGGG', 'WWGGGG'],
      note: '左に白い縦帯、右に赤と緑の横帯を並べた旗です。',
    },
    { id: 'th', name: 'タイ', grid: ['RRRRRR', 'WWWWWW', 'BBBBBB', 'BBBBBB', 'WWWWWW', 'RRRRRR'], note: '中央の青は王室を表すとされます。' },
    { id: 'cr', name: 'コスタリカ', grid: ['BBBBBB', 'WWWWWW', 'RRRRRR', 'RRRRRR', 'WWWWWW', 'BBBBBB'], note: '青・白・赤・白・青の横縞旗です。' },
    {
      id: 'fi', name: 'フィンランド',
      grid: ['WWBWWW', 'BBBBBB', 'WWBWWW', 'WWBWWW'],
      note: '白は雪、青は湖と空を表すとされます。十字は中央よりも旗竿側に寄っています。',
    },
    {
      id: 'se', name: 'スウェーデン',
      grid: ['BBYBBB', 'YYYYYY', 'BBYBBB', 'BBYBBB'],
      note: '青地に黄の十字は、北欧十字旗の代表例です。',
    },
    {
      id: 'ch', name: 'スイス',
      grid: ['RRRRR', 'RRWRR', 'RWWWR', 'RRWRR', 'RRRRR'],
      note: '正方形の国旗は、世界でもスイスとバチカン市国だけです。',
    },
  ];

  // ---------- 乱数・図形ユーティリティ ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalize(cells) {
    const mr = Math.min(...cells.map((c) => c[0]));
    const mc = Math.min(...cells.map((c) => c[1]));
    return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  const rotate = (cells) => normalize(cells.map(([r, c]) => [c, -r]));
  const flip = (cells) => normalize(cells.map(([r, c]) => [r, -c]));

  const K = (r, c) => r * 64 + c;

  function adjacent(p, q) {
    for (const [a, b] of p) for (const [c, d] of q) if (Math.abs(a - c) + Math.abs(b - d) === 1) return true;
    return false;
  }

  // 1つの色の層(マスの集合)を、連結なポリオミノに分割する
  function partition(cells, rng, lo, hi) {
    const left = new Map();
    cells.forEach(([r, c]) => left.set(K(r, c), [r, c]));
    const nbrs = (r, c) =>
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && b >= 0 && left.has(K(a, b)));

    const pieces = [];
    while (left.size) {
      // 隅(空きの隣が少ないマス)から始めると、孤立マスが出にくい
      let best = [];
      let bn = 9;
      for (const [r, c] of left.values()) {
        const n = nbrs(r, c).length;
        if (n < bn) { bn = n; best = [[r, c]]; } else if (n === bn) best.push([r, c]);
      }
      const s = best[Math.floor(rng() * best.length)];
      const target = lo + Math.floor(rng() * (hi - lo + 1));
      const piece = [s];
      left.delete(K(s[0], s[1]));
      while (piece.length < target) {
        const cand = [];
        const seen = new Set();
        for (const [r, c] of piece) {
          for (const [a, b] of nbrs(r, c)) {
            const k = K(a, b);
            if (!seen.has(k)) { seen.add(k); cand.push([a, b]); }
          }
        }
        if (!cand.length) break;
        let pick = null;
        let ps = 1e9;
        for (const p of cand) {
          const sc = nbrs(p[0], p[1]).length + rng() * 2.5;
          if (sc < ps) { ps = sc; pick = p; }
        }
        piece.push(pick);
        left.delete(K(pick[0], pick[1]));
      }
      pieces.push(piece);
    }

    // 小さすぎるピースは隣のピースに合体
    let changed = true;
    while (changed) {
      changed = false;
      pieces.sort((a, b) => a.length - b.length);
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (p.length >= lo) break;
        let tgt = -1;
        for (let j = 0; j < pieces.length; j++) {
          if (j === i || pieces[j].length + p.length > 6) continue;
          if (adjacent(p, pieces[j]) && (tgt < 0 || pieces[j].length < pieces[tgt].length)) tgt = j;
        }
        if (tgt >= 0) {
          pieces[tgt] = pieces[tgt].concat(p);
          pieces.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return pieces;
  }

  function getFlag(id) {
    return FLAGS.find((f) => f.id === id);
  }

  // ---------- パズル生成 ----------
  function buildPuzzle(flagId, mode, level, seed) {
    const flag = getFlag(flagId);
    if (!flag) throw new Error('unknown flag: ' + flagId);
    if (!PRIMARIES[mode]) throw new Error('unknown mode: ' + mode);
    const lv = LEVELS[level] || LEVELS.normal;
    const rng = mulberry32(seed >>> 0);
    const grid = flag.grid;
    const rows = grid.length;
    const cols = grid[0].length;

    const pieces = [];
    for (const prim of PRIMARIES[mode]) {
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (NEED[mode][grid[r][c]].includes(prim)) cells.push([r, c]);
        }
      }
      if (!cells.length) continue;
      const parts = partition(cells, rng, lv.lo, lv.hi).sort((a, b) => b.length - a.length);
      for (const solution of parts) {
        // トレイに並ぶ向きはランダムにする(答えの向きを隠す)
        let shape = normalize(solution);
        const rot = Math.floor(rng() * 4);
        for (let i = 0; i < rot; i++) shape = rotate(shape);
        if (rng() < 0.5) shape = flip(shape);
        pieces.push({ id: 'p' + pieces.length, color: prim, shape, solution });
      }
    }
    return {
      flagId, name: flag.name, note: flag.note, mode, level, seed: seed >>> 0,
      rows, cols, grid, pieces,
    };
  }

  // ---------- 今日の1問 ----------
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function dailyInfo(dateStr) {
    const h = hashStr('cfp:' + dateStr);
    return {
      date: dateStr,
      flagId: FLAGS[h % FLAGS.length].id,
      mode: (h >>> 8) % 2 ? 'light' : 'paint',
      level: 'normal',
      seed: h,
    };
  }

  return {
    PRIMARIES, HEX, NEED, MIX, LEVELS, FLAGS,
    mix, mulberry32, normalize, rotate, flip, getFlag, buildPuzzle, dailyInfo,
  };
});