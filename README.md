# Webflow Animation Study (private)

A local, offline copy of a Webflow site captured for study, with the text and hero
portrait replaced with my own. Kept here so I can pull it down on any machine, run it,
and keep editing.

**This repository is private and must stay private.** Notes on why are at the bottom.

---

## Run it

```bash
cd capture
npm install
node serve.js          # → http://localhost:8080
```

Leave that terminal open; the server runs in the foreground. Do not open
`out/index.html` straight off disk: `file://` blocks the fonts and cannot serve the
HTTP Range requests the background videos need.

---

## Layout

```
capture/
  serve.js            static server with Range support (this is the one you run)
  capture.js          drives Chrome, mirrors every response to disk
  repair-media.js     re-fetches video that arrived as partial 206 responses
  localize.js         rewrites absolute URLs to local paths
  fetch-missing.js    pulls assets referenced but never requested
  rename.js           wordmark substitution (SVG letterforms)
  apply-content.js    my copy + logos, applied to out/index.html
  content.json        ALL editable copy lives here
  cutout.js           background removal for the portrait
  build-photo.js      fits the portrait to the hero layout
  verify.js           boots offline with network blocked, diffs vs originals
  backup.js /
  restore.js          snapshot + one-command revert
  out/
    index.html        the built page
    assets/           css, js, fonts, images, video
    _backup/          snapshots — restore any with `node restore.js <label>`

memory/
  ARCHITECTURE.md     how the original site works: the FLIP sidebar engine, the
                      data-tl-* declarative animation system, all 21 modules
  FINDINGS.md         stack, versions, fonts, asset inventory
  PROCESS.md          every bug hit while building this, with root causes
  SESSION-LOG.md      full chronological account
  RUN.md              localhost, ports, troubleshooting
```

---

## Editing

**Copy changes go in `capture/content.json`, never in `out/index.html`.** That file is
generated: `localize.js` rebuilds it from the pristine capture every run, so direct
edits are silently discarded.

After editing content:

```bash
cd capture
node localize.js       # rebuild out/index.html from the capture
node rename.js         # wordmarks
node apply-content.js  # apply content.json
```

Order matters. `rename.js` and `apply-content.js` must both run after `localize.js`.

### Two constraints that will bite

**The sidebar bio must stay at or under 122 characters.** `.nav-top-text` sits inside
`.nav-container`, whose height drives `Sidebar.scale()`, which sizes the button masks.
Longer copy there shrinks the scale until "Book a Call" clips. `apply-content.js` warns
if it is exceeded.

**Year cards are odometers.** The value comes from the `data-number-count` attribute,
not the element text. Writing text alone leaves the counter animating to the old number
and renders things like `'2219`.

---

## Snapshots

```bash
node backup.js my-label      # snapshot before changing anything
node restore.js base         # revert to the pre-content state
```

Existing labels: `base`, `pre-content`, `johar-content`, `text-only-fix`, `v2-fixed`,
`v3-btnfix`.

---

## Why this stays private

The design belongs to a working freelancer who sells builds for a living, and it is
reproduced here closely enough that publishing it would compete against him using his
own work. Beyond that, the copy still contains:

- **Third-party photographs.** Several avatar circles are strangers' faces.
- **PP Neue Montreal**, a commercial Pangram Pangram licence. The `.woff2` files are
  here but re-serving them from a public domain is not covered.
- **Other companies' case-study media.** ~38 MB of client video and brand imagery
  belonging to Alosant, SemiconBio, Happy Ring, Lilipad, Omicron, Puck, GetRay AI
  and 1910.

Running it locally is equivalent to having the site open in a browser tab. Serving it
publicly is not. The techniques documented in `memory/ARCHITECTURE.md` are the portable
part — those are patterns, and reusable in original work.
