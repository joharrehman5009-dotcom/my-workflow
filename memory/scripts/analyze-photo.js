// Measure how a cut-out subject sits inside its canvas, so a replacement can be
// scaled and positioned to occupy the same visual space in the hero layout.
const sharp = require('sharp');

async function measure(file, label) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const A = (x, y) => data[(y * W + x) * 4 + 3];

  let minX = W, maxX = 0, minY = H, maxY = 0;
  const rowSpan = [];
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) {
      if (A(x, y) > 128) { if (lo < 0) lo = x; hi = x; }
    }
    rowSpan.push(lo < 0 ? null : [lo, hi]);
    if (lo >= 0) {
      if (y < minY) minY = y;
      maxY = y;
      if (lo < minX) minX = lo;
      if (hi > maxX) maxX = hi;
    }
  }

  // Head width = span a little below the crown, before shoulders flare out.
  const headProbe = Math.min(H - 1, minY + Math.round((maxY - minY) * 0.10));
  const head = rowSpan[headProbe];
  // Shoulder width, sampled near the bottom of the subject.
  const shProbe = Math.min(H - 1, minY + Math.round((maxY - minY) * 0.92));
  const sh = rowSpan[shProbe];

  console.log(`\n=== ${label} ===`);
  console.log(`canvas        ${W} x ${H}`);
  console.log(`subject bbox  x ${minX}-${maxX}  y ${minY}-${maxY}   (${maxX - minX} x ${maxY - minY})`);
  console.log(`head top      y=${minY}  (${(100 * minY / H).toFixed(1)}% down the canvas)`);
  if (head) console.log(`head width    ${head[1] - head[0]}px  (${(100 * (head[1] - head[0]) / W).toFixed(1)}% of canvas)  centre x=${Math.round((head[0] + head[1]) / 2)}`);
  if (sh) console.log(`shoulders     ${sh[1] - sh[0]}px  (${(100 * (sh[1] - sh[0]) / W).toFixed(1)}% of canvas)`);
  console.log(`subject fills  ${(100 * (maxY - minY) / H).toFixed(1)}% of height, ${(100 * (maxX - minX) / W).toFixed(1)}% of width`);
  return { W, H, minX, maxX, minY, maxY, headW: head ? head[1] - head[0] : null };
}

(async () => {
  await measure('out/assets/cdn.prod.website-files.com/691d7c9f14d0280ebe2d4108/6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif', 'ORIGINAL hero');
  await measure('E:/CV & pics/Johar DP.png', 'JOHAR source');
})();
