/* ADYÜ Mobil PWA — Service Worker */

const CACHE_NAME = 'adyu-mobil-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/img/logo-round.png',
  '/icons/icon-maskable-192.png'
];

// Kurulum — statik dosyaları önbelleğe al
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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

// Fetch — önce önbellek, yoksa ağdan al
self.addEventListener('fetch', event => {
  // Sadece GET isteklerini önbelleğe al
  if (event.request.method !== 'GET') return;

  // API ve yönetici paneli her zaman ağdan gelsin
  const { pathname } = new URL(event.request.url);
  if (pathname.startsWith('/api/') || pathname.startsWith('/admin')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Geçerli yanıtları önbelleğe al
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline durumda ana sayfayı göster
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
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
    badge: '/icons/icon-192.png',
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
