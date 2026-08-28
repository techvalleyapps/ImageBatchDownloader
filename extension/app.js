(function(){
  let sheetJson = [];   // raw parsed rows, as objects keyed by header
  let headers = [];
  let rows = [];        // {title, url, domain, direct, selected}
  let activeDomain = 'all';

  const dropEl = document.getElementById('drop');
  const fileInput = document.getElementById('fileInput');
  const filenameEl = document.getElementById('filename');
  const tablePanel = document.getElementById('tablePanel');
  const tbody = document.getElementById('tbody');
  const domainChips = document.getElementById('domainChips');
  const searchEl = document.getElementById('search');
  const rowCountEl = document.getElementById('rowCount');
  const selAllEl = document.getElementById('selAll');
  const selNoneEl = document.getElementById('selNone');
  const selCountEl = document.getElementById('selCount');
  const totalCountEl = document.getElementById('totalCount');
  const downloadBtn = document.getElementById('downloadBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const logEl = document.getElementById('log');
  const cancelBtn = document.getElementById('cancelBtn');
  const resultsEl = document.getElementById('results');
  const okNEl = document.getElementById('okN');
  const badNEl = document.getElementById('badN');
  const failNote = document.getElementById('failNote');
  const manualActions = document.getElementById('manualActions');
  const viewFailBtn = document.getElementById('viewFailBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const titleColEl = document.getElementById('titleCol');
  const urlColEl = document.getElementById('urlCol');
  const zipSizeInput = document.getElementById('zipSizeInput');
  let cancelled = false;
  let lastFailures = []; // items that couldn't be fetched on the most recent run

  function logLine(text, cls){
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- file handling ----------
  dropEl.addEventListener('click', () => fileInput.click());
  dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('drag'); });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', e => {
    e.preventDefault(); dropEl.classList.remove('drag');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file){
    filenameEl.textContent = 'Loaded: ' + file.name;
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {defval:''});
        if (!json.length || !Object.keys(json[0]).length){
          alert('No usable rows found in that file.');
          return;
        }
        sheetJson = json;
        headers = Object.keys(json[0]);
        populateColumnPickers();
        applyColumnMapping();
        tablePanel.style.display = 'block';
        resultsEl.classList.remove('show');
        manualActions.style.display = 'none';
        progressWrap.classList.remove('show');
      } catch(err){
        alert('Could not read that file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function guessTitleKey(){ return headers.find(h => /title|name|product/i.test(h)) || headers[0]; }
  function guessUrlKey(){
    return headers.find(h => /url|link|image/i.test(h)) || headers.find(h => h !== guessTitleKey()) || headers[0];
  }

  function populateColumnPickers(){
    const titleGuess = guessTitleKey();
    const urlGuess = guessUrlKey();
    titleColEl.innerHTML = headers.map(h => `<option value="${escapeAttr(h)}">${escapeHtml(h)}</option>`).join('');
    urlColEl.innerHTML = headers.map(h => `<option value="${escapeAttr(h)}">${escapeHtml(h)}</option>`).join('');
    titleColEl.value = titleGuess;
    urlColEl.value = urlGuess;
  }

  titleColEl.addEventListener('change', applyColumnMapping);
  urlColEl.addEventListener('change', applyColumnMapping);

  function applyColumnMapping(){
    rows = parseRows(sheetJson, titleColEl.value, urlColEl.value);
    activeDomain = 'all';
    if (!rows.length){
      buildDomainChips();
      renderTable();
      return;
    }
    buildDomainChips();
    renderTable();
  }

  function parseRows(json, titleKey, urlKey){
    const out = [];
    json.forEach(r => {
      const url = (r[urlKey] || '').toString().trim();
      const title = (r[titleKey] || '').toString().trim();
      if (!url || !/^https?:\/\//i.test(url)) return;
      let domain = 'other';
      try { domain = simplifyDomain(new URL(url).hostname); } catch(e){}
      const direct = /\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(url);
      out.push({title: title || url, url, domain, direct, selected: true});
    });
    return out;
  }

  function simplifyDomain(host){
    host = host.replace(/^www\./,'').replace(/^assets\./,'');
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const twoLetterCc = /^[a-z]{2}$/i;
    // handle things like co.uk, com.au
    if (parts.length >= 3 && twoLetterCc.test(parts[parts.length-1]) && /^(co|com|net|org)$/i.test(parts[parts.length-2])){
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  // ---------- domain chips ----------
  function buildDomainChips(){
    const counts = {};
    rows.forEach(r => counts[r.domain] = (counts[r.domain]||0) + 1);
    const domains = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);

    domainChips.innerHTML = '';
    const allChip = makeChip('all', 'All', rows.length);
    domainChips.appendChild(allChip);
    domains.forEach(d => domainChips.appendChild(makeChip(d, d, counts[d])));
    updateChipStyles();
  }

  function makeChip(key, label, count){
    const el = document.createElement('div');
    el.className = 'chip';
    el.dataset.domain = key;
    el.innerHTML = label + '<span class="count">' + count + '</span>';
    el.addEventListener('click', () => { activeDomain = key; updateChipStyles(); renderTable(); });
    return el;
  }
  function updateChipStyles(){
    [...domainChips.children].forEach(c => c.classList.toggle('active', c.dataset.domain === activeDomain));
  }

  searchEl.addEventListener('input', renderTable);

  // ---------- table ----------
  function visibleRows(){
    const q = searchEl.value.trim().toLowerCase();
    return rows.filter(r => {
      if (activeDomain !== 'all' && r.domain !== activeDomain) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.url.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderTable(){
    const vis = visibleRows();
    tbody.innerHTML = '';
    if (!vis.length){
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No rows match. Check the column mapping above if this looks wrong.</td></tr>';
    }
    vis.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" ${r.selected ? 'checked' : ''}></td>
        <td><div class="ttitle">${escapeHtml(r.title)}</div><span class="turl">${escapeHtml(r.url)}</span></td>
        <td><span class="badge domain">${escapeHtml(r.domain)}</span></td>
        <td>${r.direct ? '<span class="badge direct">image file</span>' : '<span class="badge manual">page link</span>'}</td>
      `;
      const cb = tr.querySelector('input');
      cb.addEventListener('change', () => { r.selected = cb.checked; updateCounts(); });
      tbody.appendChild(tr);
    });
    rowCountEl.textContent = vis.length + ' row' + (vis.length===1?'':'s') + ' shown';
    updateCounts();
  }

  selAllEl.addEventListener('click', () => { visibleRows().forEach(r => r.selected = true); renderTable(); });
  selNoneEl.addEventListener('click', () => { visibleRows().forEach(r => r.selected = false); renderTable(); });

  function updateCounts(){
    const selected = rows.filter(r => r.selected).length;
    selCountEl.textContent = selected;
    totalCountEl.textContent = rows.length;
    downloadBtn.disabled = selected === 0;
  }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }

  // ---------- download / zip ----------
  downloadBtn.addEventListener('click', runDownload);
  cancelBtn.addEventListener('click', () => { cancelled = true; logLine('Cancelling…', 'fail'); });
  viewFailBtn.addEventListener('click', () => {
    if (!lastFailures.length) return;
    const blob = new Blob([buildManualHtml(lastFailures)], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  });
  downloadCsvBtn.addEventListener('click', () => {
    if (!lastFailures.length) return;
    const blob = new Blob([buildManualCsv(lastFailures)], {type:'text/csv'});
    triggerDownload(blob, 'failed-links.csv').catch(err => alert('Download failed: ' + err.message));
  });

  const FETCH_TIMEOUT_MS = 20000;
  const CONCURRENCY = 6;

  function getZipSize(){
    const n = parseInt(zipSizeInput.value, 10);
    if (!Number.isFinite(n) || n < 1) return 100;
    return Math.min(n, 2000);
  }

  async function fetchWithTimeout(url){
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // This is an extension page with host_permissions for http(s)://*/*, so
      // this fetch reads the full cross-origin response regardless of the
      // target's CORS headers — no unlocking proxy needed, ever.
      return await fetch(url, {cache:'no-store', signal: controller.signal});
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchImage(url){
    const res = await fetchWithTimeout(url);
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (!ctype.startsWith('image/')) throw new Error('not an image response (got ' + (ctype || 'unknown content-type') + ')');
    return {res, ctype};
  }

  async function runDownload(){
    const selected = rows.filter(r => r.selected);
    if (!selected.length) return;

    const maxPerZip = getZipSize();
    cancelled = false;
    downloadBtn.disabled = true;
    cancelBtn.style.display = 'inline-block';
    progressWrap.classList.add('show');
    resultsEl.classList.remove('show');
    manualActions.style.display = 'none';
    progressFill.style.width = '0%';
    logEl.innerHTML = '';

    let ok = 0, bad = 0;
    const failures = [];
    const okItems = []; // {name, blob}
    let idx = 0;

    async function worker(){
      while (idx < selected.length){
        if (cancelled) return;
        const i = idx++;
        const item = selected[i];
        try {
          const {res, ctype} = await fetchImage(item.url);
          const blob = await res.blob();
          if (!blob || blob.size === 0) throw new Error('empty response body');
          const ext = extFromContentType(ctype) || extFromUrl(item.url) || 'jpg';
          const name = sanitize(item.title) + '.' + ext;
          okItems.push({name, blob});
          ok++;
          logLine('OK   ' + item.title, 'ok');
        } catch(err){
          bad++;
          failures.push(item);
          logLine('FAIL ' + item.title + '  —  ' + err.message, 'fail');
        }
        progressLabel.textContent = `${Math.min(idx, selected.length)} of ${selected.length} processed`;
        progressFill.style.width = Math.round((Math.min(idx, selected.length)/selected.length)*100) + '%';
      }
    }

    const workers = [];
    for (let w=0; w<Math.min(CONCURRENCY, selected.length); w++) workers.push(worker());
    await Promise.all(workers);

    if (cancelled){
      logLine('Stopped — ' + ok + ' image(s) fetched before cancelling were not zipped.', 'fail');
      progressWrap.classList.remove('show');
      cancelBtn.style.display = 'none';
      downloadBtn.disabled = false;
      return;
    }

    // Build one or more zips, capped at the user's chosen items-per-zip, so a
    // large selection doesn't force one huge generateAsync() call. Files sit
    // flat at the zip root — no per-domain folders.
    const chunkCount = Math.max(1, Math.ceil(okItems.length / maxPerZip));
    for (let c = 0; c < chunkCount; c++){
      const chunk = okItems.slice(c*maxPerZip, (c+1)*maxPerZip);
      const zip = new JSZip();
      const used = {};
      chunk.forEach(it => {
        const name = uniqueName(used, it.name);
        zip.file(name, it.blob);
      });
      if (c === chunkCount - 1 && failures.length){
        zip.file('_manual-download-needed.html', buildManualHtml(failures));
        zip.file('_manual-download-needed.csv', buildManualCsv(failures));
      }
      progressLabel.textContent = chunkCount > 1 ? `Zipping batch ${c+1} of ${chunkCount}…` : 'Zipping…';
      const content = await zip.generateAsync({type:'blob'});
      const filename = chunkCount > 1 ? `images_batch_${c+1}_of_${chunkCount}.zip` : 'images.zip';
      try {
        await triggerDownload(content, filename);
        logLine('Downloaded ' + filename + ' (' + Object.keys(zip.files).length + ' file(s))', 'ok');
      } catch(err){
        logLine('FAIL saving ' + filename + '  —  ' + err.message, 'fail');
      }
    }

    progressWrap.classList.remove('show');
    cancelBtn.style.display = 'none';
    resultsEl.classList.add('show');
    okNEl.textContent = ok;
    badNEl.textContent = bad;
    lastFailures = failures;
    const notes = [];
    if (bad) notes.push(`${bad} link${bad===1?'':'s'} couldn't be fetched — usually because it's a store product page rather than a direct image file, or the link itself is dead. They're bundled in the ZIP as <code>_manual-download-needed.html</code> (clickable links, opens in a new tab) and <code>_manual-download-needed.csv</code> — or use the buttons below to get them right now without opening the ZIP.`);
    if (notes.length){
      failNote.style.display = 'block';
      failNote.innerHTML = notes.join('<br><br>');
    } else {
      failNote.style.display = 'none';
    }
    manualActions.style.display = failures.length ? 'flex' : 'none';
    downloadBtn.disabled = false;
  }

  function csvField(s){
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }

  function buildManualCsv(failures){
    const lines = ['Title,URL'];
    failures.forEach(f => lines.push(csvField(f.title) + ',' + csvField(f.url)));
    return lines.join('\r\n');
  }

  function buildManualHtml(failures){
    const rowsHtml = failures.map((f, i) => `
        <tr>
          <td class="n">${i + 1}</td>
          <td class="t">${escapeHtml(f.title)}</td>
          <td class="d">${escapeHtml(f.domain)}</td>
          <td class="a"><a href="${escapeAttr(f.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></td>
        </tr>`).join('');
    const dataJson = JSON.stringify(failures.map(f => f.url));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Links to download manually (${failures.length})</title>
<style>
  :root{--bg:#fff;--panel:#fff;--border:#e6e7ef;--text:#171923;--muted:#6b7085;--accent:#6d5bf5;--accent-2:#a855f7;--chip:#f0f1f6;}
  @media (prefers-color-scheme: dark){:root{--bg:#0e0f14;--panel:#181a23;--border:#2a2d3a;--text:#f1f2f6;--muted:#9296ab;--chip:#242631;}}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}
  .wrap{max-width:800px;margin:0 auto;padding:36px 20px 60px;}
  h1{font-size:1.3rem;margin:0 0 6px;}
  p.sub{color:var(--muted);font-size:0.9rem;line-height:1.5;margin:0 0 20px;}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;}
  button{
    background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;padding:10px 18px;
    border-radius:8px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;
  }
  button.secondary{background:var(--chip);color:var(--text);}
  table{width:100%;border-collapse:collapse;font-size:0.87rem;}
  th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;}
  td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:top;}
  td.n{color:var(--muted);width:32px;}
  td.d span{background:var(--chip);padding:2px 8px;border-radius:999px;font-size:0.75rem;}
  td.a a{color:var(--accent);text-decoration:none;font-weight:600;white-space:nowrap;}
  td.a a:hover{text-decoration:underline;}
  #note{font-size:0.8rem;color:var(--muted);margin-top:14px;}
</style>
</head>
<body>
<div class="wrap">
  <h1>${failures.length} link${failures.length === 1 ? '' : 's'} to download manually</h1>
  <p class="sub">These couldn't be fetched automatically — usually a store product page rather than a direct image file, or a dead link. Click a link below to open it, or use "Open all" to open every link in its own tab.</p>
  <div class="actions">
    <button id="openAllBtn" type="button">Open all in new tabs</button>
    <button id="csvBtn" type="button" class="secondary">Download as CSV</button>
  </div>
  <table>
    <thead><tr><th></th><th>Title</th><th>Domain</th><th></th></tr></thead>
    <tbody>${rowsHtml}
    </tbody>
  </table>
  <p id="note"></p>
</div>
<script>
  const LINKS = ${dataJson};
  document.getElementById('openAllBtn').addEventListener('click', function(){
    let blocked = 0;
    LINKS.forEach(function(u){
      const w = window.open(u, '_blank', 'noopener');
      if (!w) blocked++;
    });
    document.getElementById('note').textContent = blocked
      ? blocked + ' tab(s) were blocked by your browser\\'s popup blocker — allow popups for this page and try again, or click links individually.'
      : 'Opened ' + LINKS.length + ' tab(s).';
  });
  document.getElementById('csvBtn').addEventListener('click', function(){
    const rows = [['Title','URL']].concat(
      Array.prototype.map.call(document.querySelectorAll('tbody tr'), function(tr){
        const title = tr.querySelector('td.t').textContent;
        const url = tr.querySelector('td.a a').href;
        const esc = function(s){ return /[",\\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
        return [esc(title), esc(url)];
      })
    );
    const csv = rows.map(function(r){ return r.join(','); }).join('\\r\\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'failed-links.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
<\/script>
</body>
</html>`;
  }

  function extFromContentType(ctype){
    const map = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','image/bmp':'bmp','image/avif':'avif'};
    return map[ctype.split(';')[0].trim()];
  }
  function extFromUrl(url){
    const m = url.match(/\.([a-z0-9]{2,4})(\?|#|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
  function sanitize(name){
    return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g,' ').trim().slice(0,120) || 'image';
  }
  function uniqueName(used, name){
    if (!used[name]){ used[name] = 1; return name; }
    const dot = name.lastIndexOf('.');
    const base = dot > -1 ? name.slice(0,dot) : name;
    const ext = dot > -1 ? name.slice(dot) : '';
    let n = used[name] + 1;
    let candidate;
    do { candidate = `${base} (${n})${ext}`; n++; } while (used[candidate]);
    used[name]++;
    used[candidate] = 1;
    return candidate;
  }

  // Saves via the extension's downloads API (native download, works from a
  // blob: URL) instead of an <a download> click — used for the extension's
  // own tab only; the standalone failed-links page below has no chrome.*
  // access and keeps the plain anchor-click approach.
  function triggerDownload(blob, filename){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({url, filename, saveAs:false}, downloadId => {
        if (chrome.runtime.lastError || downloadId === undefined){
          URL.revokeObjectURL(url);
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'download failed'));
          return;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        resolve(downloadId);
      });
    });
  }
})();
