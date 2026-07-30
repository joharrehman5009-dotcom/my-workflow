// Build a hero portrait that drops into the existing layout unchanged.
//
// Source quality note: the cut-out PNG is 439x568 but the JPG of the same shot is
// 659x852. So we take colour from the JPG and the alpha mask from the PNG — a
// higher-resolution base than either file gives on its own.
//
// Geometry: match the original's subject height (so the figure reaches the bottom
// edge exactly as before) and align the head top and head centre to the original's.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const WF = path.join(OUT, 'assets', 'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108');
const ORIGINAL = path.join(WF, '6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif');
const SRC_PNG = 'E:/CV & pics/Johar DP.png';
const SRC_JPG = 'E:/CV & pics/Johar DP.jpg';

async function measure(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  let minX = W, maxX = 0, minY = H, maxY = 0;
  const span = [];
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) if (A(x, y) > 128) { if (lo < 0) lo = x; hi = x; }
    span.push(lo < 0 ? null : [lo, hi]);
    if (lo >= 0) { if (y < minY) minY = y; maxY = y; if (lo < minX) minX = lo; if (hi > maxX) maxX = hi; }
  }
  const probe = span[Math.min(H - 1, minY + Math.round((maxY - minY) * 0.10))];
  return { W, H, minY, maxY, headCx: probe ? (probe[0] + probe[1]) / 2 : W / 2, headW: probe ? probe[1] - probe[0] : 0 };
}

(async () => {
  const dst = await measure(ORIGINAL);
  console.log(`target canvas ${dst.W}x${dst.H}, head top y=${dst.minY}, head centre x=${Math.round(dst.headCx)}`);

  // High-res cut-out: JPG pixels + PNG alpha, both at the JPG's resolution.
  const jpgMeta = await sharp(SRC_JPG).metadata();
  const mask = await sharp(SRC_PNG).ensureAlpha().extractChannel('alpha')
    .resize(jpgMeta.width, jpgMeta.height, { kernel: 'lanczos3' }).toBuffer();
  const cut = await sharp(SRC_JPG).ensureAlpha()
    .joinChannel(mask)
    .png().toBuffer();

  const src = await measure(cut);
  console.log(`source ${src.W}x${src.H}, subject height ${src.maxY - src.minY}`);

  // Scale so the subject occupies the same vertical extent as the original.
  const scale = (dst.maxY - dst.minY) / (src.maxY - src.minY);
  const newW = Math.round(src.W * scale);
  const newH = Math.round(src.H * scale);
  // Crop from the top so the head lands where the original's head starts.
  const cropTop = Math.max(0, Math.round(src.minY * scale) - dst.minY);
  const left = Math.round(dst.headCx - src.headCx * scale);
  console.log(`scale ${scale.toFixed(3)} -> ${newW}x${newH}, crop top ${cropTop}, left offset ${left}`);

  let scaled = sharp(cut).resize(newW, newH, { kernel: 'lanczos3' });
  // Ensure there are enough rows to crop the full canvas height out of.
  if (newH - cropTop < dst.H) {
    scaled = sharp(await scaled.toBuffer()).extend({ bottom: dst.H - (newH - cropTop), background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const body = await sharp(await scaled.toBuffer())
    .extract({ left: 0, top: cropTop, width: newW, height: dst.H })
    // Subtle warm grade so the portrait sits with the site's beige/yellow palette
    // instead of reading as a cool studio headshot pasted on.
    .modulate({ saturation: 0.94, brightness: 1.02 })
    .tint({ r: 255, g: 250, b: 240 })
    .linear(1.06, -8)
    .toBuffer();

  const canvas = sharp({ create: { width: dst.W, height: dst.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left, top: 0 }]);

  const full = path.join(WF, 'johar-hero.avif');
  const small = path.join(WF, 'johar-hero-p-500.avif');
  await sharp(await canvas.png().toBuffer()).avif({ quality: 62 }).toFile(full);
  await sharp(await canvas.png().toBuffer())
    .resize(500, Math.round(500 * dst.H / dst.W), { kernel: 'lanczos3' })
    .avif({ quality: 62 }).toFile(small);

  const chk = await measure(full);
  console.log(`\nwrote johar-hero.avif        ${(fs.statSync(full).size / 1024).toFixed(1)} KB`);
  console.log(`wrote johar-hero-p-500.avif  ${(fs.statSync(small).size / 1024).toFixed(1)} KB`);
  console.log(`result head top y=${chk.minY} (target ${dst.minY}), head centre x=${Math.round(chk.headCx)} (target ${Math.round(dst.headCx)})`);
})();
