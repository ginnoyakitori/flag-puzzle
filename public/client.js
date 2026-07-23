// 各国旗のデータ定義（SVG読み込み対応）
const STAGES = {
  // 1. 基本型（2:3）例：日本
  japan: {
    name: "日本",
    width: 300,
    height: 200,
    svgPath: "flags/japan.svg",
    pieces: [
      {
        id: "jp-bg",
        width: 300,
        height: 200,
        targetX: 0,
        targetY: 0,
        initX: 10,
        initY: 10,
        // 土台（白い長方形パーツ）
        clipStyle: "inset(0 0 0 0)"
      },
      {
        id: "jp-circle",
        width: 120,
        height: 120,
        targetX: 90,
        targetY: 40,
        initX: 180,
        initY: 30,
        // 日の丸部分を円形に切り抜き
        clipStyle: "circle(50% at 50% 50%)",
        // 背景画像の表示位置オフセット
        bgPosition: "-90px -40px"
      }
    ]
  },

  // 2. 正方形（1:1）例：スイス
  switzerland: {
    name: "スイス",
    width: 200,
    height: 200,
    svgPath: "flags/switzerland.svg",
    pieces: [
      {
        id: "ch-bg",
        width: 200,
        height: 200,
        targetX: 0,
        targetY: 0,
        initX: 10,
        initY: 10,
        // 赤地土台
        clipStyle: "inset(0 0 0 0)"
      },
      {
        id: "ch-cross",
        width: 120,
        height: 120,
        targetX: 40,
        targetY: 40,
        initX: 180,
        initY: 30,
        // 十字部分の切り抜き（ポリゴン）
        clipStyle: "polygon(33.3% 0%, 66.6% 0%, 66.6% 33.3%, 100% 33.3%, 100% 66.6%, 66.6% 66.6%, 66.6% 100%, 33.3% 100%, 33.3% 66.6%, 0% 66.6%, 0% 33.3%, 33.3% 33.3%)",
        bgPosition: "-40px -40px"
      }
    ]
  },

  // 3. 特殊形状 例：ネパール
  nepal: {
    name: "ネパール",
    width: 200,
    height: 240,
    svgPath: "flags/nepal.svg",
    specialShape: "nepal-shape",
    pieces: [
      {
        id: "np-full",
        width: 200,
        height: 240,
        targetX: 0,
        targetY: 0,
        initX: 10,
        initY: 10,
        className: "nepal-shape",
        clipStyle: "inset(0 0 0 0)"
      }
    ]
  }
};

let currentStageData = null;
let targets = {};

// ステージ読み込み関数
function loadStage(stageKey) {
  const stage = STAGES[stageKey];
  if (!stage) return;

  currentStageData = stage;
  targets = {};

  document.getElementById("stage-title").textContent = `国旗パズル：${stage.name}`;

  const targetArea = document.getElementById("target-area");
  const pieceContainer = document.getElementById("piece-container");

  targetArea.innerHTML = "";
  pieceContainer.innerHTML = "";

  // ターゲットエリアのサイズ調整
  targetArea.style.width = `${stage.width}px`;
  targetArea.style.height = `${stage.height}px`;

  if (stage.specialShape) {
    targetArea.classList.add(stage.specialShape);
  } else {
    targetArea.className = "";
  }

  // ピースの生成
  stage.pieces.forEach(p => {
    targets[p.id] = { x: p.targetX, y: p.targetY, placed: false };

    const el = document.createElement("div");
    el.id = p.id;
    el.className = `piece ${p.className || ""}`;
    el.style.width = `${p.width}px`;
    el.style.height = `${p.height}px`;

    // SVG画像の背景読み込み設定
    el.style.backgroundImage = `url('${stage.svgPath}')`;
    el.style.backgroundSize = `${stage.width}px ${stage.height}px`;
    el.style.backgroundRepeat = "no-repeat";

    // 切り抜き・位置調整の適用
    if (p.clipStyle) el.style.clipPath = p.clipStyle;
    if (p.bgPosition) el.style.backgroundPosition = p.bgPosition;

    el.style.left = `${p.initX}px`;
    el.style.top = `${p.initY}px`;

    pieceContainer.appendChild(el);
    setupDragEvents(el);
  });
}

// ドラッグ＆ドロップ（Pointer Events）のセットアップ
function setupDragEvents(piece) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  piece.addEventListener("pointerdown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = piece.offsetLeft;
    initialTop = piece.offsetTop;

    piece.setPointerCapture(e.pointerId);
    piece.style.cursor = "grabbing";
    piece.style.zIndex = 1000;
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    piece.style.left = `${initialLeft + dx}px`;
    piece.style.top = `${initialTop + dy}px`;
  });

  window.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    piece.releasePointerCapture(e.pointerId);
    piece.style.cursor = "grab";
    piece.style.zIndex = 1;

    checkPlacement(piece);
  });
}

// 位置判定・吸い付け関数
function checkPlacement(piece) {
  const targetArea = document.getElementById("target-area");
  const targetRect = targetArea.getBoundingClientRect();
  const pieceRect = piece.getBoundingClientRect();

  const currentX = pieceRect.left - targetRect.left;
  const currentY = pieceRect.top - targetRect.top;

  const targetPos = targets[piece.id];
  const threshold = 20;

  if (
    Math.abs(currentX - targetPos.x) < threshold &&
    Math.abs(currentY - targetPos.y) < threshold
  ) {
    targetArea.appendChild(piece);
    piece.style.left = `${targetPos.x}px`;
    piece.style.top = `${targetPos.y}px`;
    targetPos.placed = true;
  } else {
    targetPos.placed = false;
  }

  checkWin();
}

// クリア判定
function checkWin() {
  const allPlaced = Object.values(targets).every(t => t.placed);
  if (allPlaced && Object.keys(targets).length > 0) {
    setTimeout(() => alert(`🎉 ${currentStageData.name} の国旗が完成しました！ 🎉`), 100);
  }
}

// 初期表示
loadStage("japan");