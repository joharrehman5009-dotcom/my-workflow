// Snapshot every file a content change can touch, so restore.js can put the
// replica back exactly as it was in one command.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const WF = path.join(OUT, 'assets', 'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108');
const BK = path.join(OUT, '_backup');

const TARGETS = [
  path.join(OUT, 'index.html'),
  path.join(WF, '6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif'),
  path.join(WF, '6926f8e053a878c5f61cc622_nenad_edit-photo_final 1-p-500.avif'),
  path.join(ROOT, 'rename.js'),
  path.join(ROOT, 'localize.js'),
];

const label = process.argv[2] || 'base';
const dir = path.join(BK, label);

if (fs.existsSync(dir) && !process.argv.includes('--force')) {
  console.log(`snapshot "${label}" already exists — refusing to overwrite.`);
  console.log(`use a new label, or pass --force to replace it.`);
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const manifest = [];

for (const src of TARGETS) {
  if (!fs.existsSync(src)) { console.log(`  skip (absent)  ${path.basename(src)}`); continue; }
  const rel = path.relative(ROOT, src);
  const dest = path.join(dir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const size = fs.statSync(src).size;
  manifest.push({ rel, size });
  console.log(`  saved  ${(size / 1024).toFixed(1).padStart(8)} KB  ${rel}`);
}

fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({ label, files: manifest }, null, 2));
console.log(`\nsnapshot "${label}" → out/_backup/${label}/  (${manifest.length} files)`);
console.log(`restore with:  node restore.js ${label}`);
