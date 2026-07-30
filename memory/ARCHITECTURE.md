# How This Website Is Built

A teardown of heynesh.com — not how it was copied, but how it actually works.
Everything here was read out of the captured source.

> Corrects an earlier note that listed "7 modules". That came from grepping only
> top-level `const X = {` declarations. The engine actually has **21 sections**.

---

## 1. Platform and page shape

**Webflow**, published 2026-07-20. Plain semantic HTML, one compiled stylesheet, no
React, no CSS-in-JS, no bundler. All custom behaviour is layered on top by a single
external script.

Seven anchor sections, one page, no routing:

```
#hero  →  #about  →  #projects  →  #overview  →  #services  →  #testimonial  →  #faq
```

The page is a **single scroll narrative**. The hero doesn't scroll away — it transforms
into the navigation. That transformation is the centrepiece of the whole design, and
section 4.3 explains how it's done.

---

## 2. Styling layer

### Compiled Webflow stylesheet — 914 rules, 95 KB

Four breakpoints, desktop-first with one min-width exception:

```css
@media (min-width: 768px)              /* desktop-only enhancements */
@media screen and (max-width: 991px)   /* tablet  */
@media screen and (max-width: 767px)   /* mobile landscape */
@media screen and (max-width: 479px)   /* mobile portrait  */
```

### CSS custom properties

```
--yellow   #ffff23      the single accent, used everywhere
--black    --white
--tra                   transparent
--large  --vertical     layout tokens

--card-hover--scale
--card-hover--card-padding-top-bottom
--card-hover--card-padding-left-right
--card-hover--card-icon-size
--card-hover--card-text
```

That `--card-hover--*` group is notable: the work-card hover expansion is parameterised
in CSS, so the JS animates *variables* rather than hardcoded pixel values.

### Fluid sizing

Dimensions are expressed in `vw`, not `px` — `padding-left: 0.8vw`, `border-radius:
0.56vw`, `width: 2.5vw`. The layout scales continuously with viewport width instead of
snapping at breakpoints. Combined with the sidebar auto-scale (section 4.2), the desktop
design is resolution-independent.

### Inline `<style>` embed

A second stylesheet lives directly in the page with its own table of contents
(10 numbered sections). It carries the things Webflow's visual editor can't express:

- Lenis structural requirements (`html.lenis { height: auto }`)
- **Initial hidden states** for every element the preloader animates in
  (`opacity: 0; visibility: hidden`)
- A `.wf-design-mode` override that re-reveals them, so the site is still editable
  inside Webflow
- Gradient text via `background-clip: text` + `-webkit-text-fill-color: transparent`
- The `@keyframes marquee-move` infinite logo ticker
- Safari-specific `translate3d` / `backface-visibility` fixes for blur and filter
  animations

That hidden-state block matters: **the entrance animation is CSS-hidden by default and
only revealed by JS.** If the script fails, the hero stays blank.

---

## 3. Runtime dependencies

| library | version | role |
|---|---|---|
| GSAP | 3.15.0 | all custom animation |
| ├ ScrollTrigger | | scroll-bound timelines |
| ├ ScrollSmoother | | transform-based virtual scroll |
| ├ Flip | | layout transitions |
| ├ SplitText | | line/word/char splitting |
| ├ ScrollToPlugin | | anchor navigation |
| ├ MotionPathPlugin | | path-following motion |
| ├ DrawSVGPlugin | | SVG stroke reveals |
| Lenis | 1.1.18 | smooth scroll |
| Swiper | 11 | testimonial carousel |
| jQuery | 3.5.1 | Webflow dependency only |
| Webflow IX2 | — | native interactions (FAQ accordion, etc.) |

---

## 4. The animation engine

`script.js` — 3,307 lines, unminified, commented, versioned `v2.5` with a changelog.
Wrapped in an IIFE, exposed as `window.AnimationEngine`.

### 4.0 Layer diagram

```
        user wheel / touch
                │
             Lenis                      (virtual scroll position)
                │  .on('scroll')
        ScrollTrigger.update
                │
   ┌────────────┴────────────┐
   │                         │
GhostEngine              StyleEngine     (+ 15 feature modules)
(imperative FLIP)     (declarative attrs)
   │                         │
   └────────────┬────────────┘
              GSAP
                │
        gsap.ticker.add ──→ lenis.raf(t)   (single rAF loop for both)
```

The critical wiring is that **GSAP's ticker drives Lenis**, not the other way around,
and `lagSmoothing(0)` is off. One clock, no drift:

```js
STATE.lenis = new Lenis({ ...CONFIG.lenis, lerp: 0.1 });
STATE.lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => STATE.lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

### 4.1 Configuration

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
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),  // exponential out
    smoothWheel: true
  }
};
```

