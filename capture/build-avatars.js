// Generate initial-letter avatars for the testimonials. The captured page ships
// photographs of real, identifiable people; leaving those attached to different
// client names would be a fabricated endorsement, so they get replaced outright.
// Matches the letter-avatar style used on joharrehman's own portfolio.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const WF = path.join(__dirname, 'out', 'assets', 'cdn.prod.website-files.com', '691d7c9f14d0280ebe2d4108');
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'content.json'), 'utf8'));

const SIZE = 240;

(async () => {
  for (const t of C.testimonial.items) {
    const letter = t.name.trim()[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <rect width="${SIZE}" height="${SIZE}" rx="${SIZE / 2}" fill="#2F2F2F"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
            font-family="Helvetica, Arial, sans-serif" font-weight="700"
            font-size="${Math.round(SIZE * 0.44)}" fill="#FFFF23">${letter}</text>
    </svg>`;
    const file = path.join(WF, `avatar-${letter.toLowerCase()}.avif`);
    await sharp(Buffer.from(svg)).avif({ quality: 70 }).toFile(file);
    console.log(`  ${letter}  →  ${path.basename(file)}  (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n${C.testimonial.items.length} avatars written`);
})();
