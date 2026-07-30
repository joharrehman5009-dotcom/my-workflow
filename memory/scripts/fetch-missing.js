// Pull assets that were referenced in markup but never requested by the browser
// during capture — responsive -p-500 variants, OG/webclip images, and carousel
// avatars that lazy-load only once their Swiper slide is reached.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const missing = JSON.parse(fs.readFileSync(path.join(OUT, 'missing.json'), 'utf8'));

function diskPath(urlStr) {
  const u = new URL(urlStr);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (u.search) {
    const ext = path.extname(p);
    p = p.slice(0, p.length - ext.length) + '_' + Buffer.from(u.search).toString('hex').slice(0, 8) + ext;
  }
  return path.join(OUT, 'assets', u.hostname, p);
}

(async () => {
  for (const url of missing) {
    if (new URL(url).pathname.endsWith('/')) { console.log(`  skip (directory)  ${url}`); continue; }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://heynesh.com/' } });
      if (!res.ok) { console.log(`  FAIL ${res.status}  ${path.basename(url)}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const file = diskPath(url);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      console.log(`  ok  ${(buf.length / 1024).toFixed(1).padStart(7)} KB  ${path.basename(file)}`);
    } catch (e) {
      console.log(`  ERR ${path.basename(url)}: ${e.message}`);
    }
  }
})();
