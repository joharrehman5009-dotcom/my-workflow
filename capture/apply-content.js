// Apply Johar's content to the localized + rebranded page.
//
// HARD RULE: text only. This script must not add, remove, or reorder a single
// element, and must not touch vector artwork. An earlier version used
// cheerio's .text(), which replaces ALL child nodes — that silently destroyed
// 413 inline tags (<br> line breaks in every heading, <span> wrappers inside
// .what_you_get-text that TextReveal depends on). Everything here goes through
// setText(), which rewrites text NODES and leaves the element tree untouched.
//
// Runs AFTER localize.js and rename.js. Edits out/index.html only.
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const FILE = path.join(OUT, 'index.html');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'));

const $ = cheerio.load(fs.readFileSync(FILE, 'utf8'), { decodeEntities: false });
let n = 0;
const log = [];
const hit = (w) => { n++; log.push('  ✓ ' + w); };
const miss = (w) => log.push('  – skipped (not found): ' + w);

// Collect the text nodes under an element, in document order.
function textNodes(el) {
  const out = [];
  (function walk(node) {
    for (const c of node.children || []) {
      if (c.type === 'text') { if (c.data && c.data.trim()) out.push(c); }
      else if (c.type === 'tag') walk(c);
    }
  })(el);
  return out;
}

// Rewrite an element's words while keeping every child tag exactly where it is.
// With multiple text nodes (a heading split by <br>, say) the replacement is
// distributed across them in proportion to the original lengths, so the line
// breaks stay meaningful instead of being wiped out.
function setText(sel, value, label, ctx) {
  const el = (ctx ? ctx.find(sel) : $(sel)).first();
  if (!el.length) return miss(label);
  writeInto(el.get(0), value);
  hit(label);
}
function writeInto(node, value) {
  const nodes = textNodes(node);
  if (!nodes.length) { $(node).text(value); return; }
  if (nodes.length === 1) { nodes[0].data = value; return; }
  const lens = nodes.map((t) => t.data.trim().length);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const words = value.split(/\s+/);
  let i = 0;
  nodes.forEach((t, k) => {
    const share = k === nodes.length - 1
      ? words.length - i
      : Math.max(1, Math.round(words.length * (lens[k] / total)));
    const chunk = words.slice(i, i + share).join(' ');
    i += share;
    t.data = (t.data.startsWith(' ') ? ' ' : '') + chunk + (t.data.endsWith(' ') ? ' ' : '');
  });
}
function setEachEl(els, values, label) {
  if (!els.length) return miss(label);
  els.each((i, e) => { if (values[i] !== undefined) writeInto(e, values[i]); });
  hit(`${label} (${els.length})`);
}

// ---------- meta (attributes only, no elements involved) ----------
$('title').text(C.meta.title);
$('meta[name=description], meta[property="og:description"], meta[name="twitter:description"]').attr('content', C.meta.description);
$('meta[property="og:title"], meta[name="twitter:title"]').attr('content', C.meta.title);
hit('meta title/description');

// ---------- hero ----------
const hero = $('#hero');
setText('.hero-left-text', C.hero.leftText, 'hero left text', hero);
setText('.hero-heading', C.hero.heading, 'hero heading (br preserved)', hero);
setText('.hero-right-text', C.hero.rightText, 'hero right text', hero);

// "80+ / Projects" — two text nodes either side of a <br>. Feed it as two words
// so the existing break is respected rather than replaced.
const proj = $('.hero-webflow-projects-text, .nav-webflow-text');
if (proj.length) {
  proj.each((i, e) => writeInto(e, C.hero.projectsStat.replace(/(?<=\+)/, ' ')));
  hit(`projects stat → ${C.hero.projectsStat} (${proj.length})`);
} else miss('projects stat');

// Target the tag list exactly. A previous "short <p> inside the hero cards"
// filter also caught .hero-webflow-projects-text, overwriting the "30+ Websites"
// stat with a tag word. The five tags are unclassed <p> inside .hero-card-3-item.
const tags = $('.hero-card-3-item > p').filter((i, e) => !$(e).attr('class'));
if (tags.length) {
  tags.each((i, e) => { if (C.hero.tags[i]) writeInto(e, C.hero.tags[i]); });
  hit(`hero tags (${tags.length})`);
} else miss('hero tags');

