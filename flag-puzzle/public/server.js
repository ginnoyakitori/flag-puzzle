const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// public フォルダ内の静的ファイルを配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートアクセス時に index.html を返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});