`duration: 0.4` is deliberately low — snappy, not floaty. `ctaSpeed: 0.728` is the kind
of hand-tuned constant no visual inspection recovers.

Mutable runtime state is isolated in `STATE`: `sidebarScale`, `lenis`, `magneticPairs`,
`splitInstances`, `eventListeners`, `initialized`.

### 4.2 Sidebar auto-scale — the resolution-independence trick

```js
STATE.sidebarScale = Math.min(1, (window.innerHeight - 40) / sidebar.scrollHeight);
gsap.set(sidebar, { scale: STATE.sidebarScale, transformOrigin: 'top left' });
```

The entire left navigation is scaled down as a unit until it fits the viewport height.
Then selected children get the **inverse** scale re-applied:

```js
const inverse = 1 / STATE.sidebarScale;
gsap.set(profileImg,  { scale: inverse, transformOrigin: 'top left' });
gsap.set(navBtnText,  { scale: inverse, transformOrigin: 'center center' });
```

So the nav shrinks to fit, but the profile image and button labels stay at true size.
`STATE.sidebarScale` then has to be divided out of every measurement elsewhere in the
engine — see the `xDiff / STATE.sidebarScale` in 4.3.

### 4.3 GhostEngine — the hero-to-navigation transformation

This is the signature effect. As you scroll the hero, the giant logo, the stat cards,
and the nav links all **fly into their compact positions in the sidebar**.

It's a hand-rolled FLIP. The hero contains invisible "ghost" elements marking
destination geometry (`.nesh-logo-ghost`, etc.). The engine pairs each real element
with its ghost.

**Two-phase, and this is the important part:**

```js
// Phase 1 — read everything from a clean DOM, mutate nothing
measurePair(real, ghost, type) {
  const rRect = real.getBoundingClientRect();
  const gRect = ghost.getBoundingClientRect();
  ...
}

// Phase 2 — write only, no further rect reads
applyAnimation(m) {
  let xDiff = Math.round((gRect.left - rRect.left) / STATE.sidebarScale);
  let yDiff = Math.round((gRect.top  - rRect.top ) / STATE.sidebarScale);
  ...
}
```

All measurement happens before any mutation. This avoids layout thrashing — the classic
read/write/read/write stall that makes FLIP animations janky.

Three pairing types, each measuring different properties:

| type | additionally measures |
|---|---|
| `logo` | parent rect, computed width/height, `offsetHeight` |
| `text_font` | ghost `fontSize` (animates type size, not scale — stays crisp) |
| `background` | border radius and border width on both sides |

Animating `font-size` rather than `scale` for text is a deliberate quality choice:
scaled text goes soft, interpolated font-size stays sharp.

Per-element scroll bounds come from the markup:

```html
data-flip-trigger=".hero"  data-flip-start="top top"  data-flip-end="44% top"
```

Each nav item uses a slightly different `start`, which is what produces the staggered
cascade as the sidebar assembles.

`rebuild()` destroys, re-runs `Sidebar.scale()` inside a `requestAnimationFrame`, then
re-measures and calls `ScrollTrigger.refresh()` — the correct order on resize.

### 4.4 StyleEngine — animation declared in HTML

Rather than hardcoding selectors, most scroll animation is declared on the elements
themselves. The engine scans `[data-tl-type], [data-number-count]` and builds timelines.

**Vocabulary:**

| attribute | meaning |
|---|---|
| `data-tl-type` | `scroll` = scrubbed, `trigger` = fires once |
| `data-tl-trigger` | selector the timeline binds to (default `.hero`) |
| `data-tl-start` / `-end` | ScrollTrigger bounds, e.g. `"35% top"` |
| `data-tl-from` / `-to` | GSAP vars as single-quoted JSON |
| `data-tl-split` | `lines` / `words` / `chars` — run SplitText first |
| `data-tl-target` | animate descendants matching this selector |
| `data-tl-desktop` | skip entirely below 768px |
| `data-tl-once` | play once, never reverse |
| `data-number-count` | build an odometer counter |

Single quotes are used in markup and swapped to double before `JSON.parse`, so the
attribute stays readable in the Webflow editor:

```html
data-tl-from="{'scale': 0.5, 'opacity': 0}"
data-tl-to="{'scale': 1, 'opacity': 1}"
```

**Line-mask reveals.** When `data-tl-split="lines"`, each produced `.line` is wrapped in
an `overflow: hidden` `.line-mask` div and pushed to `yPercent: 100`, so text slides up
from behind a clipping edge rather than just fading.

**Odometer counters.** `data-number-count` rebuilds the element as a slot machine —
each digit becomes a `.digit-mask` containing a `.digit-track` of spans 0–9:

