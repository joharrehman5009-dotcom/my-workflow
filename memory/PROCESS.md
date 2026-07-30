# Build Log

Every step, every bug, and the root cause of each. Written down because the debugging
*is* the method — none of these failures are visible from a screenshot, and none of
them would be guessed by a model asked to "recreate this site".

---

## Step 0 — Why not just read the URL

An AI given a URL receives the page as plain text. Styling, animation, and assets are
stripped before the model sees anything. Even fetching raw HTML returns a shell:

```html
<div id="__next"></div>
<script src="/_next/static/chunks/main-a3f9d2.js"></script>
```

The design lives in linked stylesheets and JS bundles that a single fetch never follows.
Anything produced from that is a guess. To get *exact*, the AI has to **drive a browser**,
not read a URL.

---

## Step 1 — Capture

`capture.js` launches Chrome via Playwright, listens on `response`, and mirrors every
body to disk under `out/assets/<host>/<path>`. It then scrolls the full page in 900px
steps, screenshotting each position, and finally dumps:

- `rendered.html` — post-JS DOM
- `all-styles.css` + `cssom.json` — every rule walked out of `document.styleSheets`
  (this catches injected / CSS-in-JS rules that exist in no `.css` file)
- `fingerprint.json` — which animation libraries are live, which fonts loaded, and
  `document.getAnimations()` with real durations and easings

Used the system Chrome (`channel: 'chrome'`) because Playwright's bundled Chromium
download stalled indefinitely.

### Bug 1 — Full-page screenshot hangs forever

`page.screenshot({ fullPage: true })` timed out at 30s, then at 120s even with
`animations: 'disabled'`. The log told the story:

```
- taking page screenshot
- disabled all CSS animations
- waiting for fonts to load...
- fonts loaded
                          ← hangs here
```

`animations: 'disabled'` only freezes **CSS** animations. GSAP drives transforms in JS
on every frame regardless. But the deeper cause is structural: **ScrollSmoother uses a
transform-based virtual scroll container**. `fullPage: true` expands the viewport to the
full document height, ScrollTrigger recalculates every pinned section against the new
height, and the layout never settles.

**Fix:** removed the full-page screenshot entirely. It is the wrong tool for a
scroll-driven site. The 16 per-scroll-position frames are the correct reference set —
and frame-by-frame at fixed offsets is the *only* diffing approach that works here.

### Bug 2 — Nine videos silently arrived as zero bytes

`manifest.json` showed 20 responses with status **206 Partial Content**. `<video>`
elements fetch via HTTP Range, and the capture wrote each byte-range to the same path,
overwriting rather than assembling. Result: 9 of 18 videos were 0 bytes on disk and one
mp4 was truncated at 1.67 MB. Nothing errored.

**Fix:** `repair-media.js` re-fetches every 206 URL with a plain full GET. Verified all
18 containers by magic bytes (`1a45dfa3` for WebM, `ftyp` for MP4) — 38.3 MB total.

---

## Step 2 — Localize

`localize.js` rewrites every absolute asset URL to a local relative path, using the
*same* `diskPath` logic as `capture.js` so the two always agree.

### Bug 3 — Regex ate filenames containing parentheses

First pass reported 19 assets "not captured", including truncated entries like
`.../Client%20-%201910%20`. The real filename is `Client - 1910 (Background).avif` —
the URL pattern excluded `(` and `)`, so it cut the match short. Those files were on
disk the whole time.

**Fix:** split the pattern by context. HTML URLs allow parentheses (only quotes,
whitespace, and angle brackets terminate). CSS is handled separately, since a bare
`url(...)` genuinely cannot contain an unescaped paren while a quoted one can.
19 missing → 9.

### Bug 4 — The page rendered with no CSS at all (94% pixel difference)

First offline boot scored **94.08%** differing pixels. All five libraries loaded and
there were zero local 404s, which ruled out missing files. The console had it:

```
Failed to find a valid digest in the 'integrity' attribute for resource ...
```

**Subresource Integrity.** The stylesheet ships with `integrity="sha384-vqn2Fwk…"`.
Rewriting `url()` references *inside* that file changed its bytes, so the digest no
longer matched and Chrome refused to apply the entire stylesheet.

**Fix:** strip `integrity` and `crossorigin` attributes during localization.
**94.08% → 0.44%.**

### Bug 5 — JavaScript held hardcoded CDN URLs

`verify.js` reported `f1-assets.b-cdn.net` and `cdn.prod.website-files.com` still being
requested externally. `localize.js` was only rewriting HTML and CSS. The custom engine
hardcodes absolute URLs for the work-card imagery around line 2842.

