// ══════════════════════════════════════════════════════════════
//  LINKUP CHAT — Firebase Messaging Service Worker
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
// This fires when the app is in background OR completely closed
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM-SW] Background/killed message received:', payload);

  var data   = payload.data        || {};
  var notif  = payload.notification || {};
  var isCall = data.type === 'call';

  var title = notif.title
    || (isCall
      ? (data.callType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call')
      : 'LinkUp Chat');

  var body  = notif.body
    || (isCall
      ? (data.callerName || 'Someone') + ' is calling you...'
      : 'You have a new message');

  var options = {
    body:               body,
    icon:               '/linkup/icon-192.png',
    badge:              '/linkup/icon-192.png',
    tag:                isCall ? 'call-' + (data.callId || 'inc') : 'msg-' + Date.now(),
    renotify:           true,
    requireInteraction: isCall,   // call stays on screen, message auto-dismisses
    vibrate:            isCall
      ? [400, 150, 400, 150, 400, 150, 400]  // urgent ring for calls
      : [200, 80, 200],                        // gentle pulse for messages
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
    // Action buttons
    actions: isCall
      ? [
          { action: 'accept', title: 'Accept' },
          { action: 'reject', title: 'Reject'  }
        ]
      : [
          { action: 'open', title: 'Open Chat' }
        ]
  };

  return self.registration.showNotification(title, options);
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var data   = event.notification.data || {};
  var action = event.action;

  // Reject call — just close, don't open app
  if (action === 'reject') {
    console.log('[FCM-SW] Call rejected from notification.');
    return;
  }

  // Accept call or open chat — open/focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {

        // Try to find an existing LinkUp tab
        var existing = null;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.url.includes('shepherdai007') || c.url.includes('linkup')) {
            existing = c; break;
          }
        }

        function sendToApp(client) {
          if (data.type === 'call') {
            // Tell the app to show the incoming call screen
            client.postMessage({
              type:       'CALL_CLICK',
              callId:     data.callId,
              callerId:   data.callerId,
              callerName: data.callerName,
              callType:   data.callType,
              action:     action  // 'accept' or ''
            });
          } else {
            // Tell the app to open the relevant chat
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

        // No existing tab — open a new one then send message after load
        return clients.openWindow(data.url || APP_URL).then(function(newClient) {
          if (!newClient) return;
          // Wait for app to fully load before sending the message
          setTimeout(function() { sendToApp(newClient); }, 3500);
        });
      })
  );
});

// ── MESSAGE from main thread (e.g. SKIP_WAITING) ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[FCM-SW] firebase-messaging-sw.js loaded — version 1.0');
