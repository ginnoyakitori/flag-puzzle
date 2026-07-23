// 正解座標の設定（target-area基準）
const targets = {
  'bg-piece': { x: 0, y: 0, placed: false },
  'circle-piece': { x: 90, y: 40, placed: false }
};

const targetArea = document.getElementById('target-area');
const pieces = document.querySelectorAll('.piece');

pieces.forEach(piece => {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  // PC・スマホ共通の Pointer Events
  piece.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = piece.offsetLeft;
    initialTop = piece.offsetTop;

    piece.setPointerCapture(e.pointerId);
    piece.style.cursor = 'grabbing';
    piece.style.zIndex = 1000;
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    piece.style.left = `${initialLeft + dx}px`;
    piece.style.top = `${initialTop + dy}px`;
  });

  window.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    piece.releasePointerCapture(e.pointerId);
    piece.style.cursor = 'grab';
    piece.style.zIndex = 1;

    checkPlacement(piece);
  });
});

function checkPlacement(piece) {
  const targetRect = targetArea.getBoundingClientRect();
  const pieceRect = piece.getBoundingClientRect();

  const currentX = pieceRect.left - targetRect.left;
  const currentY = pieceRect.top - targetRect.top;

  const targetPos = targets[piece.id];
  const threshold = 20; // 吸い付け判定の許容誤差(px)

  if (
    Math.abs(currentX - targetPos.x) < threshold &&
    Math.abs(currentY - targetPos.y) < threshold
  ) {
    // 正解位置へスナップ
    targetArea.appendChild(piece);
    piece.style.left = `${targetPos.x}px`;
    piece.style.top = `${targetPos.y}px`;
    targetPos.placed = true;
  } else {
    targetPos.placed = false;
  }

  checkWin();
}

function checkWin() {
  const allPlaced = Object.values(targets).every(t => t.placed);
  if (allPlaced) {
    setTimeout(() => alert('🎉 GAME CLEAR！ 🎉'), 100);
  }
}