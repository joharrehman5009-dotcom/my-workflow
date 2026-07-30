// Rewrite every absolute asset URL in the captured HTML/CSS to point at the
// local mirror, so the site boots with no network access at all.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const HOSTS = ['cdn.prod.website-files.com', 'f1-assets.b-cdn.net', 'd3e54v103j8qbb.cloudfront.net',
  'cdn.jsdelivr.net', 'unpkg.com', 'heynesh.com'];

// Must match capture.js exactly, or rewritten paths won't resolve.
function diskRel(urlStr) {
  const u = new URL(urlStr);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (u.search) {
    const ext = path.extname(p);
    p = p.slice(0, p.length - ext.length) + '_' + Buffer.from(u.search).toString('hex').slice(0, 8) + ext;
  }
  return path.posix.join('assets', u.hostname, ...p.split(/[\\/]/).filter(Boolean));
}

const stats = { rewritten: 0, missing: [], skipped: 0 };

function map(raw, prefix) {
  const clean = raw.replace(/&amp;/g, '&').trim();
  let u;
  try { u = new URL(clean); } catch { return null; }
  if (!HOSTS.includes(u.hostname)) { stats.skipped++; return null; }
  if (!u.pathname || u.pathname === '/') return null;   // bare preconnect origin
  // Directory URLs are base paths the engine concatenates filenames onto — map
  // them to the local directory, not to a (nonexistent) index.html inside it.
  if (u.pathname.endsWith('/')) {
    const dir = path.posix.join('assets', u.hostname,
      ...decodeURIComponent(u.pathname).split('/').filter(Boolean));
    if (!fs.existsSync(path.join(OUT, dir))) { stats.missing.push(clean); return null; }
    stats.rewritten++;
    return prefix + dir + '/';
  }
  const rel = diskRel(clean);
  if (!fs.existsSync(path.join(OUT, rel))) { stats.missing.push(clean); return null; }
  stats.rewritten++;
  return prefix + rel;
}

// Filenames here contain parentheses ("Client - 1910 (Background).avif"), so the
// HTML pattern must allow them; only quotes/whitespace/angle brackets terminate.
function rewriteHtml(text) {
  return text.replace(/https?:\/\/[^"'\s<>\\]+/g, (raw) => map(raw, '') ?? raw);
}

// CSS needs url() handled separately: quoted forms may contain parens, bare
// forms may not (the paren would close the url() early).
function rewriteCss(text, depth) {
  const prefix = '../'.repeat(depth);
  return text
    .replace(/url\((\s*)(["'])(.*?)\2(\s*)\)/g, (m, a, q, inner, b) => `url(${a}${q}${map(inner, prefix) ?? inner}${q}${b})`)
    .replace(/url\((\s*)([^"'()\s]+)(\s*)\)/g, (m, a, inner, b) => `url(${a}${map(inner, prefix) ?? inner}${b})`)
    .replace(/@import\s+(["'])(.*?)\1/g, (m, q, inner) => `@import ${q}${map(inner, prefix) ?? inner}${q}`);
}

// 1. The pristine server HTML (NOT rendered.html — that one has GSAP's
//    mutations already baked in and would double-apply on re-run).
const srcHtml = path.join(OUT, 'assets', 'heynesh.com', 'index.html');
let html = rewriteHtml(fs.readFileSync(srcHtml, 'utf8'));
// Rewriting url() inside the stylesheets invalidates their SRI digests, so the
// browser would refuse to apply them. Drop integrity/crossorigin entirely.
html = html.replace(/\s+integrity="[^"]*"/g, '').replace(/\s+crossorigin="[^"]*"/g, '');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`html: ${stats.rewritten} urls rewritten`);

// 2. Stylesheets reference fonts/images by url() and need the same treatment,
//    with a deeper relative prefix since they live inside assets/<host>/...
let cssCount = 0, jsCount = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    const depth = path.relative(OUT, full).split(path.sep).length - 1;
    if (e.name.endsWith('.css')) {
      fs.writeFileSync(full, rewriteCss(fs.readFileSync(full, 'utf8'), depth));
      cssCount++;
    } else if (e.name.endsWith('.js')) {
      // The custom engine hardcodes absolute CDN urls for the work-card imagery,
      // so JS needs the same rewrite or those assets stay remote-only.
      // Prefix is '' — these strings become img/video src at runtime and resolve
      // against the document base (out/index.html), not this file's location.
      const prefix = '';
      const src = fs.readFileSync(full, 'utf8');
      const next = src.replace(/https?:\/\/[^"'`\s<>()\\]+/g, (raw) => map(raw, prefix) ?? raw);
      if (next !== src) { fs.writeFileSync(full, next); jsCount++; }
    }
  }
})(path.join(OUT, 'assets'));
console.log(`css: ${cssCount} stylesheets processed`);
console.log(`js:  ${jsCount} scripts rewritten`);

const missing = [...new Set(stats.missing)];
console.log(`\ntotal rewritten: ${stats.rewritten}`);
console.log(`left as remote (3rd-party): ${stats.skipped}`);
console.log(`referenced but NOT captured: ${missing.length}`);
missing.forEach((m) => console.log('   ' + m));
fs.writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify(missing, null, 2));
