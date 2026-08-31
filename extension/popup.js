document.getElementById('openApp').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  window.close();
});
document.getElementById('openSearch').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
  window.close();
});
