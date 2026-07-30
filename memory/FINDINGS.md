# Target Analysis

What the captured site is actually built from. Everything here was read out of the
capture, not inferred.

---

## Platform

**Webflow** (`<meta name="generator" content="Webflow">`), last published 2026-07-20.

This is the best possible case for replication: plain HTML, one compiled stylesheet, no
React, no hashed CSS-in-JS, no build step to reverse.

---

## Runtime stack

| library | version | role |
|---|---|---|
| GSAP | 3.15.0 | all custom animation |
| ├ ScrollTrigger | 3.15.0 | scroll-driven timelines |
| ├ ScrollSmoother | 3.15.0 | transform-based virtual scroll |
| ├ Flip | 3.15.0 | preloader logo → nav logo transition |
| ├ SplitText | 3.15.0 | per-line / per-character text reveals |
| ├ ScrollToPlugin | 3.15.0 | anchor navigation |
| ├ MotionPathPlugin | 3.15.0 | path-following motion |
| ├ DrawSVGPlugin | 3.15.0 | SVG stroke reveals |
| Lenis | 1.1.18 | smooth scroll |
| Swiper | 11 | testimonial carousel |
| jQuery | 3.5.1 | Webflow dependency |
| Webflow IX2 | — | native Webflow interactions |

GSAP's paid plugins are all present. Since GSAP 3.13 these are free under the Webflow
acquisition, so this part carries no licensing problem.

---

## The custom engine

`out/assets/f1-assets.b-cdn.net/script.js` — **3,307 lines, unminified, commented**,
with a version header (`OPTIMIZED ANIMATION ENGINE v2.5`) and a changelog.

### Sections — all 21

An earlier draft of this file listed only 7. That count came from grepping top-level
`const X = {` declarations and missed most of the file. Full teardown of how these work
is in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

| line | section |
|---|---|
| 36 | CONFIGURATION & STATE |
| 63 | UTILITY FUNCTIONS |
| 126 | SIDEBAR AUTO-SCALE |
| 160 | MOBILE MENU TOGGLE |
| 271 | **GHOST ANIMATION ENGINE** — hand-rolled FLIP, hero → sidebar |
| 587 | **ATTRIBUTE STYLE ENGINE** — `data-tl-*` declarative animation |
| 754 | HORIZONTAL SCROLL |
| 926 | THEME SWITCHER |
| 1093 | PRELOADER ANIMATION |
| 1310 | MAGNETIC POSITIONING |
| 1589 | CARD INTERACTIONS |
| 2020 | PROFILE IMAGE HANDLER |
| 2086 | CTA ANIMATION |
| 2276 | SWIPER INIT + CUSTOM DRAG INDICATOR |
| 2730 | LENIS SMOOTH SCROLL |
| 2761 | TEXT REVEAL ANIMATION |
| 2838 | IMAGE TRAIL (FOOTER LOGO) |
| 2996 | BUTTON HOVER ANIMATION |
| 3112 | CLIPBOARD FUNCTIONALITY |
| 3178 | RESIZE HANDLER |
| 3206 | MAIN INITIALIZATION |

### Tuning constants — `script.js:38-50`

```js
const CONFIG = {
  sidebarPadding: 40,
  preloaderDelay: 0.2,
  ctaSpeed: 0.728,
  resizeDebounce: 150,
  magneticInitDelay: 300,
  horizontalScrollDelay: 100,
  lenis: {
    duration: 0.4,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  }
};
```

`ctaSpeed: 0.728` is the clearest illustration of why screenshot-based reproduction
fails. No amount of visual inspection recovers that value.

### Architecture notes from the changelog

- SPA-ready `init()` / `destroy()` on every module
- Lenis and ScrollTrigger explicitly synced
- `backdrop-filter` deliberately left to CSS, not GSAP-controlled
- SplitText double-wrap prevention and cleanup
- MagneticPositions uses absolute transforms to prevent drift, and runs *after*
  TextReveal

---

## Animation inventory

### Continuously running at rest

```json
{ "name": "marquee-move", "target": "DIV.nav-comapny-item",
  "duration": 25000, "easing": "linear", "iterations": null }
```

Two instances. Infinite iterations — this is what makes the page never visually stable
and defeats `fullPage` screenshots.

### Declarative scroll animations

The engine reads `data-tl-*` and `data-flip-*` attributes off the markup rather than
hardcoding selectors:

| attribute | meaning |
|---|---|
| `data-tl-type` | `scroll` (scrubbed) or `trigger` (fires once) |
| `data-tl-trigger` | element the timeline is bound to |
| `data-tl-start` / `data-tl-end` | ScrollTrigger start/end, e.g. `"35% top"` |
| `data-tl-from` / `data-tl-to` | GSAP property objects (single-quoted JSON) |
| `data-tl-split` | `lines` — run through SplitText first |
| `data-tl-desktop` | desktop-only |
| `data-flip-trigger` / `-start` / `-end` | Flip transition bounds |
| `data-flip-id` | pairs source and destination elements |

This is why the rebrand had to preserve element structure: the animations are bound to
the DOM by attribute, and the logo letters are individually animated targets.

---

## Typography

| family | weights | file |
|---|---|---|
| PP Neue Montreal | 400 (Book), 500 (Medium), 700 (Bold) | `ppneuemontreal-*.woff2` |
| TR 3 A | 400, 500, 700 | `tr3a-*.woff2` |

**PP Neue Montreal is a commercial Pangram Pangram licence.** The `.woff2` files are in
the capture, but re-serving them on another domain is not covered by the original
licence.

---

## Assets

| type | count | size |
|---|---|---|
| Video (`.webm` / `.mp4`) | 18 | 38.3 MB |
| Images (`.avif` / `.svg` / `.jpeg` / `.png`) | ~60 | ~1 MB |
| Fonts (`.woff2`) | 6 | ~162 KB |
| CSS | 2 | 113 KB |
| JS | 11 | ~600 KB |

Videos come in pairs per project — a small `-bg` loop for the card, and a full-size
version for the expanded state.

### Hosts

| host | serves |
|---|---|
| `cdn.prod.website-files.com` | Webflow CSS, JS, images, fonts |
| `f1-assets.b-cdn.net` | custom engine + project video (Bunny CDN) |
| `cdn.jsdelivr.net` | Swiper |
| `unpkg.com` | Lenis |
| `d3e54v103j8qbb.cloudfront.net` | jQuery, Webflow badge |

---

## Identity content still present in the local copy

Listed so it is not forgotten. See PROCESS.md.

- Hero portrait: `6926f8e053a878c5f61cc622_nenad_edit-photo_final 1.avif` (+ `-p-500` variant)
- OpenGraph card: `6985214bb975f745e43bb088_OpenGraph.jpg`
- Testimonial headshots: `Danette Beal.avif`, `Marko Ilic.avif`, `Marko Ivanvoic.avif`,
  `Chrissy.avif`, `Bart.avif`, `petar_s.jpeg`
- JSON-LD `Review` markup naming three real people, their job titles, and employers
- Client brands: Alosant, SemiconBio, Omicron, Puck, Happy Ring, Lilipad, PSS Ltd,
  GetRay AI, 1910, Curri
