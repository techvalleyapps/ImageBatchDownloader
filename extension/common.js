// Shared helpers used by both app.js (sheet -> direct URLs) and search.js
// (title -> Google search -> product image). Loaded as a plain script, not
// a module, so everything hangs off the window.IBD namespace.
(function(){
  const FETCH_TIMEOUT_MS = 20000;

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }

  function simplifyDomain(host){
    host = host.replace(/^www\./,'').replace(/^assets\./,'');
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const twoLetterCc = /^[a-z]{2}$/i;
    if (parts.length >= 3 && twoLetterCc.test(parts[parts.length-1]) && /^(co|com|net|org)$/i.test(parts[parts.length-2])){
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
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

  async function fetchWithTimeout(url){
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // Extension pages carry host_permissions for http(s)://*/*, so this
      // reads the full cross-origin response regardless of CORS headers.
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

  function csvField(s){
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }

  function buildManualCsv(failures){
    const lines = ['Title,URL'];
    failures.forEach(f => lines.push(csvField(f.title) + ',' + csvField(f.url || '')));
    return lines.join('\r\n');
  }

  function buildManualHtml(failures){
    const rowsHtml = failures.map((f, i) => `
        <tr>
          <td class="n">${i + 1}</td>
          <td class="t">${escapeHtml(f.title)}</td>
          <td class="d">${escapeHtml(f.domain || (f.reason ? f.reason : ''))}</td>
          <td class="a">${f.url ? `<a href="${escapeAttr(f.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}</td>
        </tr>`).join('');
    const dataJson = JSON.stringify(failures.map(f => f.url).filter(Boolean));
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
  <p class="sub">These couldn't be fetched automatically — usually a store product page rather than a direct image file, a dead link, or (for the search tool) nothing was found. Click a link below to open it, or use "Open all" to open every link in its own tab.</p>
  <div class="actions">
    <button id="openAllBtn" type="button">Open all in new tabs</button>
    <button id="csvBtn" type="button" class="secondary">Download as CSV</button>
  </div>
  <table>
    <thead><tr><th></th><th>Title</th><th>Domain / reason</th><th></th></tr></thead>
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
        const link = tr.querySelector('td.a a');
        const url = link ? link.href : '';
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

  window.IBD = {
    FETCH_TIMEOUT_MS, escapeHtml, escapeAttr, simplifyDomain,
    extFromContentType, extFromUrl, sanitize, uniqueName,
    fetchWithTimeout, fetchImage, triggerDownload,
    csvField, buildManualCsv, buildManualHtml
  };
})();
