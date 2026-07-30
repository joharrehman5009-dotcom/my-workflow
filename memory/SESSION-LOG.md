# Session Log — Website Replica Project

**Date:** 2026-07-27
**Working directory:** `d:\Website dev`
**Target:** https://heynesh.com/
**Goal:** determine whether an AI can build an exact replica of a website — same
animations, same everything, different text. Then prove it by running one locally.

---

## Outcome

Yes. A fully offline, pixel-accurate local replica, rebranded to JOHAR.

| measurement | value |
|---|---|
| Mean pixel difference (pre-rename, like-for-like) | **0.44%** |
| Mean pixel difference (post-rename) | 2.91% |
| External network requests when running offline | **0** |
| Local 404s | **0** |
| Console errors | **0** |
| Assets referenced but not captured | **0** |

Runs at `http://localhost:8080` via `node serve.js`.

---

## The central lesson

**An AI given only a URL cannot reproduce a site.** It receives the page as plain text;
styling, animation, and assets are stripped before the model sees anything. Even raw
HTML on a modern site is an empty shell plus script tags.

The AI must **drive a browser**, not read a URL. Once it does, "copy the design" stops
being generation and becomes file capture — which is why exactness becomes achievable.

The decisive factor in this particular success was **not** AI capability. It was that
the target ships unminified, commented source with named modules and exact tuning
constants. Against a minified bundle with hashed class names, the same effort lands
nowhere near 0.44%.

---

## Chronological account

### 1. Environment
Node v24.18.0, npm 11.16.0, empty working directory. Installed Playwright.
Playwright's bundled Chromium download stalled past 600s — switched to the system
Chrome via `channel: 'chrome'`. Chrome found at
`C:\Program Files\Google\Chrome\Application\chrome.exe`.

### 2. Capture
`capture.js` drove Chrome to the target, mirrored every network response to disk,
scrolled the page in 900px steps capturing 16 reference frames, and dumped the
post-JS DOM, the flattened CSSOM, and a library/animation fingerprint.

**Result:** 95 files. Identified as a **Webflow** site — the best case for replication
(plain HTML, one compiled stylesheet, no React, no hashed CSS-in-JS).

**Jackpot:** the custom animation engine at `f1-assets.b-cdn.net/script.js` is
**3,307 lines, unminified and commented**, with a changelog and seven named modules.

### 3. Seven bugs, in order

1. **Full-page screenshot hung forever.** `animations: 'disabled'` only freezes CSS
   animations; GSAP keeps driving transforms. Deeper cause: ScrollSmoother's
   transform-based virtual scroll means expanding the viewport makes ScrollTrigger
   recalculate endlessly. → Removed it. Per-scroll-offset frames are the only workable
   baseline for a scroll-driven site.

2. **Nine videos silently arrived as 0 bytes.** `<video>` fetches via HTTP Range;
   the capture wrote byte-ranges over each other. Nothing errored. → `repair-media.js`
   re-fetches with plain GETs. 18 containers validated by magic bytes, 38.3 MB.

3. **Regex ate filenames containing parentheses.** `Client - 1910 (Background).avif`
   was truncated at the `(`. Files were on disk the whole time. → Context-specific
   patterns for HTML vs CSS. 19 "missing" → 9.

4. **94% pixel difference on first offline boot.** All libraries loaded, zero 404s.
   Cause: **Subresource Integrity** — rewriting `url()` inside the stylesheet changed
   its bytes, invalidating the `sha384` digest, so Chrome refused the whole file.
   → Strip `integrity`/`crossorigin`. **94.08% → 0.44%.**

5. **JS held hardcoded CDN URLs.** Only HTML and CSS were being rewritten. Fix needed
   prefix `''`, not `../../` — JS strings become `img.src` at runtime and resolve
   against the *document* base, not the script's location.

6. **A directory base path leaked externally.** A trailing-slash URL the engine
   concatenates filenames onto mapped to a nonexistent `index.html`. → Special-cased.
   `referenced but NOT captured: 0`.

7. **A phantom 404 I reported twice — my bug, not the site's.** Playwright fires
   `requestfailed` with `ERR_ABORTED` when the browser cancels a video range request
   after buffering. Direct check returned `status=200 bytes=1983832`. The file was
   always fine. → Filter `ERR_ABORTED`.