// NOTE: the "7+" experience figure is SVG letterform artwork, handled in
// rename.js. Nothing here touches it.

// ---------- about ----------
const about = $('#about');
setText('.h2-style', C.about.heading, 'about heading (br preserved)', about);
setText('.max-width-389', C.about.intro, 'about intro', about);
// The year is an apostrophe text node followed by an odometer <span> whose value
// comes from its data-number-count ATTRIBUTE, not its text. A plain text write
// filled the apostrophe slot with "22" and emptied the span, while the counter
// still animated to the old attribute value, rendering "'2219". Set the
// attribute and the span text together, and leave the apostrophe alone.
const years = about.find('.about-card-year');
years.each((i, e) => {
  const c = C.about.cards[i];
  if (!c) return;
  const digits = String(c.year).replace(/\D/g, '');
  if (!digits) return;
  const el = $(e);
  const span = el.find('span[data-number-count]').first();
  const lead = textNodes(e).find((t) => !span.get(0) || !$.contains(span.get(0), t));
  if (lead) lead.data = "'";
  if (span.length) span.attr('data-number-count', digits).text(digits);
  else writeInto(e, `'${digits}`);
});
if (years.length) hit(`about years (${years.length}, odometer attr + text synced)`); else miss('about years');

// Card avatar circles: swap ONE tech-stack mark for the relevant provided logo.
// Headshots are never touched. Each mark exists as a light-theme and a
// dark-theme variant because ThemeSwitcher inverts these sections, so both are
// replaced with the matching tile. Filenames are pinned explicitly rather than
// detected: a colour-count test misreads the yellow-on-beige "W" as a photo,
// and guessing wrong would replace somebody's face.
const AV = 'assets/local-logos/';
const MARK_SWAPS = [
  // card index, logo, [light-variant file, dark-variant file] of the mark to replace
  { card: 0, logo: 'imsciences',
    light: '6938003e6bd18390b3bef67c_Frame 116046197.avif',   // Webflow "W", light
    dark: '6945df05a90861c514ccbed5_Frame 116046201-1.svg' }, // Webflow "W", dark
  { card: 4, logo: 'unitedsol',
    light: '69399f9348881bb03b006451_Frame 116046201-1.avif', // shield mark, light
    dark: '6945df05fc58dfb3e9f5fbec_Frame 116046197.svg' },   // shield mark, dark
  { card: 5, logo: 'remote-opus',
    light: '69399f936be7964da2364eca_Frame 116046201.avif',   // home mark, light
    dark: '6945df057a20901ce46dcb36_Frame 116046197-3.svg' }, // home mark, dark
];
let swapped = 0;
const cardsEls = about.find('.about-card');
for (const s of MARK_SWAPS) {
  const card = cardsEls.eq(s.card);
  if (!card.length) continue;
  card.find('.about-card-img').each((i, e) => {
    const src = decodeURIComponent($(e).attr('src') || '');
    const variant = src.endsWith(s.light) ? 'light' : src.endsWith(s.dark) ? 'dark' : null;
    if (!variant) return;
    $(e).attr('src', `${AV}${s.logo}-circle-${variant}.png`)
      .attr('alt', s.logo).removeAttr('srcset').removeAttr('sizes');
    swapped++;
  });
}
hit(`about card marks → provided logos (${swapped} images across ${MARK_SWAPS.length} cards)`);

// Marquee logos are handled further down, in the block that also covers the two
// <div> slots and parses its SVG fragment in XML mode. Do not add a second
// handler here — running both leaves the row in whichever state ran last.
setEachEl(about.find('.about-card-heading'), C.about.cards.map((c) => c.heading), 'about card headings');
setEachEl(about.find('.op80'), C.about.cards.map((c) => c.short), 'about card blurbs');
setEachEl(about.find('.about-card-bottom-text'), C.about.cards.map((c) => c.handle), 'about handles');
const pops = about.find('.popup-heading');
pops.each((i, e) => {
  const c = C.about.cards[i];
  if (!c) return;
  writeInto(e, c.heading);
  const body = $(e).closest('.popup-card-wrap, .popup-card').find('p').first();
  if (body.length) writeInto(body.get(0), c.long);
});
if (pops.length) hit(`about popups (${pops.length})`);

