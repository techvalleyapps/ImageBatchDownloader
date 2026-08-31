# 🖼️ Image Batch Downloader

A Chrome extension that downloads a whole batch of images at once from a
spreadsheet — just give it a list of titles and image links, and it hands
you back a ZIP.

**Get it:** [apps.ipadhires.co.uk/ImageBatchDownloader](https://apps.ipadhires.co.uk/ImageBatchDownloader/) · or jump straight to the [download](https://github.com/techvalleyapps/ImageBatchDownloader/releases/latest/download/ImageBatchDownloader.zip)

This isn't on the Chrome Web Store — it's installed straight from this page instead. That's normal, not a red flag; see below for why.

---

## What it does

1. You give it a spreadsheet (`.xlsx`, `.xls`, or `.csv`) with a column of
   titles and a column of image links — any file, any column names.
2. It shows you every row, grouped by website and searchable, so you can
   pick exactly which ones you want.
3. Click download, and it fetches every selected image and hands you a
   ZIP — split into smaller ZIPs automatically if you've selected a lot.
4. Anything it couldn't grab (a dead link, or a page instead of a direct
   image) gets listed separately with clickable links, so you can grab
   those few by hand instead of hunting through the whole list.

Because it's an extension rather than a website, it can fetch images from
places a website could never reach — no more "some images just won't
download" from stubborn stores or CDNs.

---

## Install

1. Download the ZIP: **[ImageBatchDownloader.zip](https://github.com/techvalleyapps/ImageBatchDownloader/releases/latest/download/ImageBatchDownloader.zip)** (this link always gets you the newest version), then unzip it somewhere you'll keep it — don't delete the folder after installing, Chrome keeps loading the extension from it.
2. Open a new Chrome tab and go to `chrome://extensions`.
3. Turn on **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder you unzipped.
5. Done — click the icon in your Chrome toolbar any time to open the tool.

If you don't see the icon in your toolbar, click the puzzle-piece icon
next to the address bar and pin it from there.

This way of installing won't update itself automatically — to get a newer
version later, download the new ZIP and repeat these steps (or just click
the reload icon on the extension's card in `chrome://extensions`). If
you'd rather it update itself, see the next section.

---

## Optional: make it update itself automatically

By default you'll need to manually re-install for each new version. If
you'd rather Chrome handle that silently in the background, open
**PowerShell** and paste in:

```powershell
irm https://raw.githubusercontent.com/techvalleyapps/ImageBatchDownloader/main/scripts/install-autoupdate.ps1 | iex
```

This downloads and runs a small script that tells Chrome to keep this
extension installed and updated on its own. A couple of things worth
knowing before you run it:

- Chrome will start showing a permanent **"Managed by your organization"**
  banner. That's just what Chrome always shows once *any* setting like
  this is turned on — even one you turned on yourself — there's no way
  to keep the auto-update behavior without it.
- You won't be able to remove or turn off the extension from the normal
  `chrome://extensions` page anymore — you'll need to run the undo
  command below instead.
- This only affects your own Windows user account — no admin rights
  needed, and it won't touch anyone else who uses this computer.
- **This only works on a managed PC** — one that's joined to a Windows
  domain, or enrolled in Chrome Browser Cloud Management/MDM. Since
  Chrome 75, that's a hard requirement for force-installing any extension
  that isn't on the Chrome Web Store; on a regular, unmanaged home PC the
  script runs fine and reports success, but Chrome quietly ignores the
  policy and nothing appears in `chrome://extensions`. If that happens
  to you, check `chrome://policy` for `ExtensionInstallForcelist` — if
  it's not listed as applied there, this mechanism can't work on your
  machine, and "Load unpacked" above is the way to go instead.

To undo it later:

```powershell
irm https://raw.githubusercontent.com/techvalleyapps/ImageBatchDownloader/main/scripts/uninstall-autoupdate.ps1 | iex
```

Restart Chrome after running either command for it to take effect.

---

## Why isn't this on the Chrome Web Store?

It's a small internal-use tool, so it's simplest to distribute straight
from GitHub rather than going through a store listing. Nothing shady
about it — the source code above is exactly what you're installing.

---

## Your data stays on your machine

Everything runs locally inside the extension. Your spreadsheet, the
images, and the ZIP it builds never get sent anywhere else — there's no
server involved and no proxy in the loop.

---

## License

MIT — free to use, fork, and modify.

---

*Maintaining or contributing to this repo? See [DEVELOPMENT.md](DEVELOPMENT.md).*
