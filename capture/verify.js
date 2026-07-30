// Boot the localized copy with ALL external network blocked, drive it through
// the same scroll positions as the original capture, and diff the frames.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const OUT = path.join(__dirname, 'out');
const PORT = 8099;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.avif': 'image/avif', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(OUT, rel);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  const buf = fs.readFileSync(file);
  // Videos need range support or the <video> elements stall.
  const range = req.headers.range;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (range && /^bytes=/.test(range)) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = parseInt(s, 10) || 0;
    const end = e ? parseInt(e, 10) : buf.length - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
    return res.end(buf.slice(start, end + 1));
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
  res.end(buf);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  console.log(`serving out/ on :${PORT}\n`);

  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const blocked = new Set(), errors = [], failed = [];
  // Hard proof of offline operation: nothing but localhost may load.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes(`localhost:${PORT}`) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.add(new URL(u).hostname);
    return route.abort();
  });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('requestfailed', (r) => {
    // Browsers abort video range requests once enough is buffered; that is normal
    // and must not be reported as a missing asset.
    const err = r.failure()?.errorText || '';
    if (err.includes('ERR_ABORTED')) return;
    if (r.url().includes(`localhost:${PORT}`)) failed.push(`${err} ${r.url().replace(`http://localhost:${PORT}/`, '')}`);
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);   // let the preloader finish

  const libs = await page.evaluate(() => ['gsap', 'ScrollTrigger', 'Lenis', 'Swiper', 'SplitText']
    .filter((g) => typeof window[g] !== 'undefined' || (window.gsap && gsap.plugins?.[g])));
  const anims = await page.evaluate(() => document.getAnimations().length);
  console.log('libs live in replica :', libs.join(', '));
  console.log('animations running   :', anims);

  fs.mkdirSync(path.join(OUT, 'frames-local'), { recursive: true });
  const results = [];
  for (let i = 0; i < 16; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), i * 900);
    await page.waitForTimeout(1200);
    const shot = path.join(OUT, 'frames-local', `scroll-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: shot });

    const origPath = path.join(OUT, 'frames', `scroll-${String(i).padStart(2, '0')}.png`);
    if (!fs.existsSync(origPath)) continue;
    const a = PNG.sync.read(fs.readFileSync(origPath));
    const b = PNG.sync.read(fs.readFileSync(shot));
    if (a.width !== b.width || a.height !== b.height) { results.push({ i, note: 'size mismatch' }); continue; }
    const diff = new PNG({ width: a.width, height: a.height });
    const px = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
    fs.mkdirSync(path.join(OUT, 'frames-diff'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'frames-diff', `diff-${String(i).padStart(2, '0')}.png`), PNG.sync.write(diff));
    const pct = (px / (a.width * a.height)) * 100;
    results.push({ i, pct });
    console.log(`  frame ${String(i).padStart(2, '0')}  ${pct.toFixed(2)}% differing pixels`);
  }

  const scored = results.filter((r) => r.pct !== undefined);
  const avg = scored.reduce((s, r) => s + r.pct, 0) / (scored.length || 1);
  console.log(`\nmean pixel difference: ${avg.toFixed(2)}%`);
  console.log(`external hosts blocked: ${[...blocked].join(', ') || '(none attempted)'}`);
  console.log(`local 404s: ${failed.length}`, failed.slice(0, 10));
  console.log(`console errors: ${errors.length}`, errors.slice(0, 6));

  await browser.close();
  server.close();
})();
