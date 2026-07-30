// Video/audio elements fetch via HTTP Range, so the capture wrote partial
// bodies (206) to disk. Re-fetch those URLs in full with a plain GET.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

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
  const urls = [...new Set(manifest.filter((m) => m.status === 206).map((m) => m.url))];
  console.log(`repairing ${urls.length} range-fetched media files\n`);

  for (const url of urls) {
    const file = diskPath(url);
    const before = fs.existsSync(file) ? fs.statSync(file).size : 0;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://heynesh.com/' } });
      if (!res.ok) { console.log(`  FAIL ${res.status}  ${path.basename(file)}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      const mb = (n) => (n / 1048576).toFixed(2);
      console.log(`  ok  ${mb(before)}MB -> ${mb(buf.length)}MB  ${path.basename(file)}`);
    } catch (e) {
      console.log(`  ERR ${path.basename(file)}: ${e.message}`);
    }
  }
})();