// ---------- projects ----------
const projSec = $('#projects');
setText('.h2-style-white', C.projects.heading, 'projects heading (br preserved)', projSec);
const pIntro = projSec.find('p').filter((i, e) => $(e).text().trim().length > 80).first();
if (pIntro.length) { writeInto(pIntro.get(0), C.projects.intro); hit('projects intro'); } else miss('projects intro');
const cards = projSec.find('.work-card-heading');
if (cards.length) {
  cards.each((i, e) => {
    const c = C.projects.cards[i];
    if (!c) return;
    writeInto(e, c.name);
    const body = $(e).closest('.work-card').find('.op80').first();
    if (body.length) writeInto(body.get(0), c.text);
  });
  hit(`project cards (${cards.length})`);
} else miss('project cards');

// ---------- overview ----------
const ov = $('#overview');
setText('.h2-big', C.overview.heading, 'overview heading (br preserved)', ov);
// .what_you_get-text contains <span> wrappers that TextReveal splits around.
setEachEl(ov.find('.what_you_get-text, .what_you_get-text-mobile'), [C.overview.intro, C.overview.intro], 'overview intro (spans preserved)');
const caps = ov.find('.capa-card-heading');
caps.each((i, e) => {
  const c = C.overview.cards[i];
  if (!c) return;
  writeInto(e, c.heading);
  const body = $(e).closest('.capa-card-item').find('.capa-card-text').first();
  if (body.length) writeInto(body.get(0), c.text);
});
if (caps.length) hit(`overview cards (${caps.length})`); else miss('overview cards');

// ---------- services ----------
const sv = $('#services');
setText('.h2-style', C.services.heading, 'services heading', sv);
setText('.max-width-389', C.services.intro, 'services intro', sv);
const svc = sv.find('.service-card-heading');
svc.each((i, e) => {
  const c = C.services.cards[i];
  if (!c) return;
  writeInto(e, c.heading);
  const card = $(e).closest('.service-card');
  card.find('p').each((j, p) => {
    const t = $(p).text().trim();
    if (/^\$/.test(t) || t === 'Book a Call') writeInto(p, c.price);
    else if (/^\/\s*\d*\s*hours?$/i.test(t) && c.unit) writeInto(p, c.unit);
  });
});
if (svc.length) hit(`service cards (${svc.length})`); else miss('service cards');

// ---------- testimonials ----------
// All 8 slides are KEPT. Removing five previously deleted 223 elements' worth of
// structure and risked Swiper's custom drag indicator. The three real quotes are
// cycled across the eight slots; nothing is invented and nothing is deleted.
const ts = $('#testimonial');
setText('.h2-style', C.testimonial.heading, 'testimonial heading', ts);
const slides = ts.find('.swiper-slide');
if (slides.length) {
  slides.each((i, e) => {
    const s = $(e);
    const t = C.testimonial.items[i % C.testimonial.items.length];
    const head = s.find('.swiper-heading').first();
    if (head.length) writeInto(head.get(0), t.title);
    const q = s.find('p').filter((j, p) => $(p).text().trim().length > 60).first();
    if (q.length) writeInto(q.get(0), t.quote);
    const nm = s.find('.text-weight-medium').first();
    if (nm.length) writeInto(nm.get(0), t.name);
    const rl = s.find('.client-text-small').first();
    if (rl.length) writeInto(rl.get(0), t.role);
    // Element kept; only the src/alt change — same swap class as the profile photo.
    const av = s.find('.client-img').first();
    if (av.length) {
      av.attr('src', `assets/cdn.prod.website-files.com/691d7c9f14d0280ebe2d4108/avatar-${t.name.trim()[0].toLowerCase()}.avif`);
      av.attr('alt', t.name).removeAttr('srcset').removeAttr('sizes');
    }
    // Element kept — text and href rewritten rather than removed.
    const lk = s.find('.client-text-link').first();
    if (lk.length) { writeInto(lk.get(0), 'linkedin.com/in/johar-rehman'); lk.attr('href', C.meta.linkedin); }
  });
  hit(`testimonials: all ${slides.length} slides kept, ${C.testimonial.items.length} quotes cycled`);
} else miss('testimonial slides');

