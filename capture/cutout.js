// Remove the studio backdrop from a photo that has no alpha channel.
//
// The backdrop is a smooth warm gradient, not a flat colour, so a global colour
// threshold would either eat the skin tones or leave the vignette behind.
// Instead we flood-fill inward from the borders, stepping between neighbouring
// pixels only while the colour change stays small. That walks a gradient happily
// but stops dead at the subject's edge.
//
// Connectivity is what protects the face: skin is a similar hue to the backdrop,
// but it is enclosed by hair and collar, so the fill can never reach it.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || 'd:/Website dev/images/Johar Porfolio Image.png';
const DST = process.argv[3] || path.join(__dirname, 'out', '_work', 'johar-cutout.png');

const STEP_TOL = 9;    // max per-step colour distance while walking the backdrop
const MIN_LUMA = 78;   // hair and shirt sit well below this; never fill them
const GLOBAL_TOL = 150; // ...and never drift this far from the border colour overall

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const idx = (x, y) => (y * W + x) * 4;
  const luma = (o) => 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  const dist = (a, b) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);

  // Mean border colour: a local step tolerance alone lets many small steps drift
  // arbitrarily far, which is exactly how the fill crept through the hair edge
  // and ate the face. This anchors the whole walk to the backdrop's colour.
  let br = 0, bgc = 0, bb = 0, bn = 0;
  const sample = (x, y) => { const o = idx(x, y); br += data[o]; bgc += data[o + 1]; bb += data[o + 2]; bn++; };
  for (let x = 0; x < W; x++) sample(x, 0);
  for (let y = 0; y < H; y++) { sample(0, y); sample(W - 1, y); }
  const ref = [br / bn, bgc / bn, bb / bn];
  const refDist = (o) => Math.abs(data[o] - ref[0]) + Math.abs(data[o + 1] - ref[1]) + Math.abs(data[o + 2] - ref[2]);
  console.log(`border reference rgb(${ref.map((v) => Math.round(v)).join(',')})`);

  const bg = new Uint8Array(W * H);
  const queue = [];
  const push = (x, y) => {
    const p = y * W + x;
    if (bg[p]) return;
    const o = idx(x, y);
    if (luma(o) < MIN_LUMA || refDist(o) > GLOBAL_TOL) return;
    bg[p] = 1;
    queue.push(p);
  };

  // Seed from the top, left and right borders only. The subject runs off the
  // bottom edge, so seeding there would leak straight into the torso.
  for (let x = 0; x < W; x++) push(x, 0);
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  let head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    const x = p % W, y = (p / W) | 0;
    const o = idx(x, y);
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const np = ny * W + nx;
      if (bg[np]) continue;
      const no = idx(nx, ny);
      if (luma(no) < MIN_LUMA || refDist(no) > GLOBAL_TOL) continue;
      if (dist(o, no) > STEP_TOL) continue;
      bg[np] = 1;
      queue.push(np);
    }
  }

  // Alpha = inverse of the filled region.
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = bg[i] ? 0 : 255;

  // Erode a couple of pixels so the backdrop-coloured fringe on the edge goes
  // with it, then feather so the cut does not look like scissors.
  const erode = (buf) => {
    const out = Buffer.from(buf);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let min = 255;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const v = buf[ny * W + nx];
          if (v < min) min = v;
        }
        out[y * W + x] = min;
      }
    }
    return out;
  };
  let a = erode(erode(alpha));
  // sharp promotes a 1-channel raw buffer to 3-channel sRGB on output, so the
  // result must be de-interleaved back to one byte per pixel. Indexing it as if
  // it were still single-channel reads scrambled values at the wrong offsets.
  const blurred = await sharp(a, { raw: { width: W, height: H, channels: 1 } })
    .blur(1.1).raw().toBuffer({ resolveWithObject: true });
  const ch = blurred.info.channels;
  const flat = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) flat[p] = blurred.data[p * ch];
  a = flat;
  console.log(`  feather returned ${ch} channel(s), de-interleaved to 1`);

  const filled = bg.reduce((s, v) => s + v, 0);
  console.log(`${W}x${H}  background removed: ${(100 * filled / (W * H)).toFixed(1)}%`);

  fs.mkdirSync(path.dirname(DST), { recursive: true });
  // Assemble RGBA by hand. joinChannel kept producing a 4-channel image that
  // sharp wrote as colour data rather than transparency, so the mask silently
  // did nothing. Building the buffer directly leaves no room for that.
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const s = p * 4, d = p * 4;
    rgba[d] = data[s];
    rgba[d + 1] = data[s + 1];
    rgba[d + 2] = data[s + 2];
    rgba[d + 3] = a[p];
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(DST);

  // Verify the result really is transparent where it should be.
  const chk = await sharp(DST).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let op = 0, tr = 0, pa = 0;
  for (let i = 3; i < chk.data.length; i += 4) {
    const v = chk.data[i];
    if (v > 250) op++; else if (v < 5) tr++; else pa++;
  }
  const tot = W * H;
  console.log(`output alpha -> opaque ${(100 * op / tot).toFixed(1)}%  transparent ${(100 * tr / tot).toFixed(1)}%  partial ${(100 * pa / tot).toFixed(1)}%`);
  console.log('wrote', DST);
})();
