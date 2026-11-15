// public/flags/ に国旗SVGがそろっているか確認する: node check-flags.js
const fs = require('fs'), path = require('path');
const data = require('./public/flags-data.js');
const dir = path.join(__dirname, 'public', 'flags');
const have = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
const missing = data.filter(d => !have.has(d[0] + '.svg'));
const known = new Set(data.map(d => d[0] + '.svg'));
const extra = [...have].filter(f => f.endsWith('.svg') && !known.has(f));
console.log('ある: ' + (data.length - missing.length) + ' / ' + data.length);
if (missing.length) console.log('足りない:\n' + missing.map(d => '  ' + d[0] + '.svg  ' + d[1]).join('\n'));
if (extra.length) console.log('ゲームで使わないファイル(無視されます): ' + extra.join(', '));
