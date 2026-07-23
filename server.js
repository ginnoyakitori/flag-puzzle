const express = require('express');
const path = require('path');

const app = express();
// Renderなどのホスティング環境が割り当てるポート番号（process.env.PORT）を使用
const PORT = process.env.PORT || 3000;

// public フォルダ内の静的ファイル（HTML/CSS/JS）を配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートアクセス時に index.html を配信
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});