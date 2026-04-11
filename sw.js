// ══════════════════════════════════════════════════
//  LINKUP CHAT — Service Worker v2
//  Cache-first · Notification click handler
//  KingsMakers · linkup-chat-8b593
// ══════════════════════════════════════════════════

var CACHE_NAME = 'linkup-v2';

var PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err.message);
          });
        })
      );
    }).then(function() {
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
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: cache-first for app assets, pass-through for Firebase ──
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never intercept Firebase / Google API requests
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken') ||
    url.includes('gstatic.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(function() {});
        return cached;
      }
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        if (response.type === 'basic') {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function() {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── PUSH: handle server-sent push (FCM, future use) ──
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = {};
  try { data = event.data.json(); } catch(e) { data = { body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'LinkUp Chat', {
      body:     data.body || 'New message',
      icon:     './icon-192.png',
      badge:    './icon-192.png',
      tag:      data.chatId || 'linkup',
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: data.url || './', chatId: data.chatId || '' }
    })
  );
});

// ── NOTIFICATION CLICK: focus/open the app ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes('linkup') || client.url.includes('shepherdai007')) {
            client.focus();
            if (event.notification.data && event.notification.data.chatId) {
              client.postMessage({
                type:   'NOTIF_CLICK',
                chatId: event.notification.data.chatId
              });
            }
            return;
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// ── MESSAGE from main thread ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
