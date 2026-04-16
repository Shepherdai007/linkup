// ══════════════════════════════════════════════════
//  LINKUP CHAT — Service Worker v4
//  Full FCM push + smart notification routing
//  KingsMakers · linkup-chat-8b593
//  Updated: Status, Edit, Link Preview, Emoji, Forward
// ══════════════════════════════════════════════════

var CACHE_NAME = 'linkup-v15';
var APP_URL    = 'https://shepherdai007.github.io/linkup/';

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
      return self.skipWaiting(); // activate immediately
    })
  );
});

// ── ACTIVATE: delete old caches (linkup-v1, v2, v3) ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      return self.clients.claim(); // take control of all open tabs
    })
  );
});

// ── FETCH: cache-first for app, pass-through for Firebase/APIs ──
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never intercept Firebase, Google APIs, or external fetch calls
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken') ||
    url.includes('gstatic.com') ||
    url.includes('allorigins.win') // link preview proxy
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve cached version + update in background (stale-while-revalidate)
        fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(function() {});
        return cached;
      }

      // Not cached — fetch from network
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        if (response.type === 'basic') {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback — serve app shell
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── PUSH: handle FCM server-sent push notifications ──
self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data = {};
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'LinkUp Chat', body: event.data.text() };
  }

  var isCall  = data.type === 'call';
  var title   = data.title || 'LinkUp Chat';
  var body    = data.body  || 'New message';
  var vibrate = isCall
    ? [400, 150, 400, 150, 400, 150, 400]  // urgent call ring
    : [200, 80, 200];                        // gentle message pulse

  var notifData = {
    type:     data.type     || 'message',
    chatId:   data.chatId   || '',
    groupId:  data.groupId  || '',
    collType: data.groupId  ? 'groups' : 'chats',
    callType: data.callType || 'audio',
    url:      APP_URL
  };

  var options = {
    body:               body,
    icon:               './icon-192.png',
    badge:              './icon-192.png',
    tag:                data.chatId || data.groupId || 'linkup-msg',
    renotify:           true,
    vibrate:            vibrate,
    silent:             false,
    requireInteraction: isCall, // call stays on screen until dismissed
    data:               notifData,
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Reject'  }
        ]
      : [
          { action: 'open', title: '💬 Open Chat' }
        ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var notifData = event.notification.data || {};
  var action    = event.action;

  // Reject call — just close, don't open app
  if (action === 'reject') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {

        // Find existing LinkUp tab
        var existingClient = null;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.url.includes('shepherdai007') || c.url.includes('linkup')) {
            existingClient = c;
            break;
          }
        }

        function sendToApp(client) {
          if (notifData.type === 'call') {
            client.postMessage({ type: 'CALL_CLICK', callType: notifData.callType });
          } else {
            client.postMessage({
              type:     'NOTIF_CLICK',
              chatId:   notifData.groupId || notifData.chatId,
              collType: notifData.collType || 'chats'
            });
          }
        }

        if (existingClient) {
          existingClient.focus();
          sendToApp(existingClient);
          return;
        }

        // Open new tab and send message after app loads
        return clients.openWindow(notifData.url || APP_URL).then(function(newClient) {
          if (!newClient) return;
          setTimeout(function() { sendToApp(newClient); }, 3000);
        });
      })
  );
});

// ── MESSAGE from main thread ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