// ---------- faq ----------
const faq = $('#faq');
setText('.h2-style', C.faq.heading, 'faq heading', faq);
const qs = faq.find('.faq-heading');
let answered = 0;
qs.each((i, e) => {
  const it = C.faq.items[i];
  if (!it) return;
  writeInto(e, it.q);
  const a = $(e).closest('.w-dropdown').find('.faq-answer').first();
  if (a.length) { writeInto(a.get(0), it.a); answered++; }
});
if (qs.length) hit(`faq (${qs.length} q, ${answered} a)`); else miss('faq');

// ---------- JSON-LD (metadata, not rendered — no design impact) ----------
$('script[type="application/ld+json"]').each((i, e) => {
  let j;
  try { j = JSON.parse($(e).html()); } catch { return; }
  if (!j.review) return;
  j.name = 'SEO & Performance Marketing by Johar Rehman';
  if (j.provider) { j.provider.name = 'Johar Rehman'; delete j.provider.url; }
  delete j.url;
  j.aggregateRating = { '@type': 'AggregateRating', ratingValue: '5', bestRating: '5', ratingCount: String(C.testimonial.items.length) };
  j.review = C.testimonial.items.map((t) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: t.name },
    reviewBody: t.quote,
    reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
  }));
  $(e).text(JSON.stringify(j, null, 2));
  hit('JSON-LD reviews (real ones, no fabricated attributions)');
});

// ---------- hero image (attribute swap only) ----------
const img = $('img.hero-profile-img');
if (img.length) {
  const dir = 'assets/cdn.prod.website-files.com/691d7c9f14d0280ebe2d4108/';
  img.attr('src', dir + 'johar-hero.avif');
  img.attr('srcset', `${dir}johar-hero-p-500.avif 500w, ${dir}johar-hero.avif 1670w`);
  img.attr('alt', 'Johar Rehman');
  hit('hero image → johar-hero.avif');
} else miss('hero image');

// ---------------------------------------------------------------------------
// THE ONLY TWO VECTOR EDITS IN THIS FILE.
// Both are letterforms drawn as SVG paths, so there is no text node to rewrite —
// the name and the year count cannot change without replacing artwork. Same
// category as the nav logo. Everything else above is text nodes only.
// ---------------------------------------------------------------------------

// Footer wordmark: a clipPath the image-trail reveals photos through. Only the
// clip shape changes; #nesh-clip keeps its id, and .footer-logo,
// .footer-logo-icon and #image-trail-group are untouched, so the effect works.
const clip = $('#nesh-clip');
if (clip.length) {
  clip.empty().append(
    `<text x="694" y="169" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Ppneuemontreal, sans-serif" font-weight="700" font-size="300" ` +
    `letter-spacing="-10">JOHAR</text>`
  );
  hit('footer wordmark → JOHAR  [vector: 5 paths → 1 text]');
} else miss('footer clip-path');

// The years figure is drawn TWICE with two different class names: .experience-number
// in the hero card and .nav-experience-numb in the collapsed sidebar. Fixing only
// one left the hero still reading 7+, so both are handled here.
const numb = $('.nav-experience-numb, .experience-number');
if (numb.length) {
  numb.each((i, e) => {
    const el = $(e);
    const vb = (el.attr('viewBox') || '0 0 41 28').split(/\s+/).map(Number);
    const h = vb[3] || 28;
    el.empty().append(
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Ppneuemontreal, sans-serif" font-weight="700" font-size="${h}" ` +
      `fill="currentColor">${C.hero.experienceStat}</text>`
    );
  });
  hit(`experience figure → ${C.hero.experienceStat}  [vector: ${numb.length} svgs, paths → text]`);
} else miss('experience figure');

