// Rebrand the localized copy from NESH/Nenad to JOHAR.
//
// Rule that keeps this safe: only capitalised "NESH" / "Nenad" are replaced.
// Lowercase "nesh"/"nenad" appear in CSS class names (.nesh-logo), GSAP
// selectors, and asset filenames (nenad_edit-photo_final 1.avif) — renaming
// those would break the animation engine and 404 the images.
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const OUT = path.join(__dirname, 'out');
const $ = cheerio.load(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'), { decodeEntities: false });

const SUBS = [
  [/Nenad Popadic/g, 'Johar'],
  [/NenadPopadicc?/g, 'Johar'],
  [/Nenad/g, 'Johar'],
  [/\s*Popadic/g, ''],
  [/NESH/g, 'JOHAR'],
  // Lowercase is normally left alone to protect class names and asset paths,
  // but the contact address is a real personal detail and must not survive.
  [/nenad@popadic\.co/gi, 'hello@johar.co'],
];
const sub = (s) => SUBS.reduce((acc, [re, to]) => acc.replace(re, to), s);

// --- 1. Text nodes (skips <style>; <script> only for the JSON-LD block) ------
let textHits = 0;
function walk(node) {
  for (const child of node.children || []) {
    if (child.type === 'text') {
      const next = sub(child.data);
      if (next !== child.data) { child.data = next; textHits++; }
    } else if (child.type === 'tag' || child.type === 'script' || child.type === 'style') {
      const tag = child.name?.toLowerCase();
      if (tag === 'style') continue;
      if (tag === 'script' && $(child).attr('type') !== 'application/ld+json') continue;
      walk(child);
    }
  }
}
walk($.root()[0]);

// --- 2. Human-readable attributes only (never src/href/srcset) ---------------
let attrHits = 0;
$('*').each((_, el) => {
  for (const a of ['alt', 'title', 'aria-label', 'content', 'data-wf-domain']) {
    const v = $(el).attr(a);
    if (!v || /^(https?:)?\/\//.test(v) || v.startsWith('assets/')) continue;
    const next = sub(v);
    if (next !== v) { $(el).attr(a, next); attrHits++; }
  }
});

// --- 3. Logo: swap the four NESH letterform paths for five JOHAR glyphs ------
// Keep class="nesh-logo-letter" and the element count animatable — Preloader
// does gsap.set(letters, {yPercent:110}) then staggers them in, and GhostEngine
// FLIPs the preload logo onto the nav logo, so both SVGs must match.
const LETTERS = [...'JOHAR'];
const VB_W = 1288, VB_H = 338;
const glyphs = LETTERS.map((ch, i) => {
  const x = (VB_W / LETTERS.length) * (i + 0.5);
  return `<text class="nesh-logo-letter" x="${x.toFixed(1)}" y="${VB_H}" text-anchor="middle" ` +
    `font-family="Ppneuemontreal, 'PP Neue Montreal', Arial, sans-serif" font-weight="700" ` +
    `font-size="420" fill="currentColor">${ch}</text>`;
}).join('');

let logoHits = 0;
$('.nesh-logo-preload-svg, .nesh-logo-svg').each((_, el) => {
  $(el).empty().append(glyphs);
  logoHits++;
});

// --- 4. Neutralise personal outbound links ----------------------------------
let linkHits = 0;
$('a[href]').each((_, el) => {
  const href = $(el).attr('href');
  if (/x\.com|linkedin\.com|cal\.com|instagram\.com|mailto:/i.test(href)) {
    $(el).attr('href', '#'); linkHits++;
  }
});

fs.writeFileSync(path.join(OUT, 'index.html'), $.html());
console.log(`text nodes changed : ${textHits}`);
console.log(`attributes changed : ${attrHits}`);
console.log(`logo svgs rebuilt  : ${logoHits}`);
console.log(`links neutralised  : ${linkHits}`);
console.log(`\nremaining "NESH"  : ${($.html().match(/NESH/g) || []).length}`);
console.log(`remaining "Nenad" : ${($.html().match(/Nenad/g) || []).length}`);