**Fix:** extended the walk to `.js` files — **with a different prefix**. CSS `url()`
resolves relative to the stylesheet, so it needs `../../`. JS strings become `img.src`
at runtime and resolve against the **document** base, so they need `''`. Using the CSS
prefix here would have silently broken every image the engine loads.

### Bug 6 — A directory base path leaked externally

One reference survived: `https://f1-assets.b-cdn.net/nesh-work/Portfolio Work/` — a base
path the engine concatenates filenames onto. `diskPath` maps trailing-slash URLs to
`.../index.html`, which doesn't exist, so it was skipped and left absolute.

**Fix:** special-case directory URLs to map to the local directory itself.
`referenced but NOT captured: 0`.

### Bug 7 (mine, not the site's) — Phantom 404 reported twice

`verify.js` flagged `Client - 1910 (Background).mp4` as a local 404 across several runs.
Direct check:

```
curl → status=200 bytes=1983832     # exactly the on-disk size
```

The file was always fine. Playwright fires `requestfailed` with `ERR_ABORTED` when the
browser cancels a video range request after buffering enough — normal behaviour that my
instrumentation was mislabelling as a missing asset.

**Fix:** filter `ERR_ABORTED` and surface the actual `errorText` alongside the URL.

---

## Step 3 — Rebrand to JOHAR

### The logo is not text

It is four SVG `<path>` elements — vector letterforms spelling N, E, S, H. And the
engine treats them as animatable objects:

```js
const letters = Utils.$$('.nesh-logo-letter');   // Preloader, line 1106
gsap.set(letters, { yPercent: 110 });            // line 1157
```

They stagger in from below, then GhostEngine **FLIPs** the preloader logo onto the nav
logo. So a rename has to preserve *animatable per-letter elements*, not just swap a
string.

**Approach:** replace the paths with five `<text>` glyphs, each keeping
`class="nesh-logo-letter"`, set in the site's own PP Neue Montreal Bold and positioned
across the original `viewBox="0 0 1288 338"`. Both the preloader SVG and the nav SVG get
the same treatment so FLIP still matches.

Confirmed working: `out/shots/preloader.png` catches the animation mid-flight — J and O
landed, H still rising, A and R not yet on screen.

### Parser, not regex

`rename.js` uses cheerio and only touches:

- text nodes (skipping `<style>`, and `<script>` except the JSON-LD block)
- human-readable attributes: `alt`, `title`, `aria-label`, `content`
- never `src`, `href`, or `srcset`

**And only capitalised `NESH` / `Nenad` are replaced.** Lowercase `nesh` / `nenad` appear
in CSS class names, GSAP selectors, and asset filenames. A blind replace breaks the
animation engine and 404s the hero image.

Also caught explicitly: `nenad@popadic.co` (lowercase, so the safety rule skipped it —
but it is a real personal address). Six outbound personal links (x.com, linkedin,
cal.com) pointed at `#`.

---

## Results

| measurement | value |
|---|---|
| Mean pixel difference, pre-rename | **0.44%** |
| Mean pixel difference, post-rename | 2.91% |
| External requests during offline boot | **0** |
| Local 404s | **0** |
| Console errors | **0** |
| Assets referenced but not captured | **0** |

The post-rename figure is higher by design — the logo and name genuinely differ now.
Video frames also never land on the same playback position twice, which contributes a
percent or so of irreducible noise. **0.44% is the like-for-like number.**

---

## Why this worked, and when it wouldn't

The decisive factor was not AI capability. It was that the target ships
**unminified, commented source** — 3,307 readable lines with a changelog and named
modules, including exact tuning constants:

```js
ctaSpeed: 0.728,
lenis: { duration: 0.4, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) }
```

Nobody derives `0.728` by eye. Against a minified bundle with hashed class names, the
same effort lands nowhere near 0.44%.

---

## What this copy still contains

The rebrand covers text, logo, email, and outbound links. It does **not** change:

- **the hero photograph** — a real person's portrait
- **testimonials** — real named people, real quotes, real headshots, plus schema.org
  `Review` markup naming them and their employers
- **client work** — real companies' logos, imagery, and case-study video
- **PP Neue Montreal** — a commercial Pangram Pangram licence; the `.woff2` files are
  here but re-serving them is not covered

Running locally is equivalent to having the site open in a browser tab. Publishing it
is not — a pixel-exact clone of a working freelancer's portfolio causes real harm
regardless of whose name is on it.