```js
gsap.set(track, { y: h * 9 });                        // start showing 9
tl.to(track, { y: -digit * h,                         // roll to the target digit
               duration: 1.2, ease: 'power3.out' },
      i * 0.06);                                      // stagger per digit
```

Non-numeric characters (the `+` in "80+") are passed through as static masks.

### 4.5 Preloader

Desktop only (`if (window.innerWidth < 768) return`).

1. Measure the logo wrapper, compute the delta to viewport centre
2. Park the logo off-screen right, at centre height: `gsap.set(logo, { x: window.innerWidth, y: yToCenter })`
3. Set all five letter paths to `yPercent: 110` (below their masks)
4. Stagger the letters up into place
5. **Flip** the whole preloader logo into `.nav-logo-item`
6. Cascade in profile image, nav links, separators, stat cards, hero text, buttons

`.nav-logo-item` is explicitly hidden via `display: none` *inside the timeline* rather
than at init — because GhostEngine must be able to measure its children first. A
commented-out ordering hazard, left in the source as a warning.

Scroll is frozen for the duration: `lenis.stop()`, restarted after 3000 ms.

### 4.6 Everything else

| section | line | what it does |
|---|---|---|
| Utils | 63 | `$`/`$$`, unit parsing, `toPx`, debounce, split-tracking |
| MobileMenu | 160 | full-screen mobile nav |
| HorizontalScroll | 754 | pinned horizontal work track |
| ThemeSwitcher | 926 | light↔dark section inversion via ScrollTriggers |
| MagneticPositions | 1310 | cursor-attracted elements; absolute transforms to stop drift |
| CardInteractions | 1589 | work-card hover/expand, driven by `--card-hover--*` vars |
| ProfileImage | 2020 | scroll-linked blur + fade on the hero portrait |
| CTAAnimation | 2086 | call-to-action reveal at `ctaSpeed` |
| SwiperInit | 2276 | testimonial carousel + **custom drag indicator** (v2.5 feature) |
| LenisInit | 2730 | smooth scroll wiring |
| TextReveal | 2761 | splits `.what_you_get-text` while preserving inline elements |
| ImageTrail | 2838 | footer logo trails images behind the cursor |
| ButtonHover | 2996 | duplicate-label mask swap (`.clone-p` slides in as original slides out) |
| Clipboard | 3112 | copy-email-to-clipboard |
| ResizeHandler | 3178 | debounced 150 ms rebuild of all of the above |

### 4.7 Boot sequence

```js
window.addEventListener('load', () => {
  window.scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => {   // double rAF
    window.scrollTo(0, 0);
    Preloader.init();
    initAll();
  }));
});
```

The **double `requestAnimationFrame`** is commented in-source: Safari needs two frames
to finish layout and paint with freshly downloaded resources before positions are safe
to measure. Measuring one frame earlier gives wrong ghost geometry.

`initAll()` order matters — `Sidebar` first (everything else divides by its scale), then
`GhostEngine`, then `StyleEngine`, then features, then `ScrollTrigger.refresh()` last.
`MagneticPositions` is deliberately deferred 300 ms so it runs *after* TextReveal has
finished mutating the DOM (a fix logged in the v2.4 changelog).

`history.scrollRestoration = 'manual'` plus a `pageshow` handler covers Safari bfcache
restores.

---

## 5. Patterns worth stealing

1. **Measure-all-then-write-all.** GhostEngine's two-phase split is the single biggest
   performance decision in the file.
2. **Animation as markup.** `data-tl-*` keeps timing next to the element, editable
   inside Webflow without touching JS.
3. **Animate `font-size`, not `scale`, for text.** Scaled text blurs.
4. **Scale a container, inverse-scale its exceptions.** Resolution independence in
   ~12 lines.
5. **CSS variables as animation targets.** Hover geometry stays declarative.
6. **One ticker.** GSAP drives Lenis; never run two rAF loops.
7. **`init()`/`destroy()` on every module.** The whole engine is teardown-safe, which is
   why resize rebuilds cleanly.
8. **Hide entrance states in CSS, reveal in JS** — with a `.wf-design-mode` escape hatch
   so the page is still authorable.

## 6. Weak points

- **No `prefers-reduced-motion` anywhere.** Every animation runs regardless.
- **JS failure = blank hero.** Entrance elements are `opacity: 0; visibility: hidden` in
  CSS with no `<noscript>` fallback.
- **Desktop-only gating is `innerWidth < 768` checked at init**, so crossing the
  breakpoint needs the resize rebuild to catch it.
- **A typo is load-bearing**: the marquee class is `.nav-comapny-item`, misspelled
  consistently in both CSS and JS. Fixing it in one place breaks the ticker.
