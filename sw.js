// ══════════════════════════════════════════════════
//  LINKUP CHAT — Service Worker v3
//  Full FCM push + smart notification routing
//  KingsMakers · linkup-chat-8b593
// ══════════════════════════════════════════════════

var CACHE_NAME = 'linkup-v3';
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

  // Never intercept Firebase / Google requests
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
        // Serve from cache + update in background
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

// ── PUSH: handle FCM server-sent push notifications ──
self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data = {};
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'LinkUp Chat', body: event.data.text() };
  }

  var isCall    = data.type === 'call';
  var title     = data.title || 'LinkUp Chat';
  var body      = data.body  || 'New message';
  var icon      = './icon-192.png';
  var badge     = './icon-192.png';
  var tag       = data.chatId || data.groupId || 'linkup-msg';
  var vibrate   = isCall
    ? [400, 150, 400, 150, 400, 150, 400]  // urgent ring for calls
    : [200, 80, 200];                        // gentle pulse for messages

  var notifData = {
    type:     data.type || 'message',
    chatId:   data.chatId   || '',
    groupId:  data.groupId  || '',
    collType: data.groupId  ? 'groups' : 'chats',
    callType: data.callType || 'audio',
    url:      APP_URL
  };

  var options = {
    body:               body,
    icon:               icon,
    badge:              badge,
    tag:                tag,
    renotify:           true,
    vibrate:            vibrate,
    silent:             false,
    requireInteraction: isCall, // call notifications stay until dismissed
    data:               notifData,
    // Action buttons
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Reject'  }
        ]
      : [
          { action: 'open',   title: '💬 Open Chat' }
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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {

        // Try to find existing LinkUp tab
        var existingClient = null;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.url.includes('shepherdai007') || c.url.includes('linkup')) {
            existingClient = c;
            break;
          }
        }

        function sendMsg(client) {
          if (notifData.type === 'call') {
            // For call notifications — just focus app, call UI handles itself
            client.postMessage({ type: 'CALL_CLICK', callType: notifData.callType });
          } else {
            // For message notifications — open the right chat
            client.postMessage({
              type:     'NOTIF_CLICK',
              chatId:   notifData.groupId || notifData.chatId,
              collType: notifData.collType || 'chats'
            });
          }
        }

        if (existingClient) {
          existingClient.focus();
          sendMsg(existingClient);
          return;
        }

        // No existing tab — open new one
        return clients.openWindow(notifData.url || APP_URL).then(function(newClient) {
          if (!newClient) return;
          // Wait a moment for the app to load then send the message
          setTimeout(function() { sendMsg(newClient); }, 3000);
        });
      })
  );
});

// ── NOTIFICATION ACTION CLICK (Accept/Reject call buttons) ──
self.addEventListener('notificationclick', function(event) {
  // This duplicate handler catches action button clicks
  if (!event.action) return;
  event.notification.close();

  if (event.action === 'reject') {
    // Don't open app — just close the notification
    return;
  }
  // 'accept' or 'open' — fall through to main handler above
});

// ── MESSAGE from main thread ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