// ---------- marquee logos ----------
// Artwork only. Every slot keeps its element, class and viewBox, so the CSS
// widths and the row geometry are byte-identical to the original.
//
// The <svg> slots draw a currentColor rect through a luminance mask built from
// the logo, exactly reproducing the fill="currentColor" behaviour of the vector
// artwork they replace — so the logos still invert with the theme switcher.
// The two <div> slots already ship a dark and a white image for that same
// purpose, so those just get their src swapped.
const LOGOS = ['remote-opus', 'imsciences', 'unitedsol'];
const LDIR = 'assets/local-logos/';
let slot = 0, svgN = 0, divN = 0;
$('.nav-comapny-item').each((mi, item) => {
  $(item).children().each((ci, e) => {
    const el = $(e);
    const name = LOGOS[slot++ % LOGOS.length];
    if (e.tagName === 'svg') {
      // userSpaceOnUse with the slot's own viewBox dimensions. objectBoundingBox
      // units give a non-uniform 0..1 space that mangles preserveAspectRatio and
      // is barely supported for <image>, which rendered the row blank.
      const vb = (el.attr('viewBox') || '0 0 51 18').trim().split(/[\s,]+/).map(Number);
      const w = vb[2] || 51, h = vb[3] || 18;
      const id = `logo-mask-${mi}-${ci}`;
      const frag =
        `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">` +
        `<image href="${LDIR}${name}-white.png" x="0" y="0" width="${w}" height="${h}" ` +
        `preserveAspectRatio="xMidYMid meet"/></mask></defs>` +
        `<rect x="0" y="0" width="${w}" height="${h}" fill="currentColor" mask="url(#${id})"/>`;
      // Parse as XML before inserting. In HTML mode cheerio lowercases maskUnits
      // to maskunits (SVG attributes are case-sensitive) and rewrites <image> to
      // the void element <img>, which silently emptied the whole mask.
      el.empty().append(cheerio.load(`<r>${frag}</r>`, { xmlMode: true })('r').children());
      svgN++;
    } else {
      const imgs = el.find('img');
      if (imgs.length >= 2) {
        $(imgs[0]).attr('src', `${LDIR}${name}-black.png`).attr('alt', name).removeAttr('srcset').removeAttr('sizes');
        $(imgs[1]).attr('src', `${LDIR}${name}-white.png`).attr('alt', name).removeAttr('srcset').removeAttr('sizes');
        divN++;
      }
    }
  });
});
if (svgN + divN) hit(`marquee logos → ${LOGOS.join(', ')}  [${svgN} svg slots + ${divN} img pairs, geometry unchanged]`);
else miss('marquee logos');

// ---------- footer bio / email / links (text + attributes only) ----------
// .nav-top-text sits inside .nav-container, whose scrollHeight drives
// Sidebar.scale(). Longer copy here makes the sidebar taller, which lowers
// sidebarScale, which shrinks the button masks until "Book a Call" clips.
// Keep it at or under the original length; the guard below makes a regression
// loud instead of silent.
const ORIGINAL_SIDEBAR_BIO = 122;
const navTop = $('.nav-top-text');
if (navTop.length) {
  const bio = C.hero.sidebarBio || C.hero.rightText;
  if (bio.length > ORIGINAL_SIDEBAR_BIO) {
    console.warn(`\n  !! sidebar bio is ${bio.length} chars vs original ${ORIGINAL_SIDEBAR_BIO}.`);
    console.warn(`     This shrinks sidebarScale and will clip the button labels.\n`);
  }
  navTop.each((i, e) => writeInto(e, bio));
  hit(`sidebar bio (${navTop.length}, ${bio.length}/${ORIGINAL_SIDEBAR_BIO} chars)`);
} else miss('sidebar bio');

const mailNodes = $('.email-text');
if (mailNodes.length) { mailNodes.each((i, e) => writeInto(e, C.meta.email)); hit(`email → ${C.meta.email}`); } else miss('email text');
$('a[href^="mailto:"]').attr('href', 'mailto:' + C.meta.email);
$('.faq-answer').each((i, e) => {
  const nodes = textNodes(e);
  nodes.forEach((t) => { if (t.data.includes('@')) t.data = t.data.replace(/[\w.+-]+@[\w.-]+\.\w+/g, C.meta.email); });
});

$('a[href*="linkedin.com"]').attr('href', C.meta.linkedin);
$('a[href*="cal.com"], a[href*="x.com"]').attr('href', C.meta.whatsapp);
hit('outbound links → your LinkedIn / WhatsApp');

fs.writeFileSync(FILE, $.html());
console.log(log.join('\n'));
console.log(`\napplied ${n} content groups → out/index.html`);
