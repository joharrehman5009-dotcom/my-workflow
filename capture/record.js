// Record a choreographed walkthrough of the page for sharing.
//
// The whole point is the animation, so the camera has to move the way a person
// would: pause on arrival, scroll slowly enough that scrubbed timelines actually
// play, and stop on each interaction long enough to read.
//
// Scrolling is done in small steps rather than scrollIntoView, because the
// scroll-driven timelines are scrubbed against scroll position. A jump lands at
// the end state and shows nothing.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const VID = path.join(OUT, 'video');
const PORT = 8076;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.avif': 'image/avif', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const srv = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(OUT, rel);
  if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const b = fs.readFileSync(f);
  const t = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const rg = q.headers.range;
  if (rg && /^bytes=/.test(rg)) {
    const [s, e] = rg.replace('bytes=', '').split('-');
    const st = +s || 0, en = e ? +e : b.length - 1;
    r.writeHead(206, { 'Content-Type': t, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${st}-${en}/${b.length}`, 'Content-Length': en - st + 1 });
    return r.end(b.slice(st, en + 1));
  }
  r.writeHead(200, { 'Content-Type': t, 'Accept-Ranges': 'bytes', 'Content-Length': b.length });
  r.end(b);
});

// 1600x900 rather than 1920x1080. Fewer pixels per frame means the compositor
// keeps up through the GSAP-heavy sections instead of dropping frames, which is
// what read as lag. Still 16:9 and still sharp on any feed.
const W = 1600, H = 900;

// Every scroll runs at the SAME pixels-per-second. Fixed per-segment durations
// were the reason some parts crawled and others shot past: a 2.2s glide over
// 400px and a 2.6s glide over 1800px are wildly different speeds on screen.
const VELOCITY = 260;   // px per second
const MIN_MS = 700, MAX_MS = 9000;

async function glide(pg, to) {
  const from = await pg.evaluate(() => window.scrollY);
  const dist = Math.abs(to - from);
  if (dist < 4) return;
  const ms = Math.max(MIN_MS, Math.min(MAX_MS, (dist / VELOCITY) * 1000));
  await pg.evaluate(([target, dur]) => new Promise((done) => {
    const start = window.scrollY, delta = target - start, t0 = performance.now();
    // Gentle ease at the ends only; the middle stays linear so the pace holds.
    const ease = (t) => (t < 0.15 ? (t / 0.15) * 0.15 * t / 0.15 / 2 + t * 0.85
      : t > 0.85 ? 1 - Math.pow(1 - t, 2) * 0.9 : t);
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, start + delta * ease(p));
      p < 1 ? requestAnimationFrame(step) : done();
    })(t0);
  }), [to, ms]);
  await pg.waitForTimeout(ms + 80);
}

// One consistent beat, so no section feels rushed or dwelt on.
const BEAT = 1300;
const hold = (pg, ms = BEAT) => pg.waitForTimeout(ms);

// Scroll to a section by id, at the shared velocity.
async function toSection(pg, id, offset = 0) {
  const y = await pg.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.getBoundingClientRect().top + window.scrollY : window.scrollY;
  }, `#${id}`);
  await glide(pg, y + offset);
}

(async () => {
  fs.rmSync(VID, { recursive: true, force: true });
  fs.mkdirSync(VID, { recursive: true });
  await new Promise((r) => srv.listen(PORT, r));

  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: VID, size: { width: W, height: H } },
  });
  const pg = await ctx.newPage();

  const log = (m) => console.log('  ' + m);

  // 1. Arrival: preloader logo stagger, then the FLIP into the nav.
  await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  log('preloader + hero entrance');
  await hold(pg, 5200);   // the preloader runs ~4.5s; anything beyond that is dead air

  // 2. Hero held still so the layout reads before anything moves.
  await hold(pg);

  // 3. The signature move: hero collapses into the sidebar as you scroll.
  log('hero -> sidebar FLIP');
  await glide(pg, 900);
  await hold(pg, 800);
  await glide(pg, 1700);
  await hold(pg);

  // 4. About timeline, with the odometer year counters.
  log('about timeline + year counters');
  await toSection(pg, 'about');
  await hold(pg, 1600);
  await toSection(pg, 'about', 700);
  await hold(pg);

  // 5. Work cards, pinned horizontal scroll, hovering one to trigger the card state.
  log('work cards + hover');
  await toSection(pg, 'projects');
  await hold(pg);
  const card = await pg.$('.work-card');
  if (card) { await card.hover().catch(() => {}); await hold(pg, 1500); }
  await toSection(pg, 'projects', 1400);
  await hold(pg);

  // 6. What you get.
  log('overview');
  await toSection(pg, 'overview');
  await hold(pg, 1600);

  // 7. Services.
  log('services');
  await toSection(pg, 'services');
  await hold(pg, 1600);

  // 8. Testimonials, dragged by hand so the custom drag indicator appears.
  log('testimonial carousel drag');
  await toSection(pg, 'testimonial');
  await hold(pg);
  const slide = await pg.$('#testimonial .swiper-slide');
  if (slide) {
    const b = await slide.boundingBox();
    if (b) {
      await pg.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2);
      await pg.mouse.down();
      for (let i = 1; i <= 24; i++) {
        await pg.mouse.move(b.x + b.width * 0.8 - i * 26, b.y + b.height / 2, { steps: 1 });
        await hold(pg, 16);
      }
      await pg.mouse.up();
      await hold(pg, 1800);
    }
  }

  // 9. FAQ accordion opened.
  log('faq accordion');
  await toSection(pg, 'faq');
  await hold(pg, 1000);
  const toggle = await pg.$('.faq-toggle');
  if (toggle) { await toggle.click().catch(() => {}); await hold(pg, 1800); }

  // 10. Footer wordmark: images trail the cursor through the letterforms.
  log('footer image trail');
  await glide(pg, await pg.evaluate(() => document.body.scrollHeight));
  await hold(pg, 1000);
  const logo = await pg.$('.footer-logo');
  if (logo) {
    const b = await logo.boundingBox();
    if (b) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        await pg.mouse.move(b.x + 40 + (b.width - 80) * t, b.y + b.height * (0.5 + 0.28 * Math.sin(t * Math.PI * 2.2)));
        await hold(pg, 42);
      }
      await hold(pg, 1600);
    }
  }
  await hold(pg, 1200);

  await ctx.close();
  await browser.close();
  srv.close();

  const files = fs.readdirSync(VID).filter((f) => f.endsWith('.webm'));
  if (!files.length) { console.log('no video produced'); return; }
  const src = path.join(VID, files[0]);
  const dst = path.join(VID, 'johar-site-walkthrough.webm');
  fs.renameSync(src, dst);
  console.log(`\nwrote ${dst}  (${(fs.statSync(dst).size / 1048576).toFixed(1)} MB)`);
})();
