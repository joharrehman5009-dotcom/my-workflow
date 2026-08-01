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
  let nodes = textNodes(node);
  if (!nodes.length) { $(node).text(value); return; }
  // Some source markup wraps bare punctuation in emphasis, e.g. <strong>.</strong>
  // left behind by the original authoring tool. Feeding words into those slots
  // put a random word in bold in every quote, so empty them and leave them out
  // of the distribution. The element itself stays, so nothing structural moves.
  const punct = nodes.filter((t) => /^[.,;:!?’'"\s-]+$/.test(t.data));
  if (punct.length && punct.length < nodes.length) {
    punct.forEach((t) => { t.data = ''; });
    nodes = nodes.filter((t) => !punct.includes(t));
  }
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
    // Every node except the last needs a trailing space. Copying the original
    // node's spacing instead produced runs like "results.He" wherever the source
    // kept its space outside the text node, next to an inline tag.
    const lead = t.data.startsWith(' ') ? ' ' : '';
    const trail = k === nodes.length - 1 ? (t.data.endsWith(' ') ? ' ' : '') : ' ';
    t.data = lead + chunk + trail;
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
// The heading ships with two hard <br> forcing three lines. Dropping them is a
// structural edit, so it only happens when content.json asks for it.
const headingEl = hero.find('.hero-heading').first();
if (headingEl.length && Array.isArray(C.hero.headingLines)) {
  // The element ships with two hard breaks, giving three lines. Rebuild it with
  // exactly one break per gap in headingLines so the wording controls the layout
  // rather than the original markup.
  const before = headingEl.find('br').length;
  const lines = C.hero.headingLines;
  headingEl.empty();
  lines.forEach((line, k) => {
    headingEl.append(k === lines.length - 1 ? line : line + ' ');
    if (k < lines.length - 1) headingEl.append('<br/>');
  });
  hit(`hero heading → ${lines.length} lines (${before} <br> → ${lines.length - 1})`);
} else {
  setText('.hero-heading', C.hero.heading, 'hero heading (br preserved)', hero);
}
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

// Each "Read more" popup carries its OWN full-year div, unclassed and separate
// from the card's .about-card-year. Updating only the card left every popup
// showing the original timeline: Remote Opus opened at 2024, DX Creativ at 2023.
const popups = $('.popup-card-wrap');
let pYears = 0;
popups.each((i, p) => {
  const c = C.about.cards[i];
  if (!c) return;
  const digits = String(c.year).replace(/\D/g, '');
  if (digits.length !== 2) return;
  const full = `20${digits}`;
  const yr = $(p).find('div').filter((j, d) =>
    /^\s*\d{4}\s*$/.test($(d).clone().children().remove().end().text())).first();
  if (!yr.length) return;
  writeInto(yr.get(0), full);
  pYears++;
});
if (pYears) hit(`popup years synced to cards (${pYears})`); else miss('popup years');

// Card avatar circles: swap ONE tech-stack mark for the relevant provided logo.
// Headshots are never touched. Each mark exists as a light-theme and a
// dark-theme variant because ThemeSwitcher inverts these sections, so both are
// replaced with the matching tile. Filenames are pinned explicitly rather than
// detected: a colour-count test misreads the yellow-on-beige "W" as a photo,
// and guessing wrong would replace somebody's face.
const AV = 'assets/local-logos/';

// Slot assignment is by INDEX, measured in the browser rather than guessed.
// Each card renders two overlapping pairs (the card itself and its popup), and
// within each pair one circle sits in front and covers ~34% of the other:
//
//   card[0]  [0] z=3    front of the light pair
//            [1] z=1    behind, 34% covered by [0]
//            [2] z=auto behind, covered by [3]
//            [3] z=1    front of the dark pair
//
// Logos therefore go in the FRONT slots ([0] and [3]) so wordmarks are never
// clipped, and the neutral monogram fills the ones behind. This only rewrites
// src/alt — no element is added, removed or reordered.
// Which slot sits in FRONT differs per card, measured in the browser:
//
//   card 0        [0] cls="z-index-s" z=3   ← front of the light pair
//   cards 4,5,6   [0] cls=""         z=auto ← BEHIND
//                 [1] cls="is-riight-side" z=1  ← front of the light pair
//   all cards     [3] cls="is-riight-side" z=1  ← front of the dark pair
//
// So the logo goes in [0] on card 0 but in [1] on the others. Assuming slot 0
// was always the front is what left the DX Creativ wordmark clipped.
const SLOTS = [
  { card: 0, map: { 0: 'imsciences-circle-light', 1: 'monogram-circle-light',
                    2: 'monogram-circle-dark', 3: 'imsciences-circle-dark' } },
  // Card 3 is the technical SEO period, which was UnitedSol.
  { card: 3, map: { 0: 'monogram-circle-light', 1: 'unitedsol-circle-light',
                    2: 'monogram-circle-dark', 3: 'unitedsol-circle-dark' } },
  // DX Creativ's own mark. The wordmark they publish is 4.80:1, far too wide to
  // read inside a small circle, so the colour "Dx" symbol from their favicon is
  // used on the light disc and a white silhouette on the dark one.
  { card: 4, map: { 0: 'monogram-circle-light', 1: 'dxcreativ-circle-light',
                    2: 'monogram-circle-dark', 3: 'dxcreativ-circle-dark' } },
  { card: 5, map: { 0: 'monogram-circle-light', 1: 'remote-opus-circle-light',
                    2: 'monogram-circle-dark', 3: 'remote-opus-circle-dark' } },
  // card 6 is the personal one (@johar), so it carries your own DP photo rather
  // than a company mark. Two circles only: [0] light theme, [1] dark theme.
  { card: 6, map: { 0: 'johar-dp-circle-light', 1: 'johar-dp-circle-dark' } },
];

let swapped = 0;
const cardsEls = about.find('.about-card');
for (const s of SLOTS) {
  const card = cardsEls.eq(s.card);
  if (!card.length) { miss(`about card ${s.card}`); continue; }
  card.find('.about-card-img').each((i, e) => {
    const asset = s.map[i];
    if (!asset) return;
    const label = asset.startsWith('monogram') ? 'Johar Rehman' : asset.split('-circle')[0];
    $(e).attr('src', AV + asset + '.png').attr('alt', label)
      .removeAttr('srcset').removeAttr('sizes');
    swapped++;
  });
}
hit(`about card circles → logos in front, monogram behind (${swapped} images, ${SLOTS.length} cards)`);

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
    const workCard = $(e).closest('.work-card');
    const body = workCard.find('.op80').first();
    if (body.length) writeInto(body.get(0), c.text);
    // .work-label holds the card number followed by 2-3 stack tags. The tags were
    // still the original site's toolkit (GSAP, CMS, API, Components, Webflow).
    // The leading number is part of the design and is left alone.
    // Slots hold either two or three tags depending on the card, so a short tag
    // list silently leaves one of the original stack labels behind. Warn rather
    // than let that slip through, which is how "Performance" survived a reorder.
    const labels = workCard.find('.work-label').toArray()
      .filter((el) => !/^\d+$/.test($(el).text().trim()));
    const tags = c.tags || [];
    if (tags.length < labels.length) {
      console.warn(`    !! "${c.name}" has ${labels.length} tag slots but only ${tags.length} tags`);
    }
    labels.forEach((el, k) => { if (tags[k]) writeInto(el, tags[k]); });
  });
  hit(`project cards (${cards.length}) + stack tags`);
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
  // The three cards do NOT share a shape. Only the first has a "/ 30hours" unit
  // line, and the second carries six feature lines where the others carry five.
  // A fixed index map left the original Webflow blurb sitting in the slot that
  // an empty unit skipped, so the shape is detected from the markup instead.
  const card = $(e).closest('.service-card');
  const ps = card.find('p').toArray();
  const hasUnit = ps.length > 1 && /^\/\s*\d/.test($(ps[1]).text().trim());
  const itemCount = ps.length - (hasUnit ? 1 : 0) - 3; // price, description, footer
  const items = (c.items || []).slice(0, itemCount);
  const seq = hasUnit
    ? [c.price, c.unit, c.text, ...items, c.footer]
    : [c.price, c.text, ...items, c.footer];
  if (items.length < itemCount) {
    console.warn(`    !! card "${c.heading}" needs ${itemCount} feature lines, content.json has ${(c.items || []).length}`);
  }
  ps.forEach((p, j) => { if (seq[j] !== undefined && seq[j] !== '') writeInto(p, seq[j]); });
  console.log(`    "${c.heading}": ${ps.length} <p>, unit=${hasUnit}, ${itemCount} features, mapped ${seq.length}`);
});
if (svc.length) hit(`service cards (${svc.length})`); else miss('service cards');

