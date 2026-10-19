/* ADYÜ Mobil PWA — Service Worker */

const CACHE_NAME = 'adyu-mobil-v25';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-96.png',
  '/img/logo.png'
];

// Kurulum — statik dosyaları önbelleğe al
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

// Aktivasyon — eski önbellekleri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — önce ağ (her zaman güncel sürüm), bağlantı yoksa önbellek
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // API ve yönetici paneli her zaman ağdan gelsin
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // Çevrimdışı: ana sayfayı göster
      if (event.request.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    })
  );
});

// Push Bildirimleri — yönetici panelinden gönderilir
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'Turizm Fakültesi';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png', // Android yalnızca şeklini (saydamlık) kullanır
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
