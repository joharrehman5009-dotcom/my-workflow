# Local Replica Pipeline

A fully offline, pixel-accurate local copy of a Webflow site, rebranded to **JOHAR**.

Built to answer one question: *can an AI actually reproduce a site exactly, animations and all?*
Answer: yes — but only by capturing the real assets, never by regenerating from screenshots.

**Measured result: 0.44% mean pixel difference across 16 scroll positions, with every
external host blocked at the network layer.**

---

## Quick start

```bash
npm install
node serve.js          # → http://localhost:8080
```

That's it. The replica runs with zero network access — no CDN, no fonts API, nothing.

---

## Folder layout

```
.
├── capture.js         1. drive a real browser, save every response to disk
├── repair-media.js    2. re-fetch videos that arrived as partial (206) responses
├── localize.js        3. rewrite every absolute URL to a local path
├── fetch-missing.js   4. pull assets referenced in markup but never requested
├── rename.js          5. rebrand NESH → JOHAR (DOM-safe, not regex-on-markup)
├── verify.js          6. boot offline, diff against the originals, report
├── shot.js            quick 3-frame visual check (no diffing)
├── serve.js           static server with HTTP Range support
│
├── PROCESS.md         full build log — every bug, root cause, and fix
├── FINDINGS.md        what the target site is actually built from
│
└── out/
    ├── index.html         the replica (localized + rebranded)
    ├── assets/            95 files — css, js, fonts, images, video
    ├── rendered.html      post-JS DOM snapshot (reference only, NOT the source)
    ├── all-styles.css     every CSS rule flattened out of the CSSOM
    ├── fingerprint.json   libraries, fonts, live animation timings
    ├── manifest.json      every network response observed during capture
    ├── frames/            16 reference screenshots from the original site
    ├── frames-local/      the same 16 positions from the replica
    ├── frames-diff/       pixel diffs between them
    └── shots/             preloader / hero / nav visual checks
```

---

## Pipeline order

Steps 3–5 are re-runnable in sequence; `localize.js` always rebuilds `out/index.html`
from the pristine captured HTML, so `rename.js` must run after it.

```bash
node capture.js https://example.com/   # once
node repair-media.js                   # once, fixes 206 range-fetched video
node localize.js                       # rewrite urls  (rebuilds out/index.html)
node fetch-missing.js                  # pull anything localize flagged
node localize.js                       # re-run so the new files get linked
node rename.js                         # rebrand  (must follow localize)
node verify.js                         # measure
```

---

## Two rules that make this work

**1. Build from `index.html`, never `rendered.html`.**
`rendered.html` is a post-JS snapshot — SplitText has already wrapped every character
and GSAP has baked inline transforms into the DOM. Re-running the scripts against it
double-applies everything. The pristine server HTML is the only correct source.

**2. Only rename capitalised `NESH` / `Nenad`.**
Lowercase `nesh` / `nenad` appear in CSS class names (`.nesh-logo`), GSAP selectors
(`$$('.nesh-logo-letter')`), and asset filenames (`nenad_edit-photo_final 1.avif`).
A blind find-and-replace breaks the animation engine and 404s the images.

---

## Known state

- `referenced but NOT captured: 0` — the copy is fully self-contained
- All five libraries live at runtime: gsap, ScrollTrigger, Lenis, Swiper, SplitText
- Preloader stagger, FLIP-to-nav, scroll blur, marquee, and Swiper all preserved

### Not yet neutralised

The rebrand covers text, logo, email, and outbound links. It does **not** replace:

- the hero photograph (a real person)
- testimonial names, quotes, headshots, and schema.org review markup
- client case-study imagery and video

Fine for a local demo; see PROCESS.md for why none of it should be published.