### 4. Rebrand to JOHAR

**The logo is not text.** It is four SVG `<path>` letterforms, and the engine animates
them individually — `gsap.set($$('.nesh-logo-letter'), { yPercent: 110 })` then a
stagger, then a **FLIP** of the preloader logo onto the nav logo.

→ Replaced with five `<text>` glyphs keeping `class="nesh-logo-letter"`, in the site's
own PP Neue Montreal Bold, positioned across the original `viewBox="0 0 1288 338"`.
Verified by catching the preloader mid-flight: J and O landed, H rising, A and R still
off-screen. Stagger intact.

**Used a parser, not regex on markup.** Only text nodes and human-readable attributes
(`alt`, `title`, `aria-label`, `content`) — never `src`/`href`/`srcset`.

**Only capitalised `NESH`/`Nenad` replaced.** Lowercase `nesh`/`nenad` appear in CSS
class names (`.nesh-logo`), GSAP selectors, and asset filenames
(`nenad_edit-photo_final 1.avif`). Blind replacement breaks the engine and 404s images.
Caught `nenad@popadic.co` explicitly; pointed six personal outbound links at `#`.

### 5. Photo replacement (in progress when session paused)

Measured both portraits to match composition:

| | original | user's photo |
|---|---|---|
| canvas | 1670x1916 | 439x568 (png) / 659x852 (jpg) |
| head top | 3.0% down | 6.3% down |
| head width | 34% of canvas | 47% of canvas |
| subject fills | 96.9% of height | 93.5% |

The user's PNG is **already cut out** (38% transparent, clean edges); the JPG is the
same shot at 1.5x resolution. Planned approach: JPG colour + PNG alpha as mask for a
higher-res base than either alone, scaled to match the original's subject height and
aligned on head top and head centre.

**Unresolved trade-off:** the user's crop is tighter, so head-size and fill-the-frame
cannot both match. Filling the frame was chosen — a floating gap above the bottom edge
would look broken, whereas a ~28% larger head just reads as a different photo.

`build-photo.js` was written but **not run** — the user interrupted before execution.

---

## What still carries the original owner's identity

The rebrand covers text, logo, email, and outbound links. It does **not** change:

- **the hero photograph** — a real person's portrait (replacement was in progress)
- **testimonials** — real named people (Danette Beal, Marko Ilic, Bart-Jan Leyts),
  real quotes, real headshots, plus schema.org `Review` markup naming their employers
- **client work** — real companies' logos, imagery, and case-study video
- **OpenGraph card image**
- **PP Neue Montreal** — a commercial Pangram Pangram licence

The user stated they do not want to publish this and do not want to cause anyone a
problem — the goal was purely to see whether it could be done. Running locally is
equivalent to having the site open in a browser tab. Publishing would not be.

---

## Files

```
d:\Website dev\
├── memory\              ← this archive
│   ├── SESSION-LOG.md   full account (this file)
│   ├── PROCESS.md       every bug, root cause, fix
│   ├── FINDINGS.md      target stack, animation modules, constants
│   ├── scripts\         all 11 scripts as written
│   └── data\            fingerprint.json, manifest.json
│
└── capture\             ← the working pipeline
    ├── README.md        quick start + folder layout
    ├── *.js             the pipeline
    └── out\             the running replica (index.html + assets + frames)
```

## Rerun order

```bash
cd "d:\Website dev\capture"
npm install
node capture.js https://heynesh.com/   # once
node repair-media.js                   # once — fixes 206 range-fetched video
node localize.js                       # rewrites urls, rebuilds out/index.html
node fetch-missing.js                  # pulls anything localize flagged
node localize.js                       # re-run so new files get linked
node rename.js                         # rebrand — MUST run after localize
node verify.js                         # measure
node serve.js                          # → http://localhost:8080
```

`localize.js` always rebuilds `out/index.html` from the pristine captured HTML, so
`rename.js` must follow it. Never build from `rendered.html` — that is a post-JS
snapshot with SplitText wrappers and GSAP inline transforms already baked in.
