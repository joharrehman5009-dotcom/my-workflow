// Structural audit: what changed beyond text?
// Compares the live page against the pristine captured original, ignoring text
// content entirely and looking only at structure — element counts, class usage,
// and attributes. Anything reported here is a change to the DESIGN, not the copy.
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const OUT = path.join(__dirname, 'out');
const A = process.argv[2] || path.join(OUT, 'assets', 'heynesh.com', 'index.html'); // pristine capture
const B = process.argv[3] || path.join(OUT, 'index.html');                          // live page

function profile(file) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const tags = {}, classes = {}, ids = {};
  let imgs = 0, svgPaths = 0, svgTexts = 0;
  $('*').each((i, e) => {
    const t = e.tagName;
    if (!t) return;
    tags[t] = (tags[t] || 0) + 1;
    if (t === 'img') imgs++;
    if (t === 'path') svgPaths++;
    if (t === 'text') svgTexts++;
    const c = $(e).attr('class');
    if (c) c.split(/\s+/).filter(Boolean).forEach((k) => { classes[k] = (classes[k] || 0) + 1; });
    const id = $(e).attr('id');
    if (id) ids[id] = true;
  });
  return { tags, classes, ids, imgs, svgPaths, svgTexts, total: $('*').length };
}

const a = profile(A), b = profile(B);

console.log(`baseline : ${path.basename(A)}  ${a.total} elements`);
console.log(`current  : ${path.basename(B)}  ${b.total} elements`);
console.log(`delta    : ${b.total - a.total > 0 ? '+' : ''}${b.total - a.total} elements\n`);

function diffMap(m1, m2, label, limit = 40) {
  const keys = [...new Set([...Object.keys(m1), ...Object.keys(m2)])].sort();
  const rows = [];
  for (const k of keys) {
    const x = m1[k] || 0, y = m2[k] || 0;
    if (x !== y) rows.push([k, x, y, y - x]);
  }
  if (!rows.length) { console.log(`${label}: no differences\n`); return; }
  rows.sort((p, q) => Math.abs(q[3]) - Math.abs(p[3]));
  console.log(`${label}: ${rows.length} differing`);
  rows.slice(0, limit).forEach(([k, x, y, d]) => {
    console.log(`   ${(d > 0 ? '+' : '') + d}`.padEnd(7) + `${k}`.padEnd(34) + `${x} → ${y}`);
  });
  if (rows.length > limit) console.log(`   … ${rows.length - limit} more`);
  console.log();
}

diffMap(a.tags, b.tags, 'ELEMENT TYPES');
diffMap(a.classes, b.classes, 'CLASSES (design-bearing)');

console.log('SVG ARTWORK');
console.log(`   <path> vector shapes : ${a.svgPaths} → ${b.svgPaths}  (${b.svgPaths - a.svgPaths})`);
console.log(`   <text> substitutes   : ${a.svgTexts} → ${b.svgTexts}  (+${b.svgTexts - a.svgTexts})`);
console.log(`   <img> elements       : ${a.imgs} → ${b.imgs}  (${b.imgs - a.imgs})\n`);

const lostIds = Object.keys(a.ids).filter((k) => !b.ids[k]);
const newIds = Object.keys(b.ids).filter((k) => !a.ids[k]);
console.log('IDS');
console.log('   removed:', lostIds.length ? lostIds.join(', ') : '(none)');
console.log('   added  :', newIds.length ? newIds.join(', ') : '(none)');
