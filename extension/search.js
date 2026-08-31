(function(){
  const { escapeHtml, escapeAttr, sanitize, extFromContentType, extFromUrl, uniqueName,
          fetchImage, triggerDownload, buildManualCsv, buildManualHtml, simplifyDomain } = IBD;

  let sheetJson = [];
  let headers = [];
  let titles = [];   // {title, status, statusText, selected}

  const dropEl = document.getElementById('drop');
  const fileInput = document.getElementById('fileInput');
  const filenameEl = document.getElementById('filename');
  const tablePanel = document.getElementById('tablePanel');
  const tbody = document.getElementById('tbody');
  const searchEl = document.getElementById('search');
  const rowCountEl = document.getElementById('rowCount');
  const selAllEl = document.getElementById('selAll');
  const selNoneEl = document.getElementById('selNone');
  const selCountEl = document.getElementById('selCount');
  const totalCountEl = document.getElementById('totalCount');
  const startBtn = document.getElementById('startBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const lanesEl = document.getElementById('lanes');
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
  const zipSizeInput = document.getElementById('zipSizeInput');
  const laneCountInput = document.getElementById('laneCount');

  let cancelled = false;
  let lastFailures = [];

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
        populateColumnPicker();
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

  function populateColumnPicker(){
    const titleGuess = guessTitleKey();
    titleColEl.innerHTML = headers.map(h => `<option value="${escapeAttr(h)}">${escapeHtml(h)}</option>`).join('');
    titleColEl.value = titleGuess;
  }

  titleColEl.addEventListener('change', applyColumnMapping);

  function applyColumnMapping(){
    titles = parseTitles(sheetJson, titleColEl.value);
    renderTable();
  }

  function parseTitles(json, titleKey){
    const out = [];
    json.forEach(r => {
      const title = (r[titleKey] || '').toString().trim();
      if (!title) return;
      out.push({title, status:'pending', statusText:'Pending', selected:true});
    });
    return out;
  }

  searchEl.addEventListener('input', renderTable);

  function visibleTitles(){
    const q = searchEl.value.trim().toLowerCase();
    return titles.filter(t => !q || t.title.toLowerCase().includes(q));
  }

  function statusBadge(t){
    const cls = {pending:'pending', working:'working', found:'found', notfound:'notfound'}[t.status] || 'pending';
    return `<span class="badge ${cls}">${escapeHtml(t.statusText)}</span>`;
  }

  function renderTable(){
    const vis = visibleTitles();
    tbody.innerHTML = '';
    if (!vis.length){
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No rows match. Check the column mapping above if this looks wrong.</td></tr>';
    }
    vis.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" ${t.selected ? 'checked' : ''}></td>
        <td><div class="ttitle">${escapeHtml(t.title)}</div></td>
        <td class="statusCell">${statusBadge(t)}</td>
      `;
      const cb = tr.querySelector('input');
      cb.addEventListener('change', () => { t.selected = cb.checked; updateCounts(); });
      t._row = tr;
      tbody.appendChild(tr);
    });
    rowCountEl.textContent = vis.length + ' row' + (vis.length===1?'':'s') + ' shown';
    updateCounts();
  }

  function setStatus(t, status, statusText){
    t.status = status;
    t.statusText = statusText;
    if (t._row){
      const cell = t._row.querySelector('.statusCell');
      if (cell) cell.innerHTML = statusBadge(t);
    }
  }

  selAllEl.addEventListener('click', () => { visibleTitles().forEach(t => t.selected = true); renderTable(); });
  selNoneEl.addEventListener('click', () => { visibleTitles().forEach(t => t.selected = false); renderTable(); });

  function updateCounts(){
    const selected = titles.filter(t => t.selected).length;
    selCountEl.textContent = selected;
    totalCountEl.textContent = titles.length;
    startBtn.disabled = selected === 0;
  }

  // ---------- Google search + extraction (runs in the extension page; the
  // functions passed to executeScript run inside the target tab instead) ----------

  function getZipSize(){
    const n = parseInt(zipSizeInput.value, 10);
    if (!Number.isFinite(n) || n < 1) return 100;
    return Math.min(n, 2000);
  }
  function getLaneCount(){
    const n = parseInt(laneCountInput.value, 10);
    if (!Number.isFinite(n) || n < 1) return 5;
    return Math.min(n, 5);
  }

  function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
  function randomDelay(minMs, maxMs){ return delay(minMs + Math.random()*(maxMs-minMs)); }

  function navigateAndWait(tabId, url, timeoutMs){
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('page load timed out'));
      }, timeoutMs || 20000);
      function listener(tid, info, tab){
        if (tid !== tabId || info.status !== 'complete') return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.update(tabId, {url}).catch(err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(err);
      });
    });
  }

  async function extractGoogleResults(tabId){
    const frames = await chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        function isInsideAd(el){
          return !!el.closest('#tads, #tadsb, #tvcap, [data-text-ad="1"], .pla-unit, .commercial-unit-desktop-top, .commercial-unit-desktop-rhs');
        }
        const out = [];
        const seen = new Set();
        const anchors = document.querySelectorAll('#search a[href^="http"], #rso a[href^="http"]');
        for (const a of anchors){
          if (out.length >= 3) break;
          if (isInsideAd(a)) continue;
          const href = a.href;
          if (seen.has(href)) continue;
          if (/^https?:\/\/(www\.)?google\.[a-z.]+\//i.test(href)) continue;
          if (/googleusercontent\.com|accounts\.google\.|support\.google\./i.test(href)) continue;
          const h3 = a.querySelector('h3') || (a.closest('div') && a.closest('div').querySelector('h3'));
          if (!h3) continue;
          seen.add(href);
          const block = a.closest('div');
          let snippet = '';
          const snippetEl = block && block.parentElement ? block.parentElement.querySelector('.VwiC3b, [data-sncf="1"]') : null;
          if (snippetEl) snippet = snippetEl.textContent.trim();
          out.push({href, title: h3.textContent.trim(), snippet});
        }
        return out;
      }
    });
    return (frames && frames[0] && frames[0].result) || [];
  }

  async function extractProductImage(tabId){
    const frames = await chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        function abs(u){ try { return new URL(u, document.baseURI).href; } catch(e){ return null; } }
        const metaSelectors = [
          'meta[property="og:image:secure_url"]',
          'meta[property="og:image"]',
          'meta[name="og:image"]',
          'meta[property="twitter:image"]',
          'meta[name="twitter:image"]',
          'meta[itemprop="image"]'
        ];
        for (const sel of metaSelectors){
          const el = document.querySelector(sel);
          const content = el && el.getAttribute('content');
          if (content){
            const url = abs(content);
            if (url) return url;
          }
        }
        let best = null, bestArea = 0;
        document.querySelectorAll('img').forEach(function(img){
          const rect = img.getBoundingClientRect();
          const w = img.naturalWidth || rect.width;
          const h = img.naturalHeight || rect.height;
          const area = w * h;
          if (area > bestArea && w > 80 && h > 80 && img.src){
            bestArea = area;
            best = img.src;
          }
        });
        return best ? abs(best) : null;
      }
    });
    return (frames && frames[0] && frames[0].result) || null;
  }

  async function findBuyNowLink(tabId){
    const frames = await chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        function abs(u){ try { return new URL(u, document.baseURI).href; } catch(e){ return null; } }
        const BUY_RE = /\b(buy\s*(it)?\s*now|shop\s*now|order\s*now|add\s*to\s*cart|view\s*product|see\s*product)\b/i;
        function textOf(el){
          return ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '' ) + ' ' + (el.textContent || '') + ' ' + (el.value || '');
        }
        const candidates = document.querySelectorAll('a, button, [role="button"]');
        for (const el of candidates){
          const label = textOf(el).trim().replace(/\s+/g,' ');
          if (!label || !BUY_RE.test(label)) continue;
          if (el.tagName === 'A' && el.href) return abs(el.href);
          const link = el.closest('a[href]');
          if (link) return abs(link.href);
        }
        return null;
      }
    });
    return (frames && frames[0] && frames[0].result) || null;
  }

  function wordSet(s){
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  }
  function similarity(title, candidateText){
    const a = new Set(wordSet(title));
    const b = wordSet(candidateText);
    if (!a.size || !b.length) return 0;
    const seen = new Set();
    let hit = 0;
    b.forEach(w => { if (a.has(w) && !seen.has(w)){ hit++; seen.add(w); } });
    return hit / a.size;
  }
  function pickBestResult(title, results){
    if (!results.length) return null;
    let best = results[0], bestScore = -1;
    results.forEach(r => {
      const score = similarity(title, (r.title || '') + ' ' + (r.snippet || ''));
      if (score > bestScore){ bestScore = score; best = r; }
    });
    return best;
  }

  async function searchAndFetch(tabId, title){
    const q = encodeURIComponent(title);
    await navigateAndWait(tabId, `https://www.google.com/search?q=${q}&num=10&hl=en`, 20000);
    await delay(400); // small settle time in case of client-side render
    const results = await extractGoogleResults(tabId);
    const best = pickBestResult(title, results);
    if (!best) throw Object.assign(new Error('no organic result found'), {stage:'search'});

    await navigateAndWait(tabId, best.href, 20000);
    const landingImageUrl = await extractProductImage(tabId);
    const buyUrl = await findBuyNowLink(tabId);

    let imageUrl = null;
    let pageUrl = best.href;

    if (buyUrl && buyUrl !== best.href){
      // Prefer the Buy Now / Shop Now destination's image over the landing page's.
      await navigateAndWait(tabId, buyUrl, 20000);
      const buyImageUrl = await extractProductImage(tabId);
      if (buyImageUrl){
        imageUrl = buyImageUrl;
        pageUrl = buyUrl;
      }
    }

    if (!imageUrl && landingImageUrl){
      // Fall back to the image already found on the original landing page.
      imageUrl = landingImageUrl;
      pageUrl = best.href;
    }

    if (!imageUrl) throw Object.assign(new Error('no product image found on ' + pageUrl), {stage:'image', pageUrl});

    return {imageUrl, pageUrl};
  }

  // ---------- lane pool ----------
  function renderLanes(count){
    lanesEl.innerHTML = '';
    for (let i=0; i<count; i++){
      const div = document.createElement('div');
      div.className = 'lane';
      div.innerHTML = `<b>Tab ${i+1}</b><span id="laneStatus${i}">Starting…</span>`;
      lanesEl.appendChild(div);
    }
  }
  function setLaneStatus(i, text){
    const el = document.getElementById('laneStatus' + i);
    if (el) el.textContent = text;
  }

  startBtn.addEventListener('click', runSearch);
  cancelBtn.addEventListener('click', () => { cancelled = true; logLine('Cancelling — finishing in-flight tabs…', 'fail'); });
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
    triggerDownload(blob, 'failed-titles.csv').catch(err => alert('Download failed: ' + err.message));
  });

  async function runSearch(){
    const selected = titles.filter(t => t.selected);
    if (!selected.length) return;

    const maxPerZip = getZipSize();
    const laneCount = Math.min(getLaneCount(), selected.length);
    cancelled = false;
    startBtn.disabled = true;
    cancelBtn.style.display = 'inline-block';
    progressWrap.classList.add('show');
    resultsEl.classList.remove('show');
    manualActions.style.display = 'none';
    progressFill.style.width = '0%';
    logEl.innerHTML = '';
    renderLanes(laneCount);
    selected.forEach(t => setStatus(t, 'pending', 'Queued'));

    let ok = 0, bad = 0, processed = 0;
    const failures = [];
    const okItems = [];
    let idx = 0;

    async function lane(laneIndex){
      let tab;
      try {
        tab = await chrome.tabs.create({url: 'about:blank', active: false});
      } catch(err){
        setLaneStatus(laneIndex, 'Could not open tab: ' + err.message);
        return;
      }
      while (idx < selected.length){
        if (cancelled) break;
        const item = selected[idx++];
        setStatus(item, 'working', 'Searching…');
        setLaneStatus(laneIndex, 'Searching: ' + item.title);
        try {
          const {imageUrl, pageUrl} = await searchAndFetch(tab.id, item.title);
          setLaneStatus(laneIndex, 'Fetching image for: ' + item.title);
          const {res, ctype} = await fetchImage(imageUrl);
          const blob = await res.blob();
          if (!blob || blob.size === 0) throw new Error('empty image response');
          const ext = extFromContentType(ctype) || extFromUrl(imageUrl) || 'jpg';
          const name = sanitize(item.title) + '.' + ext;
          okItems.push({name, blob});
          ok++;
          setStatus(item, 'found', 'Found');
          logLine('OK   ' + item.title + '  ←  ' + pageUrl, 'ok');
        } catch(err){
          bad++;
          failures.push({title: item.title, url: err.pageUrl || null, reason: err.message});
          setStatus(item, 'notfound', 'Not found');
          logLine('FAIL ' + item.title + '  —  ' + err.message, 'fail');
        }
        processed++;
        progressLabel.textContent = `${processed} of ${selected.length} processed`;
        progressFill.style.width = Math.round((processed/selected.length)*100) + '%';
        if (idx < selected.length && !cancelled) await randomDelay(1200, 2800);
      }
      setLaneStatus(laneIndex, 'Done');
      try { await chrome.tabs.remove(tab.id); } catch(e){}
    }

    const lanes = [];
    for (let i=0; i<laneCount; i++) lanes.push(lane(i));
    await Promise.all(lanes);

    if (cancelled){
      logLine('Stopped — ' + ok + ' image(s) fetched before cancelling were not zipped.', 'fail');
      progressWrap.classList.remove('show');
      cancelBtn.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

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
        zip.file('_not-found.html', buildManualHtml(failures));
        zip.file('_not-found.csv', buildManualCsv(failures));
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
    if (bad) notes.push(`${bad} title${bad===1?'':'s'} couldn't be resolved to a product image — either no usable Google result, no image found on the matched page, or the image itself failed to fetch. They're bundled in the ZIP as <code>_not-found.html</code> (clickable links where one was found) and <code>_not-found.csv</code> — or use the buttons below.`);
    if (notes.length){
      failNote.style.display = 'block';
      failNote.innerHTML = notes.join('<br><br>');
    } else {
      failNote.style.display = 'none';
    }
    manualActions.style.display = failures.length ? 'flex' : 'none';
    startBtn.disabled = false;
  }
})();
