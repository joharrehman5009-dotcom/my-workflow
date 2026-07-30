# Memory — Website Replica Project

Complete archive of the heynesh.com replica build. Everything needed to understand what
was done, why, and how to redo it.

## Start here

## Open it right now

```powershell
cd "d:\Website dev\capture"
node serve.js          # → http://localhost:8080
```

Do not open `index.html` directly from disk — `file://` blocks the fonts and can't do
the HTTP Range requests the videos need. Full detail and troubleshooting in
**[RUN.md](RUN.md)**.

---

Two separate questions are documented here — **how the site is built**, and **how it was
replicated**. They're different documents.

### How the website itself works

| file | what's in it |
|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | full teardown — layout system, animation engine, all 21 sections, boot order, patterns worth stealing |
| **[FINDINGS.md](FINDINGS.md)** | inventory — stack, versions, fonts, assets, section index |

### How the replica was built

| file | what's in it |
|---|---|
| **[RUN.md](RUN.md)** | how to open it on localhost, ports, troubleshooting, full rerun order |
| **[SESSION-LOG.md](SESSION-LOG.md)** | full chronological account — read this first |
| **[PROCESS.md](PROCESS.md)** | every bug encountered, its root cause, and the fix |
| [PIPELINE-README.md](PIPELINE-README.md) | the quick-start doc that ships beside the working pipeline |
| `scripts/` | all 11 pipeline scripts exactly as written |
| `data/` | `fingerprint.json` (libraries, fonts, live animations), `manifest.json` (every network response) |

### Primary source — the actual code being described

| file | what it is |
|---|---|
| `source/animation-engine.js` | the site's custom engine, 3,307 unminified commented lines — the thing ARCHITECTURE.md documents |
| `source/webflow-compiled.css` | Webflow's compiled stylesheet, 914 rules |
| `source/all-styles.css` | every CSS rule flattened out of the live CSSOM |

### Evidence

| file | what it shows |
|---|---|
| `evidence/original-hero.png` | the real site, for comparison |
| `evidence/hero.png` | the replica, rebranded to JOHAR |
| `evidence/preloader.png` | the letter stagger caught mid-flight — J and O landed, H rising, A and R still off-screen |
| `evidence/nav.png` | scrolled state: FLIP into the sidebar, blur on the portrait |

## How the site works, in five lines

A one-page Webflow site whose hero **transforms into the navigation** as you scroll.
That effect is a hand-rolled FLIP (`GhostEngine`): invisible "ghost" elements in the
hero mark where each nav element should land, and the engine measures every pair in one
read pass before writing any transform. Most other animation is declared in the markup
itself via `data-tl-*` attributes and compiled to GSAP timelines by a second custom
engine. Lenis provides smooth scroll, driven by GSAP's single ticker.

Full teardown: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## The one-line answer

An AI **cannot** replicate a site from a URL or a screenshot — it only receives text.
It **can** replicate one almost exactly if it drives a real browser and captures the
actual CSS, JS, fonts, and media. Measured result here: **0.44% mean pixel difference**
across 16 scroll positions, running with **zero** external network requests.

## Scripts

| script | role |
|---|---|
| `capture.js` | drive Chrome, mirror every response, dump DOM + CSSOM + fingerprint + 16 frames |
| `repair-media.js` | re-fetch videos that arrived as partial (HTTP 206) responses |
| `localize.js` | rewrite every absolute URL in HTML/CSS/JS to a local path |
| `fetch-missing.js` | pull assets referenced in markup but never requested by the browser |
| `rename.js` | rebrand NESH → JOHAR via a DOM parser, including the SVG logo letterforms |
| `verify.js` | boot offline with all external hosts blocked, diff against originals |
| `shot.js` | quick 3-frame visual check, no diffing |
| `serve.js` | static server with HTTP Range support (videos need it) |
| `analyze-photo.js` | measure a cut-out subject's position and scale within its canvas |
| `build-photo.js` | build a replacement hero portrait matched to the layout (**written, not yet run**) |

## Three things that will bite anyone repeating this

1. **Build from the pristine `index.html`, never `rendered.html`.** The latter is a
   post-JS snapshot — SplitText has already wrapped every character and GSAP has baked
   inline transforms in. Re-running the scripts against it double-applies everything.

2. **Strip `integrity` and `crossorigin`.** Rewriting `url()` inside a stylesheet
   changes its bytes and invalidates its SRI digest. The browser then silently refuses
   the entire stylesheet — a 94% pixel failure from one attribute.

3. **URL prefixes differ by file type.** CSS `url()` resolves relative to the
   stylesheet (`../../`). JS strings become `img.src` at runtime and resolve against
   the document (`''`). Using one prefix for both silently breaks every image.

## Status

Working and verified: 0.44% mean pixel difference, zero external requests, zero console
errors, zero local 404s.

### Left undone

1. **`build-photo.js` was written but never executed.** The hero portrait is still the
   original owner's. The script is ready and the measurements are done — it combines the
   JPG's resolution with the PNG's existing cut-out mask, scales to match the original's
   subject height, and aligns head-top and head-centre to the layout. Sources:
   `E:\CV & pics\Johar DP.png` / `.jpg`.
2. **Other identity content untouched** — testimonial headshots, names and quotes (real
   named people), the JSON-LD `Review` markup, the OpenGraph card, and client
   case-study imagery and video.
3. **Fonts are not licensed for redistribution.** PP Neue Montreal is commercial
   (Pangram Pangram).

### Deliberately not archived here

- `out/frames/` (15 MB) — 16 reference screenshots; regenerate with `capture.js`
- `out/assets/` (38 MB of video + images) — lives in `capture/out/`
- `node_modules/` — `npm install` restores it

This folder documents and preserves the *source and reasoning*, not the media.
Rebuilding the media needs network access and `capture.js`.