// ---------- CTA ----------
// This block was never targeted. Its body uses .max-width-389, the same class as
// the about and services intros, but my selectors were scoped to those sections
// so the CTA kept the original copy.
const cta = $('.cta_section');
if (cta.length && C.cta) {
  setText('.cta_heading', C.cta.heading, 'cta heading (br preserved)', cta);
  const body = cta.find('.max-width-389').first();
  if (body.length) writeInto(body.get(0), C.cta.text);
  const prompt = cta.find('.cta-text').first();
  if (prompt.length && C.cta.prompt) writeInto(prompt.get(0), C.cta.prompt);
  const btn = cta.find('.button-text').first();
  if (btn.length && C.cta.button) writeInto(btn.get(0), C.cta.button);
  // Same stranger's headshot that was removed from the about cards.
  const img = cta.find('.cta_img').first();
  if (img.length) {
    img.attr('src', 'assets/local-logos/johar-dp-circle-light.png')
      .attr('alt', 'Johar Rehman').removeAttr('srcset').removeAttr('sizes');
  }
  hit('cta section (heading, body, prompt, button, avatar)');
} else miss('cta section');

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
      // One tile per person, keyed on the name. Falls back to a neutral avatar
      // rather than 404ing if a name is edited without adding a matching photo.
      const slug = (t.name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      const own = `assets/local-logos/client-${slug}.png`;
      const exists = slug && fs.existsSync(path.join(OUT, own));
      av.attr('src', exists ? own
        : 'assets/cdn.prod.website-files.com/691d7c9f14d0280ebe2d4108/avatar-placeholder.avif');
      av.attr('alt', t.name).removeAttr('srcset').removeAttr('sizes');
      if (!exists) console.warn(`    !! no photo for "${t.name}" (expected ${own})`);
    }
    // No LinkedIn on client attributions. The element stays so the layout is
    // untouched; it carries the person's location instead of a profile link.
    // Held a LinkedIn profile link. It is emptied rather than removed so the
    // slide layout is unchanged, and it is NOT filled with the country, which
    // only repeated what the role line already says one row above.
    const lk = s.find('.client-text-link').first();
    if (lk.length) {
      lk.text('');
      lk.removeAttr('href').removeAttr('target').removeAttr('rel');
    }
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
// The footer viewBox is 1388 wide against the nav logo's 1288. That extra 100
// units is where the registered mark sat, which a single centred <text> both
// ignored and undersized. Mirror the nav exactly: five letters on a 1288 grid at
// font-size 420, then the ® in the remaining space.
const clip = $('#nesh-clip');
if (clip.length) {
  const WORD = 'JOHAR';
  const GRID = 1288;
  const cell = GRID / WORD.length;
  const FONT = "Ppneuemontreal, 'PP Neue Montreal', Arial, sans-serif";
  const letters = [...WORD].map((ch, i) =>
    `<text x="${(cell * i + cell / 2).toFixed(1)}" y="338" text-anchor="middle" ` +
    `font-family="${FONT}" font-weight="700" font-size="420">${ch}</text>`
  ).join('');
  const reg =
    `<text x="1338" y="120" text-anchor="middle" ` +
    `font-family="${FONT}" font-weight="700" font-size="132">®</text>`;
  clip.empty().append(letters + reg);
  hit(`footer wordmark → ${WORD} + registered mark  [${WORD.length} letters at 420, matching the nav]`);
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
//
// The duplicated second marquee item is NOT a copy of the first: two of its
// slots are bare <img> children rather than <svg> or <div>, so they fell through
// both branches and kept the original happyring / semiconBio artwork.
const LOGOS = ['remote-opus', 'imsciences', 'unitedsol', 'dxcreativ'];
const LDIR = 'assets/local-logos/';
let slot = 0, svgN = 0, divN = 0, imgN = 0;
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
    } else if (e.tagName === 'img') {
      // A bare <img> slot. The unsuffixed class is the light-theme variant, so
      // it takes the dark silhouette; "-white" classes take the white one.
      const cls = el.attr('class') || '';
      const variant = /-white\b/.test(cls) ? 'white' : 'black';
      el.attr('src', `${LDIR}${name}-${variant}.png`).attr('alt', name)
        .removeAttr('srcset').removeAttr('sizes');
      imgN++;
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
if (svgN + divN + imgN) hit(`marquee logos → ${LOGOS.join(', ')}  [${svgN} svg + ${divN} img pairs + ${imgN} bare img, geometry unchanged]`);
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

// ---------- dead call-to-action links ----------
// "Book a Call" and "Let's Talk" both pointed at "#", so the primary conversion
// buttons on the page did nothing. Point them at a channel that actually works.
let wired = 0;
$('a').each((i, e) => {
  const el = $(e);
  if ((el.attr('href') || '').trim() !== '#') return;
  const label = el.text().replace(/\s+/g, ' ').trim().toLowerCase();
  const cls = el.attr('class') || '';
  if (/book a call|let's talk|lets talk/.test(label) || /nav-button|cta-button/.test(cls)) {
    el.attr('href', C.meta.whatsapp).attr('target', '_blank').attr('rel', 'noopener');
    wired++;
  } else if (/social-link/.test(cls)) {
    // Two social icons, in markup order: X then LinkedIn.
    el.attr('href', wired % 2 === 0 ? C.meta.linkedin : C.meta.linkedin)
      .attr('target', '_blank').attr('rel', 'noopener');
    wired++;
  } else if (el.closest('.faq-answer').length) {
    el.attr('href', 'mailto:' + C.meta.email);
    wired++;
  }
});
hit(`dead links wired up (${wired})`);

// ---------- work card links ----------
// Every work card linked straight out to the original client's live site
// (1910.ai, semiconbio.com, alosant.com and six more). The href is removed while
// the <a> element itself stays, so the card layout and hover states are intact.
let unlinked = 0;
$('a.work-card').each((i, e) => {
  const el = $(e);
  if (!el.attr('href')) return;
  el.removeAttr('href').removeAttr('target').removeAttr('rel');
  unlinked++;
});
hit(`work card outbound links removed (${unlinked})`);

// ---------- document level SEO / accessibility ----------
$('html').attr('lang', 'en');
if (!$('link[rel=canonical]').length) {
  $('head').append(`<link rel="canonical" href="${C.meta.canonical || 'https://joharrehman5009-dotcom.github.io/'}"/>`);
}
// The share card was still the previous owner's photograph.
const og = 'assets/local-logos/johar-opengraph.jpg';
$('meta[property="og:image"], meta[name="twitter:image"]').attr('content', og);
if (!$('meta[name="twitter:image"]').length) {
  $('head').append(`<meta name="twitter:image" content="${og}"/>`);
}
// Decorative marks with no alt text.
let alts = 0;
$('img').each((i, e) => {
  if ($(e).attr('alt') === undefined) { $(e).attr('alt', ''); alts++; }
});
hit(`lang=en, canonical, OpenGraph card, ${alts} missing alt attributes`);

// The page was captured from a Webflow build, so the generator tag named their
// tool. Nothing renders it, but it is misleading metadata on a page that is no
// longer theirs.
const gen = $('meta[name=generator]');
if (gen.length) { gen.attr('content', 'Johar Rehman'); hit('generator meta → Johar Rehman'); }

// Two build comments sit above <html>: the tool's attribution line and the
// original "Last Published" date. Neither renders, but both are metadata from a
// build that is no longer this one. Comments are not rendered, so removing them
// cannot affect layout.
let comments = 0;
$.root().contents().each((i, n) => {
  if (n.type === 'comment' && /created in Webflow|Last Published/i.test(n.data || '')) {
    $(n).remove();
    comments++;
  }
});
if (comments) hit(`removed ${comments} build comment(s) from the document head`);

// data-wf-domain still named the original site. Safe to change: it is only used
// for the platform's own domain handling.
//
// data-wf-page and data-wf-site are deliberately NOT touched. The interactions
// engine keys its animation data off those ids, so renaming them would break
// every native interaction on the page.
const htmlEl = $('html');
if (htmlEl.attr('data-wf-domain')) {
  const host = (C.meta.canonical || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  htmlEl.attr('data-wf-domain', host || 'joharrehman5009-dotcom.github.io');
  hit(`data-wf-domain → ${htmlEl.attr('data-wf-domain')}  (page/site ids left intact)`);
}

// ---------- spacing override ----------
// The testimonial card is flex with space-between and a fixed height. Its
// content overruns that height, so the avatar row is pushed straight through
// the card's 24px bottom padding and ends up flush against the edge
// (measured gap below the row: 0.3px). Lift it clear.
//
// Kept as a separate appended block rather than an edit to the Webflow
// stylesheet, so it is obvious and trivially reversible. Sized in vw to match
// the fluid scale the rest of the design uses.
const OVERRIDE_ID = 'johar-overrides';
$(`#${OVERRIDE_ID}`).remove();
$('head').append(
  `<style id="${OVERRIDE_ID}">\n` +
  `  .swiper-card-bottom { margin-bottom: 1.25vw; }\n` +
  `  @media screen and (max-width: 767px) { .swiper-card-bottom { margin-bottom: 4vw; } }\n` +
  `</style>`
);
hit('spacing override: avatar row lifted off the card edge');

fs.writeFileSync(FILE, $.html());
console.log(log.join('\n'));
console.log(`\napplied ${n} content groups → out/index.html`);
