# 🖼️ Image Batch Downloader

A Chrome extension for downloading images in bulk from a spreadsheet of
titles and URLs — straight to a ZIP, no CORS proxy involved.

**Get it:** [apps.ipadhires.co.uk/ImageBatchDownloader](https://apps.ipadhires.co.uk/ImageBatchDownloader/) · or jump straight to the [latest release ZIP](https://github.com/techvalleyapps/ImageBatchDownloader/releases/latest/download/ImageBatchDownloader.zip)

Not on the Chrome Web Store — installed and updated straight from this repo.

---

## Features

- Upload an **.xlsx**, **.xls**, or **.csv** file — any header names work, you pick which columns are the title and which are the image URL
- Auto-detects likely title/URL columns as a starting point, with dropdowns to override
- Rows grouped into filterable domain chips, plus a text search, so you can review before downloading
- Choose how many images go in each ZIP ("Items per ZIP", default 100) — large selections split across multiple ZIPs automatically
- **Fetches bypass CORS entirely** — as an extension with host permissions, there's no unlocking proxy in the loop, so no host can block the download by blocking a proxy (this was the whole reason this stopped being a plain web page)
- Links that still can't be fetched (dead links, or a store page instead of a direct image) land in a `_manual-download-needed.html`/`.csv` inside the ZIP — the HTML one has clickable links and an "open all in new tabs" button

---

## Install (manual — primary, always works)

1. Download the latest release ZIP: [`ImageBatchDownloader.zip`](https://github.com/techvalleyapps/ImageBatchDownloader/releases/latest/download/ImageBatchDownloader.zip) (that link always points at whatever is currently latest), and unzip it anywhere.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.
5. Click the toolbar icon to open the tool in a new tab.

This install method doesn't auto-update — re-download and re-load the folder (or click the reload icon on the extension card in `chrome://extensions`) to get a new version.

---

## Optional: silent auto-update

If you want Chrome to install this extension silently and keep it updated
forever with no manual steps, there's a script for that — **but read the
trade-offs first**, because there's no way around them with this mechanism:

- Chrome will show a permanent **"Managed by your organization"** banner. This happens for *any* Chrome policy key, even one you set yourself on your own machine — it's not specific to this extension.
- The extension becomes **force-installed**: you can't disable or remove it from `chrome://extensions` UI. Undo it with the uninstall script below instead.
- Scope is your Windows user only (`HKCU`) — no admin rights needed, and it doesn't affect other Windows accounts on the machine.

If that's fine with you:

```powershell
./scripts/install-autoupdate.ps1
```

This adds one entry to the `ExtensionInstallForcelist` Chrome policy — it
only ever *adds* an entry at the next free slot; it never touches or
renumbers anything already there from other software, and running it
again is a safe no-op. Restart Chrome afterward.

To undo:

```powershell
./scripts/uninstall-autoupdate.ps1
```

This removes only this extension's entry, leaving everything else in that
policy list exactly as it was.

---

## Running locally / development

Same as manual install above (`Load unpacked`), pointed at the `extension/`
folder directly in this repo — no build step needed for day-to-day use.

---

## For maintainers: releasing a new version

### Automatic (recommended) — `.github/workflows/release.yml`

Pushing a version tag builds, signs, zips, publishes the GitHub Release
with both files under their fixed names, and bumps `update.xml` on `main`
— all in one go:

```bash
# bump "version" in extension/manifest.json first, commit that, then:
git tag v1.2.0
git push origin v1.2.0
```

One-time setup: add a repository secret named `SIGNING_KEY` (Settings →
Secrets and variables → Actions → New repository secret) containing the
**full contents** of your local `signing-key.pem`, BEGIN/END lines
included. This is the only way the workflow can sign a release that
existing installs will accept as an update — anyone with this secret can
publish a malicious update, so treat it like a password. GitHub encrypts
it at rest and never prints it in logs.

Every push to `main` that *isn't* a version tag does **not** trigger a
release — only tags matching `v*.*.*` do, so ordinary commits are safe.

### Manual fallback — `scripts/build-crx.ps1`

If you'd rather build locally (no secret needed, since it reads your local
`signing-key.pem` directly):

1. Bump `"version"` in `extension/manifest.json`.
2. Run `./scripts/build-crx.ps1` — packs and signs `extension/` using the
   repo's local `signing-key.pem` (this file is **never committed**; if you
   don't have it, you don't have the ability to publish an update that
   existing installs will accept — keep it in a password manager or secure
   offline backup, not in git). Requires Chrome installed locally.
3. This produces `release/ImageBatchDownloader.crx` and `release/ImageBatchDownloader.zip`.
4. Create a GitHub Release (tag matching the version) and attach **both**
   files under those exact filenames — the download page, the README, and
   `update.xml` all link to the "latest release" alias URL for those fixed
   names, so nothing else needs to change per release.
5. Update the `version` attribute in `update.xml` (its `codebase` URL never
   needs to change) and commit to `main` — this is what tells already-installed
   copies (via the optional auto-update mechanism) that a new version exists.

---

## Why this isn't a web page anymore

The previous version ran as a plain web page and had to fetch images
through a chain of public CORS-unlocking proxies, since a browser blocks a
page's own JavaScript from reading a cross-origin response unless the
target server opts in. Some hosts (e.g. certain retailers) block every
public proxy outright, so those downloads always failed no matter how many
fallback proxies were added. A Chrome extension with `host_permissions`
fetches cross-origin with full CORS bypass in its own page context — the
entire proxy chain is gone, not routed around better.

---

## Tech stack

- Manifest V3 Chrome extension, vanilla HTML/CSS/JS — no build step
- [SheetJS / xlsx](https://sheetjs.com/) and [JSZip](https://stuk.github.io/jszip/), vendored locally in `extension/lib/` (MV3 blocks loading remote scripts)
- `chrome.downloads` API for saving files; `host_permissions` for CORS-free `fetch()`

---

## License

MIT — free to use, fork, and modify.
