// ステージデータの定義
const STAGES = {
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
        clipStyle: "inset(0 0 0 0)"
      },
      {
        id: "jp-circle",
        width: 120,
        height: 120,
        targetX: 90,
        targetY: 40,
        clipStyle: "circle(50% at 50% 50%)",
        bgPosition: "-90px -40px"
      }
    ]
  },

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
        clipStyle: "inset(0 0 0 0)"
      },
      {
        id: "ch-cross",
        width: 120,
        height: 120,
        targetX: 40,
        targetY: 40,
        clipStyle: "polygon(33.3% 0%, 66.6% 0%, 66.6% 33.3%, 100% 33.3%, 100% 66.6%, 66.6% 66.6%, 66.6% 100%, 33.3% 100%, 33.3% 66.6%, 0% 66.6%, 0% 33.3%, 33.3% 33.3%)",
        bgPosition: "-40px -40px"
      }
    ]
  },

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
        className: "nepal-shape",
        clipStyle: "inset(0 0 0 0)"
      }
    ]
  }
};

let currentStageData = null;
let targets = {};

function loadStage(stageKey) {
  const stage = STAGES[stageKey];
  if (!stage) return;

  currentStageData = stage;
  targets = {};

  document.getElementById("stage-title").textContent = `国旗パズル：${stage.name}`;

  const gameCanvas = document.getElementById("game-canvas");
  const targetArea = document.getElementById("target-area");
  const pieceTray = document.getElementById("piece-tray");

  // キャンバス・トレイ・ターゲットエリアのクリア
  targetArea.innerHTML = "";
  pieceTray.innerHTML = "";
  
  // 既存のキャンバス上のピースを削除
  const existingPieces = gameCanvas.querySelectorAll(".piece");
  existingPieces.forEach(el => el.remove());

  // 黒枠（target-area）のサイズと中央配置設定
  targetArea.style.width = `${stage.width}px`;
  targetArea.style.height = `${stage.height}px`;
  targetArea.style.left = `${(gameCanvas.clientWidth - stage.width) / 2}px`;
  targetArea.style.top = `${(gameCanvas.clientHeight - stage.height) / 2}px`;

  if (stage.specialShape) {
    targetArea.classList.add(stage.specialShape);
  } else {
    targetArea.className = "";
  }

  // トレイに各ピースを配置
  stage.pieces.forEach(p => {
    targets[p.id] = { x: p.targetX, y: p.targetY, placed: false };

    // スクロール用トレイのラッパー要素
    const trayItem = document.createElement("div");
    trayItem.className = "tray-item";
    trayItem.style.width = `${Math.min(p.width, 140)}px`;
    trayItem.style.height = `${Math.min(p.height, 100)}px`;

    // ピース本体要素
    const el = document.createElement("div");
    el.id = p.id;
    el.className = `piece ${p.className || ""}`;
    el.style.width = `${p.width}px`;
    el.style.height = `${p.height}px`;

    // 背景SVGの設定
    el.style.backgroundImage = `url('${stage.svgPath}')`;
    el.style.backgroundSize = `${stage.width}px ${stage.height}px`;
    el.style.backgroundRepeat = "no-repeat";

    if (p.clipStyle) el.style.clipPath = p.clipStyle;
    if (p.bgPosition) el.style.backgroundPosition = p.bgPosition;

    // トレイ内で縮小プレビュー表示（収まるようにスケール調整）
    const scale = Math.min(130 / p.width, 90 / p.height, 1);
    el.style.transform = `scale(${scale})`;
    el.dataset.inTray = "true";

    trayItem.appendChild(el);
    pieceTray.appendChild(trayItem);

    setupDragEvents(el, gameCanvas);
  });
}

function setupDragEvents(piece, canvas) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  piece.addEventListener("pointerdown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // トレイからキャンバスへ移動する処理
    if (piece.dataset.inTray === "true") {
      const rect = piece.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // トレイからキャンバス要素配下へ付け替え
      canvas.appendChild(piece);
      piece.dataset.inTray = "false";
      piece.style.transform = "none"; // 元のサイズに戻す

      // キャンバス基準の座標を計算
      initialLeft = rect.left - canvasRect.left;
      initialTop = rect.top - canvasRect.top;
      piece.style.left = `${initialLeft}px`;
      piece.style.top = `${initialTop}px`;
    } else {
      initialLeft = piece.offsetLeft;
      initialTop = piece.offsetTop;
    }

    piece.setPointerCapture(e.pointerId);
    piece.style.cursor = "grabbing";
    piece.style.zIndex = 1000;
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // キャンバス内での自由な移動（はみ出し移動可能）
    piece.style.left = `${initialLeft + dx}px`;
    piece.style.top = `${initialTop + dy}px`;
  });

  window.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    piece.releasePointerCapture(e.pointerId);
    piece.style.cursor = "grab";
    piece.style.zIndex = 1;

    // 判定処理（黒枠内かどうか）
    checkPlacement(piece);
  });
}

// 判定およびスナップ関数
function checkPlacement(piece) {
  const targetArea = document.getElementById("target-area");
  
  // 黒枠（targetArea）および ピース（piece）の絶対画面座標を取得
  const targetRect = targetArea.getBoundingClientRect();
  const pieceRect = piece.getBoundingClientRect();

  // 黒枠（target-area）から見た相対座標
  const currentX = pieceRect.left - targetRect.left;
  const currentY = pieceRect.top - targetRect.top;

  const targetPos = targets[piece.id];
  const threshold = 25; // 吸い付け判定の許容誤差(px)

  // 黒枠の中の正解座標に近いか判定
  if (
    Math.abs(currentX - targetPos.x) < threshold &&
    Math.abs(currentY - targetPos.y) < threshold
  ) {
    // 吸い付け（黒枠要素の中に吸着移動）
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

// 初期化
loadStage("japan");