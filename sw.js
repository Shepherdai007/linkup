// ══════════════════════════════════════════════════════════════
//  LINKUP CHAT — Service Worker v48
//  Background FCM + Wake-up calls + Smart caching
//  KingsMakers · linkup-chat-8b593
// ══════════════════════════════════════════════════════════════

// ── 1. FIREBASE MESSAGING (must be FIRST — before any other logic) ──
// importScripts must be at the top level
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ── 2. YOUR FIREBASE CONFIG ──
// ⚠️  These match your project linkup-chat-8b593
firebase.initializeApp({
  apiKey:            "AIzaSyB2onIwFeuDxo5ILqx0DvVgaGXo0yLRfAg",
  authDomain:        "linkup-chat-8b593.firebaseapp.com",
  projectId:         "linkup-chat-8b593",
  storageBucket:     "linkup-chat-8b593.firebasestorage.app",
  messagingSenderId: "787859584741",
  appId:             "1:787859584741:web:a8e74686d6ceddc431860c"
});

const messaging = firebase.messaging();

// ── 3. CACHE CONFIG ──
var CACHE_NAME = 'linkup-v48';
var APP_URL    = 'https://shepherdai007.github.io/linkup/';

var PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── 4. INSTALL — cache app shell immediately ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installing v34...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Cache miss:', url, err.message);
          });
        })
      );
    }).then(function() {
      console.log('[SW] Install complete — skipping waiting');
      return self.skipWaiting();
    })
  );
});

// ── 5. ACTIVATE — delete ALL old caches ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating v34 — clearing old caches...');
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
      console.log('[SW] Now controlling all clients');
      return self.clients.claim();
    })
  );
});

// ── 6. FETCH — stale-while-revalidate, pass-through Firebase ──
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never intercept Firebase/Google/external API calls
  if (
    url.includes('firestore.googleapis.com')  ||
    url.includes('firebase.googleapis.com')   ||
    url.includes('firebasestorage.googleapis') ||
    url.includes('firebaseapp.com')            ||
    url.includes('googleapis.com')             ||
    url.includes('identitytoolkit')            ||
    url.includes('securetoken')                ||
    url.includes('gstatic.com')                ||
    url.includes('allorigins.win')             ||
    url.includes('mymemory.translated.net')    ||
    url.includes('giphy.com')                  ||
    url.includes('google.com/maps')
  ) {
    return; // let browser handle directly
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      // Stale-while-revalidate: serve cache instantly, refresh in background
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

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        if (response.type === 'basic') {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, toCache);
          });
        }
        return response;
      }).catch(function() {
        // Offline — serve app shell for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── 7. BACKGROUND FCM — the "wake up phone" magic ──
// This fires when the app is CLOSED or in background
// Firebase SDK handles this automatically via onBackgroundMessage
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message received:', payload);

  var data    = payload.data || payload.notification || {};
  var isCall  = data.type === 'call' || data.type === 'INCOMING_CALL';
  var title   = data.title || (isCall ? '📞 Incoming Call' : 'LinkUp Chat');
  var body    = data.body  || (isCall ? 'Tap to answer' : 'New message');

  var vibrate = isCall
    ? [400, 150, 400, 150, 400, 150, 400, 150, 400]  // urgent ring pattern
    : [200, 80, 200];                                   // gentle pulse

  var notifOptions = {
    body:               body,
    icon:               './icon-192.png',
    badge:              './icon-192.png',
    tag:                (data.chatId || data.groupId || 'linkup') + '-' + Date.now(),
    renotify:           true,
    vibrate:            vibrate,
    silent:             false,
    requireInteraction: isCall, // stays on screen (doesn't auto-dismiss)
    data: {
      type:     data.type     || 'message',
      chatId:   data.chatId   || '',
      groupId:  data.groupId  || '',
      callType: data.callType || 'audio',
      fromUid:  data.fromUid  || '',
      url:      APP_URL
    },
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Decline' }
        ]
      : [
          { action: 'open', title: '💬 Open Chat' }
        ]
  };

  return self.registration.showNotification(title, notifOptions);
});

// ── 8. FOREGROUND PUSH (fallback for browsers without FCM SDK support) ──
self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data = {};
  try   { data = event.data.json(); }
  catch (e) { data = { title: 'LinkUp Chat', body: event.data.text() }; }

  var isCall  = data.type === 'call' || data.type === 'INCOMING_CALL';
  var title   = data.title || (isCall ? '📞 Incoming Call' : 'LinkUp Chat');
  var body    = data.body  || 'New message';
  var vibrate = isCall ? [400, 150, 400, 150, 400] : [200, 80, 200];

  event.waitUntil(
    self.registration.showNotification(title, {
      body:               body,
      icon:               './icon-192.png',
      badge:              './icon-192.png',
      tag:                (data.chatId || 'linkup') + '-' + Date.now(),
      renotify:           true,
      vibrate:            vibrate,
      requireInteraction: isCall,
      silent:             false,
      data: {
        type:     data.type     || 'message',
        chatId:   data.chatId   || '',
        groupId:  data.groupId  || '',
        callType: data.callType || 'audio',
        url:      APP_URL
      },
      actions: isCall
        ? [{ action: 'accept', title: '✅ Accept' }, { action: 'reject', title: '❌ Decline' }]
        : [{ action: 'open',   title: '💬 Open Chat' }]
    })
  );
});

// ── 9. NOTIFICATION CLICK ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var notifData = event.notification.data || {};
  var action    = event.action;

  // Decline button — just close, don't open app
  if (action === 'reject') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {

        // Find existing open LinkUp tab
        var existing = null;
        for (var i = 0; i < clientList.length; i++) {
          if (clientList[i].url.includes('shepherdai007') ||
              clientList[i].url.includes('linkup')) {
            existing = clientList[i];
            break;
          }
        }

        function sendMsg(client) {
          if (notifData.type === 'call' || notifData.type === 'INCOMING_CALL') {
            client.postMessage({
              type:     'CALL_CLICK',
              callType: notifData.callType || 'audio',
              fromUid:  notifData.fromUid  || ''
            });
          } else {
            client.postMessage({
              type:     'NOTIF_CLICK',
              chatId:   notifData.groupId || notifData.chatId,
              collType: notifData.groupId ? 'groups' : 'chats'
            });
          }
        }

        if (existing) {
          // App is open — focus it and send message
          return existing.focus().then(function() {
            sendMsg(existing);
          });
        }

        // App is closed — open it then send message after load
        return clients.openWindow(notifData.url || APP_URL).then(function(newClient) {
          if (!newClient) return;
          setTimeout(function() { sendMsg(newClient); }, 3000);
        });
      })
  );
});

// ── 10. MESSAGE from app (skip waiting, etc.) ──
self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
