# Development notes

This file is for whoever maintains this repo. If you just want to use the
extension, see [README.md](README.md) instead.

---

## Repo layout

```
extension/            The actual Chrome extension (MV3) — this is what
                       gets zipped/signed and shipped to users
  manifest.json
  popup.html / popup.js toolbar click -> small popup, choose which tool to open
  app.html / app.js     batch download from a sheet of title + image URL
  search.html / search.js  search Google by title, grab the product image
  common.js              shared fetch/zip/CSV helpers used by both tools
  lib/                  xlsx + JSZip, vendored locally (MV3 blocks
                         loading remote <script src>)
  icons/
index.html             download landing page, served via GitHub Pages
                        at apps.ipadhires.co.uk/ImageBatchDownloader/
update.xml              Omaha-format update manifest for the optional
                        silent-autoupdate mechanism (see README)
scripts/
  install-autoupdate.ps1 / uninstall-autoupdate.ps1
                        manage the ExtensionInstallForcelist registry
                        entry — additive/reversible, see inline comments
  build-crx.ps1         local manual build (see Releasing, below)
.github/workflows/release.yml
                        automatic build+release on a version tag push
signing-key.pem        NEVER COMMITTED (see .gitignore) — the private
                        key used to sign releases so the extension ID
                        stays stable. Anyone with this file can publish
                        an update that existing installs will accept.
                        Keep it in a password manager / secure offline
                        backup. If it's ever lost, future releases will
                        get a new extension ID and nobody's existing
                        install will auto-update to it.
```

---

## Why this is an extension and not a web page

The original version ran as a plain web page and had to fetch images
through a chain of public CORS-unlocking proxies, because a browser
blocks a page's own JavaScript from reading a cross-origin response
unless the target server opts in. Some hosts (certain retailers, mainly)
block every public proxy outright, so those downloads always failed no
matter how many fallback proxies got added. A Chrome extension with
`host_permissions` fetches cross-origin with full CORS bypass in its own
page context — the entire proxy chain is gone, not routed around better.

## Tech stack

- Manifest V3 Chrome extension, vanilla HTML/CSS/JS — no build step for
  day-to-day development
- [SheetJS / xlsx](https://sheetjs.com/) and [JSZip](https://stuk.github.io/jszip/), vendored locally in `extension/lib/`
- `chrome.downloads` API for saving files; `host_permissions` for
  CORS-free `fetch()`

## Developing

Load `extension/` unpacked (`chrome://extensions` → Developer mode →
Load unpacked) pointed directly at that folder in your working copy —
edits take effect after clicking the reload icon on the extension's card.

---

## Releasing a new version

### Automatic (recommended)

Pushing a version tag builds, signs, zips, publishes the GitHub Release
with both files under their fixed names, and bumps `update.xml` on `main`
— all in one Actions run:

```bash
# bump "version" in extension/manifest.json first, commit that, then:
git tag v1.2.0
git push origin v1.2.0
```

One-time setup: add a repository secret named `SIGNING_KEY` (Settings →
Secrets and variables → Actions → New repository secret) containing the
**full contents** of your local `signing-key.pem`, BEGIN/END lines
included. GitHub encrypts it at rest and never prints it in logs, but
treat it like a password regardless — anyone with it can publish a
malicious update.

Only tags matching `v*.*.*` trigger a release — ordinary pushes to `main`
never do.

### Manual fallback — `scripts/build-crx.ps1`

No GitHub secret needed; reads your local `signing-key.pem` directly.

1. Bump `"version"` in `extension/manifest.json`.
2. Run `./scripts/build-crx.ps1` (requires Chrome installed locally).
3. This produces `release/ImageBatchDownloader.crx` and `release/ImageBatchDownloader.zip`.
4. Create a GitHub Release (tag matching the version) and attach **both**
   files under those exact filenames — the download page, README, and
   `update.xml` all link to the "latest release" alias URL for those fixed
   names, so nothing else needs to change per release.
5. Update the `version` attribute in `update.xml` (its `codebase` URL
   never needs to change) and commit to `main` — this is what tells
   already-installed copies (via the optional auto-update mechanism)
   that a new version exists.
