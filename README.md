# 光の板で国旗をつくろう

加法混色(R/G/B の光)・減法混色(C/M/Y のフィルター)の「板」をドラッグして国旗を完成させるパズル。
お手本は出ず、国名だけが出題されます。板は単色で、長方形・円・多角形(三角形や星)があります。ドラッグで移動、ボタンで回転(15°/90°)・拡大縮小(10%刻み)して重ね、混色で旗を作ります。穴(透明部分)があるのは、穴がないと旗にならない板だけです。

## 起動
    npm install
    npm start        # http://localhost:3000 (PORT 環境変数で変更可)

## 構成
- server.js … Express(静的配信・ランキングAPI。提出された配置をサーバー側でも再判定)
- public/game-core.js … 旗データ・板の自動生成・一致判定(サーバーとブラウザで共有)
- public/client.js … 描画(Canvasの lighter / multiply 合成)・ドラッグ操作・UI
- public/index.html, style.css
- data/ranking.json … 実行時に自動作成(Renderの無料枠では再起動で消えます)

## 旗の追加
public/game-core.js の FLAGS に regions(色キーと図形)を足すと、板が自動生成されます。
穴が必要なインクの板(例:加法の日本のG・B板)には、自動で穴が付きます。多角形は poly()/star() で定義できます。
色キーは W K R G B Y、図形は r(x,y,w,h)・c(cx,cy,半径)、座標は 30×18 の枠内の整数マス。
