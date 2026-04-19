// ══════════════════════════════════════════════════════════════
//  LINKUP CHAT — Firebase Messaging Service Worker v42
//  Handles FCM push notifications when app is FULLY CLOSED
//  KingsMakers · linkup-chat-8b593
// ══════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

var APP_URL = 'https://shepherdai007.github.io/linkup/';

firebase.initializeApp({
  apiKey:            'AIzaSyB2onIwFeuDxo5ILqx0DvVgaGXo0yLRfAg',
  authDomain:        'linkup-chat-8b593.firebaseapp.com',
  projectId:         'linkup-chat-8b593',
  storageBucket:     'linkup-chat-8b593.firebasestorage.app',
  messagingSenderId: '787859584741',
  appId:             '1:787859584741:web:a8e74686d6ceddc431860c'
});

const messaging = firebase.messaging();

// ── BACKGROUND + KILLED STATE message handler ──
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM-SW] Background message received:', payload);

  var data   = payload.data        || {};
  var notif  = payload.notification || {};
  var isCall = data.type === 'call' || data.type === 'INCOMING_CALL';

  var title = notif.title
    || (isCall
      ? (data.callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Voice Call')
      : 'LinkUp Chat');

  var body = notif.body
    || (isCall
      ? (data.callerName || 'Someone') + ' is calling you...'
      : data.body || 'You have a new message');

  // ── KEY FIX: unique tag every time so cleared notifications always reappear ──
  var uniqueTag = isCall
    ? 'call-' + (data.callId || Date.now())
    : 'msg-' + (data.chatId || '') + '-' + Date.now();

  var options = {
    body:               body,
    icon:               '/linkup/icon-192.png',
    badge:              '/linkup/icon-192.png',
    tag:                uniqueTag,     // unique = always shows
    renotify:           true,          // forces sound/vibration every time
    requireInteraction: isCall,
    vibrate:            isCall
      ? [400, 150, 400, 150, 400, 150, 400]
      : [200, 80, 200],
    silent:             false,
    data: {
      type:       data.type       || 'message',
      callId:     data.callId     || '',
      callerId:   data.callerId   || '',
      callerName: data.callerName || '',
      callType:   data.callType   || 'audio',
      chatId:     data.chatId     || '',
      groupId:    data.groupId    || '',
      url:        APP_URL
    },
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Reject'  }
        ]
      : [
          { action: 'open', title: '💬 Open Chat' }
        ]
  };

  return self.registration.showNotification(title, options);
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var data   = event.notification.data || {};
  var action = event.action;

  if (action === 'reject') {
    console.log('[FCM-SW] Call rejected from notification.');
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        var existing = null;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.url.includes('shepherdai007') || c.url.includes('linkup')) {
            existing = c; break;
          }
        }

        function sendToApp(client) {
          if (data.type === 'call' || data.type === 'INCOMING_CALL') {
            client.postMessage({
              type:       'CALL_CLICK',
              callId:     data.callId,
              callerId:   data.callerId,
              callerName: data.callerName,
              callType:   data.callType,
              action:     action
            });
          } else {
            client.postMessage({
              type:     'NOTIF_CLICK',
              chatId:   data.groupId || data.chatId,
              collType: data.groupId ? 'groups' : 'chats'
            });
          }
        }

        if (existing) {
          existing.focus();
          sendToApp(existing);
          return;
        }

        return clients.openWindow(data.url || APP_URL).then(function(newClient) {
          if (!newClient) return;
          setTimeout(function() { sendToApp(newClient); }, 3500);
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

console.log('[FCM-SW] firebase-messaging-sw.js v42 loaded');
