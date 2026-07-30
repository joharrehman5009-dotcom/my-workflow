const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = process.argv[2] || 'https://heynesh.com/';
const OUT = path.join(__dirname, 'out');

// Mirror a URL onto disk, preserving its path structure.
function diskPath(urlStr) {
  const u = new URL(urlStr);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  // Query strings matter for some asset CDNs; fold them into the filename.
  if (u.search) {
    const ext = path.extname(p);
    p = p.slice(0, p.length - ext.length) + '_' + Buffer.from(u.search).toString('hex').slice(0, 8) + ext;
  }
  return path.join(OUT, 'assets', u.hostname, p);
}

function save(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // Use the system Chrome rather than Playwright's bundled build.
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const manifest = [];

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.startsWith('http')) return;
    try {
      const body = await res.body();
      const ct = res.headers()['content-type'] || '';
      save(diskPath(url), body);
      manifest.push({ url, status: res.status(), type: ct.split(';')[0], bytes: body.length });
    } catch (e) {
      manifest.push({ url, status: res.status(), error: String(e.message).slice(0, 80) });
    }
  });

  console.log('navigating:', TARGET);
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);

  // Scroll the full page to trigger lazy-loading and scroll-driven animations,
  // screenshotting each step so we have reference frames for the diff loop later.
  const height = await page.evaluate(() => document.body.scrollHeight);
  const vh = 900;
  const steps = Math.min(Math.ceil(height / vh), 30);
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), i * vh);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'frames', `scroll-${String(i).padStart(2, '0')}.png`) });
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(2000);

  // Final rendered DOM, after JS has built everything.
  const html = await page.content();
  save(path.join(OUT, 'rendered.html'), html);

  // Pull every CSS rule out of the CSSOM. This catches injected / CSS-in-JS
  // styles that never exist as a .css file on the network.
  const cssom = await page.evaluate(() => {
    const out = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { out.push({ href: sheet.href, cors: true }); continue; }
      const text = Array.from(rules).map((r) => r.cssText).join('\n');
      out.push({ href: sheet.href, ownerTag: sheet.ownerNode?.tagName, text });
    }
    return out;
  });
  save(path.join(OUT, 'cssom.json'), JSON.stringify(cssom, null, 2));
  save(path.join(OUT, 'all-styles.css'), cssom.map((s) => `/* ===== ${s.href || 'inline <' + s.ownerTag + '>'} ===== */\n${s.text || ''}`).join('\n\n'));

  // Fingerprint the animation stack.
  const fingerprint = await page.evaluate(() => {
    const globals = ['gsap', 'ScrollTrigger', 'TweenMax', 'Lenis', 'lenis', 'LocomotiveScroll',
      'THREE', 'lottie', 'bodymovin', 'rive', 'Swiper', 'barba', 'anime', 'Motion',
      'SplitType', 'Splitting', 'Alpine', 'React', 'Vue', '__NEXT_DATA__', '__NUXT__'];
    const present = globals.filter((g) => typeof window[g] !== 'undefined');
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
    const links = Array.from(document.querySelectorAll('link')).map((l) => ({ rel: l.rel, href: l.href }));
    const fonts = Array.from(document.fonts).map((f) => `${f.family} ${f.weight} ${f.style}`);
    const anims = document.getAnimations().map((a) => ({
      name: a.animationName || a.constructor.name,
      target: a.effect?.target?.tagName + '.' + (a.effect?.target?.className || '').toString().slice(0, 60),
      duration: a.effect?.getTiming?.().duration,
      easing: a.effect?.getTiming?.().easing,
      iterations: a.effect?.getTiming?.().iterations,
    }));
    return { present, scripts, links, fonts: [...new Set(fonts)], runningAnimations: anims, generator: document.querySelector('meta[name=generator]')?.content };
  });
  save(path.join(OUT, 'fingerprint.json'), JSON.stringify(fingerprint, null, 2));

  save(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // No fullPage screenshot here: ScrollSmoother drives a transform-based virtual
  // scroll, so expanding the viewport to full height makes ScrollTrigger
  // recalculate forever and the shot never stabilises. The per-scroll-position
  // frames above are the correct reference set for a scroll-driven page.

  await browser.close();
  console.log(`\ncaptured ${manifest.length} network resources`);
  console.log('libs detected:', fingerprint.present.join(', ') || '(none on window)');
  console.log('stylesheets:', cssom.length, '| fonts:', fingerprint.fonts.length);
  console.log('running animations at rest:', fingerprint.runningAnimations.length);
})();
