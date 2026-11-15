const express = require('express');
const fs = require('fs');
const path = require('path');
const Core = require('./public/game-core.js');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const FILE = path.join(__dirname, 'data', 'ranking.json');
let ranking = [];
try { ranking = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* 初回は空 */ }
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(ranking));
}
const better = (a, b) => a.moves - b.moves || a.ms - b.ms;

app.get('/api/ranking', (req, res) => {
  const { flag, mode } = req.query;
  res.json(ranking.filter(r => r.flag === flag && r.mode === mode).sort(better).slice(0, 10));
});

app.post('/api/score', (req, res) => {
  const b = req.body || {};
  const flag = Core.flagById(b.flag);
  if (!flag || !Core.INKS[b.mode]) return res.status(400).json({ error: 'invalid level' });
  const plates = Core.buildPlates(flag, b.mode);
  const placements = {}, rg = Core.range();
  const num = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);
  for (const pl of plates) {
    const p = (b.placements || {})[pl.id] || {};
    placements[pl.id] = {
      x: Math.max(rg.x0, Math.min(rg.x1, num(p.x, 0))),
      y: Math.max(rg.y0, Math.min(rg.y1, num(p.y, 0))),
      rot: ((Math.round(num(p.rot, 0) / 15) * 15) % 360 + 360) % 360,
      s10: Math.max(5, Math.min(20, num(p.s10, 10))),
      on: p.on !== false
    };
  }
  // サーバー側でも正解かどうか再判定する
  if (Core.evaluate(flag, b.mode, placements) < Core.PASS) return res.status(400).json({ error: 'not solved' });
  const moves = Math.max(plates.length, Math.min(999, Math.round(+b.moves) || 999));
  const ms = Math.max(0, Math.min(3600000, Math.round(+b.ms) || 0));
  const name = String(b.name || '名無し').replace(/[<>&"']/g, '').slice(0, 12) || '名無し';
  const entry = { flag: flag.id, mode: b.mode, name, moves, ms, at: Date.now() };
  const i = ranking.findIndex(r => r.flag === entry.flag && r.mode === entry.mode && r.name === name);
  if (i < 0) ranking.push(entry);
  else if (better(entry, ranking[i]) < 0) ranking[i] = entry;
  save();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('http://localhost:' + PORT));