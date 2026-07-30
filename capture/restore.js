// One-command revert. Puts every file from a snapshot back where it came from.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BK = path.join(ROOT, 'out', '_backup');

const label = process.argv[2] || 'base';
const dir = path.join(BK, label);

if (!fs.existsSync(dir)) {
  console.log(`no snapshot named "${label}".`);
  const avail = fs.existsSync(BK) ? fs.readdirSync(BK) : [];
  console.log(avail.length ? `available: ${avail.join(', ')}` : 'no snapshots exist yet — run: node backup.js');
  process.exit(1);
}

const { files } = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8'));

for (const { rel } of files) {
  const src = path.join(dir, rel);
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  restored  ${rel}`);
}

console.log(`\nreverted to snapshot "${label}" — ${files.length} files.`);
console.log('reload http://localhost:8080 to see it.');
