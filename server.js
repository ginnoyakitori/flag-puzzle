/* server.js : 依存パッケージなし(Node.js 標準モジュールのみ)
 *   起動: node server.js   →   http://localhost:3000
 *
 *   GET  /api/daily          今日の1問(日本時間の日付で決まる)
 *   GET  /api/scores?key=..  ランキング上位10件
 *   POST /api/scores         クリア記録の登録 {key, name, time, moves}
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const CFP = require('./shared.js');

const PORT = process.env.PORT || 3000;
// Render の Persistent Disk を使う場合は DATA_DIR=/var/data を指定(無料プランでは再デプロイで記録が消えます)
const DATA_DIR = process.env.DATA_DIR || __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }
const SCORE_FILE = path.join(DATA_DIR, 'scores.json');

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/client.js': 'client.js',
  '/shared.js': 'shared.js',
  '/style.css': 'style.css',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// ---------- スコア保存 ----------
let scores = {};
try {
  scores = JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8'));
} catch (e) {
  scores = {};
}
let saving = false;
let dirty = false;
function saveScores() {
  if (saving) { dirty = true; return; }
  saving = true;
  const tmp = SCORE_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(scores, null, 1), (err) => {
    if (!err) fs.rename(tmp, SCORE_FILE, () => done());
    else done();
  });
  function done() {
    saving = false;
    if (dirty) { dirty = false; saveScores(); }
  }
}

function validKey(key) {
  if (typeof key !== 'string') return false;
  if (/^daily:\d{4}-\d{2}-\d{2}$/.test(key)) return true;
  const m = /^([a-z]{2}):(light|paint):(easy|normal|hard)$/.exec(key);
  return !!(m && CFP.getFlag(m[1]));
}

function todayJST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------- ユーティリティ ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const lastPost = new Map(); // IPごとの連続投稿を制限
function rateLimited(ip) {
  const now = Date.now();
  const prev = lastPost.get(ip) || 0;
  lastPost.set(ip, now);
  if (lastPost.size > 5000) lastPost.clear();
  return now - prev < 1500;
}

// ---------- ルーティング ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    if (req.method === 'GET' && url.pathname === '/api/daily') {
      return sendJSON(res, 200, CFP.dailyInfo(todayJST()));
    }

    if (req.method === 'GET' && url.pathname === '/api/scores') {
      const key = url.searchParams.get('key');
      if (!validKey(key)) return sendJSON(res, 400, { error: 'bad key' });
      return sendJSON(res, 200, { key, scores: (scores[key] || []).slice(0, 10) });
    }

    if (req.method === 'POST' && url.pathname === '/api/scores') {
      // Render などのプロキシ越しでは、実際のクライアントIPは X-Forwarded-For の先頭
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
      if (rateLimited(ip)) return sendJSON(res, 429, { error: 'too many requests' });
      let data;
      try {
        data = JSON.parse(await readBody(req));
      } catch (e) {
        return sendJSON(res, 400, { error: 'bad json' });
      }
      const name = String(data.name || '').trim().slice(0, 12) || 'ななし';
      const time = Number(data.time);
      const moves = Number(data.moves);
      if (!validKey(data.key)) return sendJSON(res, 400, { error: 'bad key' });
      if (!(time >= 3 && time <= 86400) || !Number.isInteger(moves) || moves < 1 || moves > 1000) {
        return sendJSON(res, 400, { error: 'bad values' });
      }
      const list = scores[data.key] || [];
      list.push({ name, time: Math.round(time * 10) / 10, moves, at: new Date().toISOString() });
      list.sort((a, b) => a.time - b.time || a.moves - b.moves);
      scores[data.key] = list.slice(0, 20);
      saveScores();
      return sendJSON(res, 200, { ok: true, scores: scores[data.key].slice(0, 10) });
    }

    if (req.method === 'GET' && STATIC[url.pathname]) {
      const file = path.join(__dirname, STATIC[url.pathname]);
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(buf);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`カラーフラッグ・ポリオミノ: http://localhost:${PORT}`);
});