// Service Worker for GreenMaster AI Lawn Care App
const CACHE_NAME = 'greenmaster-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/storage.js',
  './js/notifications.js',
  './js/weather-engine.js',
  './js/vision-engine.js',
  './js/planner-engine.js',
  './js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Cache best effort
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Never intercept non-GET or /api/ function calls
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }
  // Let network take precedence, fall back to cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Listen for push notifications
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'GreenMaster Reminder', body: 'Time for your lawn checkup!' };
  const options = {
    body: data.body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23059669"/><path d="M50 20 L65 70 L35 70 Z" fill="%23fff"/></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23059669"/></svg>',
    vibrate: [200, 100, 200],
    data: {
      url: './index.html'
    }
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
