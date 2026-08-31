(function(){
  const { escapeHtml, escapeAttr, sanitize, extFromContentType, extFromUrl, uniqueName,
          fetchImage, triggerDownload, buildManualCsv, buildManualHtml } = IBD;

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
      try { domain = IBD.simplifyDomain(new URL(url).hostname); } catch(e){}
      const direct = /\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(url);
      out.push({title: title || url, url, domain, direct, selected: true});
    });
    return out;
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

  const CONCURRENCY = 6;

  function getZipSize(){
    const n = parseInt(zipSizeInput.value, 10);
    if (!Number.isFinite(n) || n < 1) return 100;
    return Math.min(n, 2000);
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
})();
