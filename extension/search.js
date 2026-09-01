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
  const logWrap = document.getElementById('logWrap');
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
  const searchEngineEl = document.getElementById('searchEngine');

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
  function getPrimaryEngine(){
    return searchEngineEl.value === 'duckduckgo' ? 'duckduckgo' : 'google';
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
          if (out.length >= 8) break;
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

  async function extractDuckDuckGoResults(tabId){
    const frames = await chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        const out = [];
        const seen = new Set();
        const blocks = document.querySelectorAll('.web-result');
        for (const block of blocks){
          if (out.length >= 8) break;
          const a = block.querySelector('a.result__a');
          if (!a || !a.href) continue;
          let href;
          try {
            const u = new URL(a.href, location.href);
            href = (u.hostname.includes('duckduckgo.com') && u.searchParams.has('uddg'))
              ? decodeURIComponent(u.searchParams.get('uddg'))
              : u.href;
          } catch(e){ continue; }
          if (!href || seen.has(href)) continue;
          seen.add(href);
          const snippetEl = block.querySelector('.result__snippet');
          out.push({href, title: a.textContent.trim(), snippet: snippetEl ? snippetEl.textContent.trim() : ''});
        }
        return out;
      }
    });
    return (frames && frames[0] && frames[0].result) || [];
  }

  function isGoogleBlocked(tabId){
    return chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        return !!document.querySelector('form#captcha-form, div#recaptcha, iframe[src*="recaptcha"]')
          || /unusual traffic/i.test(document.body ? document.body.textContent.slice(0, 2000) : '');
      }
    }).then(frames => !!(frames && frames[0] && frames[0].result)).catch(() => false);
  }

  const ENGINES = {
    google: {
      buildUrl: q => `https://www.google.com/search?q=${q}&num=10&hl=en`,
      extract: extractGoogleResults,
      isBlocked: isGoogleBlocked
    },
    duckduckgo: {
      buildUrl: q => `https://html.duckduckgo.com/html/?q=${q}`,
      extract: extractDuckDuckGoResults,
      isBlocked: () => Promise.resolve(false)
    }
  };

  async function extractProductImage(tabId){
    const frames = await chrome.scripting.executeScript({
      target: {tabId},
      func: function(){
        function abs(u){ try { return new URL(u, document.baseURI).href; } catch(e){ return null; } }
        // Some sites (e.g. mi.com) reuse a generic brand logo/share image for
        // og:image/twitter:image on every page — reject those instead of
        // trusting the meta tag blindly.
        const LOGO_RE = /(^|[\/._-])(logo|favicon|sprite|icon|apple-touch|og-default|default[-_]?share|placeholder|no[-_]?image|noimage|social[-_]?share|share[-_]?image)([\/._-]|$)/i;
        function looksLikeLogo(url){
          try { return LOGO_RE.test(new URL(url).pathname); } catch(e){ return LOGO_RE.test(url); }
        }

        // Structured Product data (schema.org) is usually the most reliable
        // source of the actual product photo — check it before meta tags.
        function fromJsonLd(){
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const s of scripts){
            let data;
            try { data = JSON.parse(s.textContent); } catch(e){ continue; }
            const items = Array.isArray(data) ? data : (data && Array.isArray(data['@graph']) ? data['@graph'] : [data]);
            for (const item of items){
              if (!item || typeof item !== 'object') continue;
              const type = item['@type'];
              const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
              if (!isProduct) continue;
              let img = item.image;
              if (Array.isArray(img)) img = img[0];
              if (img && typeof img === 'object') img = img.url || img.contentUrl;
              if (typeof img === 'string' && img && !looksLikeLogo(img)){
                const url = abs(img);
                if (url) return url;
              }
            }
          }
          return null;
        }
        const jsonLdImage = fromJsonLd();
        if (jsonLdImage) return jsonLdImage;

        // Amazon (and similarly-templated storefronts) have no og:image, so
        // the old fallback fell straight to "largest image on the page" —
        // which can land on a customer-review or Q&A thumbnail instead of
        // the actual listing photo. Check the known main-image slot first.
        const mainImageSelectors = [
          '#landingImage',
          '#imgBlkFront',
          '#main-image',
          '#imgTagWrapperId img'
        ];
        for (const sel of mainImageSelectors){
          const el = document.querySelector(sel);
          if (el && el.src && !looksLikeLogo(el.src)) return abs(el.src);
        }

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
          if (content && !looksLikeLogo(content)){
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
          if (area > bestArea && w > 80 && h > 80 && img.src && !looksLikeLogo(img.src)){
            bestArea = area;
            best = img.src;
          }
        });
        return best ? abs(best) : null;
      }
    });
    return (frames && frames[0] && frames[0].result) || null;
  }

  // Storage/RAM capacity (e.g. "128GB", "8/256GB", "1TB") rarely appears in
  // a product page's title/snippet and only hurts the match score — strip it
  // for searching/matching while keeping the original title for the filename.
  const STORAGE_RE = /\b\d+(?:\s?\/\s?\d+)?\s?(?:GB|TB|MB)\b/gi;
  function stripStorage(title){
    const stripped = (title || '').replace(STORAGE_RE, ' ').replace(/\s+/g, ' ').trim();
    return stripped || title;
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
  function rankResults(title, results){
    return results
      .map((r, i) => ({r, i, score: similarity(title, (r.title || '') + ' ' + (r.snippet || ''))}))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map(x => x.r);
  }

  // A brand's Google-ranked "official" domain often differs from its name
  // (e.g. Xiaomi/Redmi/Poco phones are sold from mi.com, not xiaomi.com).
  const BRAND_DOMAIN_MAP = {
    xiaomi: ['xiaomi.com', 'mi.com'],
    redmi: ['mi.com', 'xiaomi.com'],
    poco: ['pocophone.com', 'mi.com', 'xiaomi.com'],
    mi: ['mi.com', 'xiaomi.com'],
    samsung: ['samsung.com'],
    apple: ['apple.com'],
    huawei: ['huawei.com', 'consumer.huawei.com'],
    oneplus: ['oneplus.com'],
    oppo: ['oppo.com'],
    vivo: ['vivo.com'],
    realme: ['realme.com'],
    sony: ['sony.com', 'electronics.sony.com'],
    lg: ['lg.com'],
    google: ['store.google.com', 'google.com'],
    motorola: ['motorola.com'],
    nokia: ['nokia.com'],
    asus: ['asus.com'],
    lenovo: ['lenovo.com'],
    hp: ['hp.com'],
    dell: ['dell.com'],
    nothing: ['nothing.tech'],
    dji: ['dji.com', 'store.dji.com'],
    gopro: ['gopro.com'],
    garmin: ['garmin.com', 'buy.garmin.com'],
    fitbit: ['fitbit.com'],
    jbl: ['jbl.com'],
    bose: ['bose.com'],
    anker: ['anker.com', 'us.anker.com'],
    logitech: ['logitech.com', 'logi.com'],
    razer: ['razer.com'],
    msi: ['msi.com'],
    acer: ['acer.com'],
    microsoft: ['microsoft.com'],
    surface: ['microsoft.com'],
    canon: ['canon.com', 'usa.canon.com'],
    nikon: ['nikon.com', 'nikonusa.com'],
    fujifilm: ['fujifilm.com'],
    sennheiser: ['sennheiser.com'],
    beats: ['beatsbydre.com', 'apple.com'],
    skullcandy: ['skullcandy.com'],
    ring: ['ring.com'],
    nest: ['store.google.com', 'nest.com'],
    philips: ['philips.com'],
    panasonic: ['panasonic.com'],
    tplink: ['tp-link.com'],
    netgear: ['netgear.com'],
    amazon: ['amazon.com'],
    kindle: ['amazon.com'],
    echo: ['amazon.com']
  };

  function brandToken(title){
    const w = wordSet(title);
    return w[0] || null;
  }

  function hostnameOf(url){
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e){ return ''; }
  }

  function isAmazon(hostname){
    return /(^|\.)amazon\.[a-z.]+$/i.test(hostname);
  }

  function isOfficialOrAmazon(url, brand){
    const hostname = hostnameOf(url);
    if (!hostname) return false;
    if (isAmazon(hostname)) return true;
    if (!brand) return false;
    const mapped = BRAND_DOMAIN_MAP[brand];
    if (mapped) return mapped.some(d => hostname === d || hostname.endsWith('.' + d));
    return hostname.includes(brand);
  }

  async function runSearchEngine(tabId, engineName, query){
    const engine = ENGINES[engineName];
    await navigateAndWait(tabId, engine.buildUrl(query), 20000);
    await delay(400); // small settle time in case of client-side render
    const blocked = await engine.isBlocked(tabId);
    if (blocked) return {results: [], blocked: true};
    const results = await engine.extract(tabId);
    return {results, blocked: false};
  }

  async function searchAndFetch(tabId, title, onVisit, primaryEngine){
    const notify = typeof onVisit === 'function' ? onVisit : () => {};
    // Search/match on the title with storage/RAM capacity stripped (e.g.
    // "128GB") — it rarely appears on the product page and only hurts
    // matching. The original title (with capacity) is still used for the
    // saved filename, elsewhere.
    const searchTitle = stripStorage(title);
    const q = encodeURIComponent(searchTitle);
    const primary = ENGINES[primaryEngine] ? primaryEngine : 'google';
    const fallback = primary === 'google' ? 'duckduckgo' : 'google';

    let { results, blocked } = await runSearchEngine(tabId, primary, q);
    if (blocked || !results.length){
      notify({url: null, imageUrl: null, note: `${primary} ${blocked ? 'appears blocked/CAPTCHA\'d' : 'returned no results'} — falling back to ${fallback}`});
      const retry = await runSearchEngine(tabId, fallback, q);
      results = retry.results;
    }
    if (!results.length) throw Object.assign(new Error('no organic result found on ' + primary + ' or ' + fallback), {stage:'search'});

    const ranked = rankResults(searchTitle, results);
    const brand = brandToken(searchTitle);
    const officialOnly = ranked.filter(r => isOfficialOrAmazon(r.href, brand));
    if (officialOnly.length){
      notify({url: null, imageUrl: null, note: `restricting to official/Amazon results: ${officialOnly.map(r => hostnameOf(r.href)).join(', ')}`});
    } else {
      notify({url: null, imageUrl: null, note: 'no official/Amazon result in top candidates — falling back to other results'});
    }
    const candidates = officialOnly.length ? officialOnly : ranked;
    let lastPageUrl = null;

    for (const candidate of candidates){
      let imageUrl;
      try {
        await navigateAndWait(tabId, candidate.href, 20000);
        imageUrl = await extractProductImage(tabId);
      } catch(err){
        notify({url: candidate.href, imageUrl: null});
        lastPageUrl = candidate.href;
        continue;
      }
      notify({url: candidate.href, imageUrl});
      lastPageUrl = candidate.href;
      if (imageUrl) return {imageUrl, pageUrl: candidate.href};
    }

    throw Object.assign(new Error('no product image found on ' + (candidates.length > 1 ? `${candidates.length} candidate pages` : lastPageUrl)), {stage:'image', pageUrl: lastPageUrl});
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
    const primaryEngine = getPrimaryEngine();
    cancelled = false;
    startBtn.disabled = true;
    cancelBtn.style.display = 'inline-block';
    progressWrap.classList.add('show');
    logWrap.classList.add('show');
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
          const {imageUrl, pageUrl} = await searchAndFetch(tab.id, item.title, ({url, imageUrl, note}) => {
            if (note) logLine('  ' + note);
            else logLine('  visited ' + url + '  →  image: ' + (imageUrl || 'none found'));
          }, primaryEngine);
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
