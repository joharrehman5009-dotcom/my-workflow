// Build the MOBILE hero portrait.
//
// Mobile uses a completely separate <img class="mobile-hero-image"> from the
// desktop .hero-profile-img, on a much taller canvas (750x1520 vs 1670x1916).
// Missing it is why phones still showed the original person.
//
// Same geometry rule as the desktop build: match the original's head width and
// head position, so the figure sits where the layout expects it.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const WF = path.join(OUT, 'assets', 'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108');
const SRC = path.join(OUT, '_work', 'johar-cutout.png');
const NAME = '69708b99545c57d03ebb5cd9_Frame 2147258154.avif';

// Measure the pristine copy, not the live file, or each run would compound its
// own output and the scale would drift.
const ORIGINAL = path.join(OUT, '_backup', 'base', 'out', 'assets',
  'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108', NAME);

async function measure(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  let minY = H, maxY = 0;
  const span = [];
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) if (A(x, y) > 128) { if (lo < 0) lo = x; hi = x; }
    span.push(lo < 0 ? null : [lo, hi]);
    if (lo >= 0) { if (y < minY) minY = y; maxY = y; }
  }
  const probe = span[Math.min(H - 1, minY + Math.round((maxY - minY) * 0.10))];
  return { W, H, minY, maxY, headCx: probe ? (probe[0] + probe[1]) / 2 : W / 2, headW: probe ? probe[1] - probe[0] : 1 };
}

(async () => {
  const ref = fs.existsSync(ORIGINAL) ? ORIGINAL : path.join(WF, NAME);
  const dst = await measure(ref);
  const src = await measure(SRC);
  console.log(`target  ${dst.W}x${dst.H}  head w=${dst.headW} top=${dst.minY} cx=${Math.round(dst.headCx)}`);
  console.log(`source  ${src.W}x${src.H}  head w=${src.headW} top=${src.minY} cx=${Math.round(src.headCx)}`);

  const scale = dst.headW / src.headW;
  const newW = Math.round(src.W * scale);
  const newH = Math.round(src.H * scale);
  const cropTop = Math.max(0, Math.round(src.minY * scale) - dst.minY);
  const left = Math.round(dst.headCx - src.headCx * scale);
  console.log(`scale ${scale.toFixed(3)} -> ${newW}x${newH}, crop top ${cropTop}, left ${left}`);

  let scaled = await sharp(SRC).resize(newW, newH, { kernel: 'lanczos3' }).png().toBuffer();
  const needH = cropTop + dst.H;
  if (newH < needH) {
    scaled = await sharp(scaled)
      .extend({ bottom: needH - newH, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }

  // Take the overlap rectangle: the scaled figure can be wider than the canvas
  // and can need a negative left offset.
  const cx0 = Math.max(0, left);
  const cx1 = Math.min(dst.W, left + newW);
  const w = cx1 - cx0;
  if (w <= 0) { console.error('figure lands outside the canvas'); process.exit(1); }

  const body = await sharp(scaled)
    .extract({ left: cx0 - left, top: cropTop, width: w, height: dst.H })
    .modulate({ saturation: 1.04, brightness: 1.03 })
    .linear(1.05, -5)
    .png().toBuffer();

  let canvas = await sharp({ create: { width: dst.W, height: dst.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: cx0, top: 0 }])
    .png().toBuffer();

  // The original fades out at the bottom rather than ending on a hard edge.
  const placed = await measure(canvas);
  const gap = dst.H - placed.maxY;
  const { data, info } = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const fadeH = Math.round(dst.H * 0.18);
  const fadeStart = (gap > 40 ? placed.maxY : dst.H) - fadeH;
  for (let y = fadeStart; y < (gap > 40 ? placed.maxY : dst.H); y++) {
    if (y < 0) continue;
    const k = 1 - (y - fadeStart) / fadeH;
    const f = k * k;
    for (let x = 0; x < info.width; x++) {
      const o = (y * info.width + x) * 4 + 3;
      data[o] = Math.round(data[o] * f);
    }
  }
  canvas = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  console.log(`tapered ${fadeH}px from y=${fadeStart}`);

  const buf = await sharp(canvas).avif({ quality: 62 }).toBuffer();
  fs.writeFileSync(path.join(WF, NAME), buf);
  fs.writeFileSync(path.join(WF, 'johar-mobile-hero.avif'), buf);
  console.log(`\nwrote ${(buf.length / 1024).toFixed(1)} KB  ->  ${NAME}  and johar-mobile-hero.avif`);

  const chk = await measure(path.join(WF, NAME));
  console.log(`result head top y=${chk.minY} (target ${dst.minY}), cx=${Math.round(chk.headCx)} (target ${Math.round(dst.headCx)}), head w=${chk.headW} (target ${dst.headW})`);
})();
