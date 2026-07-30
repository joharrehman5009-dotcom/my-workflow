# How to Open the Replica on localhost

## The command

```powershell
cd "d:\Website dev\capture"
node serve.js
```

Then open **http://localhost:8080** in any browser.

Leave the terminal open — the server runs in the foreground. `Ctrl+C` stops it.

Expected output:

```
replica running at http://localhost:8080
```

---

## Run it from `capture\`, not from `memory\scripts\`

`serve.js` resolves the site as `<its own folder>/out`. The copy in
`memory\scripts\` is an archive for reference only — running it there fails, because
`memory\scripts\out\` doesn't exist. The live site lives at
`d:\Website dev\capture\out\`.

No `npm install` needed for this step: `serve.js` uses only Node's built-in `http`
and `fs`.

---

## Why not just double-click `index.html`

Opening `file:///d:/Website dev/capture/out/index.html` **will not work properly**:

- Browsers block `file://` cross-origin requests, so the fonts and stylesheets fail
- The `<video>` backgrounds need HTTP **Range** support (status 206) to stream —
  `file://` cannot provide it, so they stall or never start

`serve.js` exists specifically to solve both. It sets correct MIME types (including
`.avif`, `.webm`, `.woff2`) and implements Range responses.

---

## Changing the port

```powershell
$env:PORT = 9000
node serve.js          # → http://localhost:9000
```

Useful if something already holds 8080. To check what's on a port:

```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
```

---

## Confirming it's actually serving

```powershell
Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing |
  Select-Object StatusCode, RawContentLength
```

A healthy response is `200` and roughly `257000` bytes.

---

## Other ports in this project

These start their own temporary servers and shut them down when finished, so they
don't clash with `serve.js`:

| script | port | purpose |
|---|---|---|
| `serve.js` | 8080 | the one you use to browse the site |
| `shot.js` | 8098 | 3-frame screenshot check |
| `verify.js` | 8099 | offline boot + pixel diff |

---

## What you should see

1. A brief **preloader** — the JOHAR logo letters stagger up one at a time
2. The logo flies into the top-left corner, the sidebar assembles, hero content
   cascades in
3. Scrolling: the hero portrait blurs and fades, the sidebar navigation compacts,
   the client logo marquee scrolls continuously
4. The whole page runs with **zero network requests** — it is fully self-contained

If the hero appears blank, JavaScript failed. Entrance elements are
`opacity: 0; visibility: hidden` in CSS and only revealed by the engine, so a script
error leaves the page empty rather than unstyled. Check the browser console.

---

## Running the pipeline again from scratch

```powershell
cd "d:\Website dev\capture"
npm install
node capture.js https://heynesh.com/   # once
node repair-media.js                   # once — fixes range-fetched video
node localize.js                       # rewrites urls, rebuilds out/index.html
node fetch-missing.js                  # pulls anything localize flagged
node localize.js                       # re-run so new files get linked
node rename.js                         # rebrand — MUST run after localize
node verify.js                         # measure
node serve.js                          # browse
```

`localize.js` always rebuilds `out/index.html` from the pristine captured HTML, so
`rename.js` has to run after it or the rebrand is discarded.
