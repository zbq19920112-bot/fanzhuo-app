// Service Worker：让应用可安装、离线能打开外壳。
// 策略：HTML/JS 走「网络优先」（保证拿到最新部署），静态资源「缓存优先」。
const CACHE = 'fanzhuo-v15';
const SHELL = ['./index.html', './config.js', './dishes-data.js', './manifest.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // API 不缓存
  const isDoc = req.mode === 'navigate' || /\.(html|js)$/.test(url.pathname);
  if (isDoc) {
    e.respondWith(fetch(req).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r;
    })));
  }
});
