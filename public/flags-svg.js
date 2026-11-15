// 国旗SVGから変換した旗データ(tools/convert.html が作ります)。空のままなら、従来の図形データで動きます。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlagSvg = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  return {};
});
