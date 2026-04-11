// ══════════════════════════════════════════════════
//  LINKUP CHAT — Service Worker
//  Cache-first for assets, network-first for Firebase
//  KingsMakers · v1.0
// ══════════════════════════════════════════════════

var CACHE_NAME = 'linkup-v1';

// Assets to cache on install (app shell)
var PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── INSTALL: pre-cache the app shell ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching app shell');
      // Cache what we can — don't fail install if font CDN is unavailable
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err.message);
          });
        })
      );
    }).then(function() {
      // Activate immediately without waiting for old SW to die
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH: smart routing strategy ──
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never intercept Firebase requests — always go to network
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com/storage') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken')
  ) {
    return; // Let Firebase handle its own requests
  }

  // For our own assets: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Return cached version, but update cache in background
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var toCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, toCache);
            });
          }
          return response;
        }).catch(function() { /* offline — cached version already returned */ });
        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        // Only cache same-origin and basic responses
        if (response.type === 'basic' || event.request.url.startsWith(self.location.origin)) {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, toCache);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback — return cached index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS (future-ready, no-op for now) ──
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  self.registration.showNotification(data.title || 'LinkUp Chat', {
    body:  data.body  || 'New message',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    tag:   'linkup-message',
    renotify: true,
    data: { url: data.url || './' }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
