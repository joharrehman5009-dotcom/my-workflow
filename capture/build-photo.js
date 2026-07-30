// Fit the cut-out portrait into the hero layout without changing any markup.
//
// Geometry rule: match the ORIGINAL's head width and head position. Matching
// subject height instead makes the head enormous whenever the source is a
// tighter crop than the original, which is exactly what went wrong first time.
//
// Run cutout.js first — this expects a source that already has a real alpha channel.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const WF = path.join(OUT, 'assets', 'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108');
const SRC = path.join(OUT, '_work', 'johar-cutout.png');

// Geometry reference MUST come from the pristine backup: this script overwrites
// the live file, so pointing at it would measure our own previous output and the
// scale would drift further every run.
const ORIGINAL = path.join(OUT, '_backup', 'base', 'out', 'assets',
  'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108',
  '6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif');

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
  return { W, H, minY, maxY, headCx: probe ? (probe[0] + probe[1]) / 2 : W / 2, headW: probe ? probe[1] - probe[0] : 1 };
}

(async () => {
  if (!fs.existsSync(SRC)) { console.error('missing cut-out — run:  node cutout.js'); process.exit(1); }

  const dst = await measure(ORIGINAL);
  const src = await measure(SRC);
  console.log(`target  ${dst.W}x${dst.H}  head w=${dst.headW} top=${dst.minY} cx=${Math.round(dst.headCx)}`);
  console.log(`source  ${src.W}x${src.H}  head w=${src.headW} top=${src.minY} cx=${Math.round(src.headCx)}`);

  const scale = dst.headW / src.headW;
  const newW = Math.round(src.W * scale);
  const newH = Math.round(src.H * scale);
  const cropTop = Math.max(0, Math.round(src.minY * scale) - dst.minY);
  const left = Math.round(dst.headCx - src.headCx * scale);
  console.log(`scale ${scale.toFixed(3)} -> ${newW}x${newH}, crop top ${cropTop}, left ${left}`);

  let scaledBuf = await sharp(SRC).resize(newW, newH, { kernel: 'lanczos3' }).png().toBuffer();
  if (newH - cropTop < dst.H) {
    scaledBuf = await sharp(scaledBuf)
      .extend({ bottom: dst.H - (newH - cropTop), background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }
  const scaledH = Math.max(newH, cropTop + dst.H);

  // The scaled figure can be larger than the canvas and can need a negative
  // offset, so take the overlap rectangle rather than assuming it fits. Scaled
  // pixel (sx,sy) lands on the canvas at (left + sx, sy - cropTop).
  const cx0 = Math.max(0, left);
  const cx1 = Math.min(dst.W, left + newW);
  const cy1 = Math.min(dst.H, scaledH - cropTop);
  const w = cx1 - cx0, h = cy1;
  if (w <= 0 || h <= 0) { console.error('figure lands entirely outside the canvas'); process.exit(1); }
  console.log(`overlap ${w}x${h} from source (${cx0 - left},${cropTop}) onto canvas (${cx0},0)`);

  const body = await sharp(scaledBuf)
    .extract({ left: cx0 - left, top: cropTop, width: w, height: h })
    .modulate({ saturation: 1.04, brightness: 1.03 })
    .linear(1.05, -5)
    .png().toBuffer();

  let canvas = await sharp({ create: { width: dst.W, height: dst.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: cx0, top: 0 }])
    .png().toBuffer();

  // If the figure stops short of the bottom edge it would end in a hard
  // horizontal slice, so taper it out. If it already reaches the edge, leave it.
  const placed = await measure(canvas);
  const gap = dst.H - placed.maxY;
  if (gap > 40) {
    const { data, info } = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const fadeH = Math.round((placed.maxY - placed.minY) * 0.16);
    for (let y = placed.maxY - fadeH; y <= placed.maxY; y++) {
      if (y < 0) continue;
      const k = 1 - (y - (placed.maxY - fadeH)) / fadeH;
      const f = k * k;
      for (let x = 0; x < info.width; x++) {
        const o = (y * info.width + x) * 4 + 3;
        data[o] = Math.round(data[o] * f);
      }
    }
    canvas = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    console.log(`figure stops ${gap}px short — tapered over ${fadeH}px`);
  } else {
    console.log(`figure reaches the bottom edge (gap ${gap}px) — no taper needed`);
  }

  const fullBuf = await sharp(canvas).avif({ quality: 62 }).toBuffer();
  const smallBuf = await sharp(canvas)
    .resize(500, Math.round(500 * dst.H / dst.W), { kernel: 'lanczos3' })
    .avif({ quality: 62 }).toBuffer();

  // Write the clean filenames, and ALSO overwrite the originals, so the fallback
  // path can never serve the previous owner's likeness.
  for (const [name, buf] of [
    ['johar-hero.avif', fullBuf],
    ['johar-hero-p-500.avif', smallBuf],
    ['6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif', fullBuf],
    ['6926f8e053a878c5f61cc622_nenad_edit-photo_final 1-p-500.avif', smallBuf],
  ]) {
    fs.writeFileSync(path.join(WF, name), buf);
    console.log(`  wrote ${(buf.length / 1024).toFixed(1).padStart(7)} KB  ${name}`);
  }

  const chk = await measure(path.join(WF, 'johar-hero.avif'));
  console.log(`\nresult head top y=${chk.minY} (target ${dst.minY}), centre x=${Math.round(chk.headCx)} (target ${Math.round(dst.headCx)}), head w=${chk.headW} (target ${dst.headW})`);
})();
