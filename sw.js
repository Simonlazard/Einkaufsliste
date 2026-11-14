/* Service Worker: macht die App offline nutzbar.
 * WICHTIG: Bei jeder Änderung an der App VERSION erhöhen (und in app.js APP_VERSION),
 * sonst zeigt das iPhone weiter die alte Version aus dem Cache. */
const VERSION = '2.2.0';
const CACHE = 'einkaufsliste-' + VERSION;
// Die großen Erkennungsdateien (ca. 10 MB) liegen in einem eigenen Cache, der Updates überlebt
// und erst beim ersten Foto gefüllt wird.
const OCR_CACHE = 'einkaufsliste-ocr-1';
const FILES = [
  './',
  './index.html',
  './style.css',
  './zutaten.js',
  './icons.js',
  './core.js',
  './ocr.js',
  './app.js',
  './lib/tesseract/tesseract.min.js',
  './lib/jsQR.js',
  './lib/qrcode.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('einkaufsliste-') && k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isOcr = new URL(req.url).pathname.includes('/lib/tesseract/') && !req.url.endsWith('tesseract.min.js');
  if (isOcr) {
    event.respondWith(
      caches.open(OCR_CACHE).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }))),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req)),
  );
});
