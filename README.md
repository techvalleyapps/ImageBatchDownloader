# 🖼️ Image Batch Downloader

A lightweight, single-file browser tool for downloading images in bulk from a spreadsheet of titles and image URLs — no installs, no dependencies.

**Live demo:** `https://apps.ipadhires.co.uk/ImageBatchDownloader/`

---

## Features

- Upload an **.xlsx**, **.xls**, or **.csv** file — any header names work, you pick which columns are the title and which are the image URL
- Auto-detects likely title/URL columns as a starting point, with dropdowns to override
- Rows grouped into filterable domain chips, plus a text search, so you can review before downloading
- Choose how many images go in each ZIP ("Items per ZIP") — large selections are automatically split across multiple ZIPs of that size
- Direct image fetches happen entirely in your browser tab; a URL blocked by CORS is retried through a public unlocking proxy (that one URL only — nothing else about your file is sent anywhere)
- Links that can't be fetched automatically (e.g. store product pages rather than direct image files) are listed in a `_manual-download-needed.txt` file inside the ZIP

---

## How to publish on GitHub Pages

### 1 — Create the repository

1. Go to [github.com/new](https://github.com/new)
2. Name it **ImageBatchDownloader** (or anything you like)
3. Set it to **Public**
4. Click **Create repository**

### 2 — Push the files

```bash
cd path\to\ImageBatchDownloader
git init
git add .
git commit -m "Initial commit — Image Batch Downloader"
git branch -M main
git remote add origin https://github.com/<your-username>/ImageBatchDownloader.git
git push -u origin main
```

### 3 — Enable GitHub Pages

1. Open your repository on GitHub
2. Go to **Settings → Pages**
3. Under **Source**, choose **Deploy from a branch**
4. Select **main** branch and **/ (root)** folder
5. Click **Save**

---

## Running locally (offline)

Just open `index.html` directly in any modern browser — no server needed.

---

## Tech stack

- Pure HTML + CSS + JavaScript — zero dependencies
- [SheetJS / xlsx](https://sheetjs.com/) (via CDN) for reading .xlsx/.xls/.csv
- [JSZip](https://stuk.github.io/jszip/) (via CDN) for zip generation

---

## License

MIT — free to use, fork, and modify.
