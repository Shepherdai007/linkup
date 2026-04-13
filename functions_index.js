// ══════════════════════════════════════════════════════════════
//  LINKUP CHAT — Cloud Functions
//  KingsMakers · linkup-chat-8b593
//  
//  DEPLOY: firebase deploy --only functions
// ══════════════════════════════════════════════════════════════

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();

const db        = admin.firestore();
const messaging = admin.messaging();

/* ──────────────────────────────────────────────────────────────
   FUNCTION 1: sendCallNotification
   Triggers when a new call_notification doc is created.
   Sends FCM to receiver — works even if app is FULLY CLOSED.
   Firestore path: call_notifications/{docId}
────────────────────────────────────────────────────────────── */
exports.sendCallNotification = functions.firestore
  .document('call_notifications/{docId}')
  .onCreate(async (snap, context) => {
    const callNotif = snap.data();
    if (!callNotif || !callNotif.to) {
      console.log('[FCM] No receiver in call_notification doc');
      return null;
    }

    const receiverId = callNotif.to;
    const callerId   = callNotif.from      || '';
    const callerName = callNotif.fromName  || 'Someone';
    const callId     = callNotif.callId    || '';
    const callType   = callNotif.callType  || 'audio';
    const isVideo    = callType === 'video';

    console.log('[FCM] Call from', callerName, 'to', receiverId);

    // Get receiver's FCM token from Firestore
    let receiverDoc;
    try {
      receiverDoc = await db.collection('users').doc(receiverId).get();
    } catch (err) {
      console.error('[FCM] Failed to get receiver doc:', err);
      return null;
    }

    if (!receiverDoc.exists) {
      console.log('[FCM] Receiver user doc not found:', receiverId);
      return null;
    }

    const token = receiverDoc.data().fcmToken;
    if (!token) {
      console.log('[FCM] Receiver has no FCM token:', receiverId);
      return null;
    }

    const title = isVideo ? 'Incoming Video Call' : 'Incoming Voice Call';
    const body  = callerName + ' is calling you...';

    const message = {
      token: token,

      // notification block — shows even if app is killed
      notification: {
        title: title,
        body:  body
      },

      // data block — available to SW onBackgroundMessage
      data: {
        type:       'call',
        callId:     callId,
        callerId:   callerId,
        callerName: callerName,
        callType:   callType
      },

      // Android — high priority so it wakes the device
      android: {
        priority: 'high',
        notification: {
          sound:      'default',
          channelId:  'linkup_calls',
          priority:   'max',
          visibility: 'public',
          // Notification actions
          actions: [
            { action: 'accept_call', title: 'Accept' },
            { action: 'reject_call', title: 'Reject'  }
          ]
        }
      },

      // Web push — high urgency + interaction required
      webpush: {
        headers: {
          Urgency: 'high',
          TTL:     '30'   // notification expires after 30s if not delivered
        },
        notification: {
          title:              title,
          body:               body,
          icon:               'https://shepherdai007.github.io/linkup/icon-192.png',
          badge:              'https://shepherdai007.github.io/linkup/icon-192.png',
          requireInteraction: true,
          vibrate:            [400, 150, 400, 150, 400, 150, 400],
          tag:                'call-' + callId,
          renotify:           true,
          actions: [
            { action: 'accept', title: 'Accept' },
            { action: 'reject', title: 'Reject'  }
          ]
        },
        fcmOptions: {
          link: 'https://shepherdai007.github.io/linkup/'
        }
      }
    };

    try {
      const response = await messaging.send(message);
      console.log('[FCM] Call notification sent successfully:', response);

      // Mark notification as sent
      await snap.ref.set({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error('[FCM] Send failed:', err.code, err.message);

      // If token is invalid/expired, remove it from user doc
      if (
        err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered'
      ) {
        console.log('[FCM] Removing invalid token for:', receiverId);
        await db.collection('users').doc(receiverId)
          .set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true })
          .catch(() => {});
      }
    }

    return null;
  });


/* ──────────────────────────────────────────────────────────────
   FUNCTION 2: sendMessageNotification
   Triggers when a new message is added to any chat.
   Sends FCM to the other participant.
   Firestore path: chats/{chatId}/messages/{msgId}
────────────────────────────────────────────────────────────── */
exports.sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg    = snap.data();
    const chatId = context.params.chatId;
    if (!msg || !msg.senderId) return null;

    // Get chat doc to find the other participant
    let chatDoc;
    try {
      chatDoc = await db.collection('chats').doc(chatId).get();
    } catch (err) { return null; }

    if (!chatDoc.exists) return null;
    const participants = chatDoc.data().participants || [];

    // Find receiver (the one who is NOT the sender)
    const receiverId = participants.find(function(uid) { return uid !== msg.senderId; });
    if (!receiverId) return null;

    // Get receiver's FCM token
    let receiverDoc;
    try {
      receiverDoc = await db.collection('users').doc(receiverId).get();
    } catch (err) { return null; }

    if (!receiverDoc.exists) return null;
    const token = receiverDoc.data().fcmToken;
    if (!token) return null;

    // Build notification body
    const senderName = msg.senderName || 'Someone';
    let   body       = msg.text       || '';
    if (msg.type === 'image') body = 'Sent a photo';
    if (msg.type === 'audio') body = 'Sent a voice note';
    if (msg.type === 'file')  body = 'Sent a file: ' + (msg.fileName || '');
    if (body.length > 100) body = body.substring(0, 100) + '...';

    const message = {
      token: token,
      notification: {
        title: senderName,
        body:  body || 'New message'
      },
      data: {
        type:    'message',
        chatId:  chatId,
        groupId: ''
      },
      webpush: {
        headers: { Urgency: 'normal' },
        notification: {
          icon:  'https://shepherdai007.github.io/linkup/icon-192.png',
          badge: 'https://shepherdai007.github.io/linkup/icon-192.png',
          tag:   'chat-' + chatId,
          renotify: true
        },
        fcmOptions: {
          link: 'https://shepherdai007.github.io/linkup/'
        }
      }
    };

    try {
      await messaging.send(message);
      console.log('[FCM] Message notification sent to:', receiverId);
    } catch (err) {
      console.error('[FCM] Message notification failed:', err.message);
      if (
        err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered'
      ) {
        await db.collection('users').doc(receiverId)
          .set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true })
          .catch(() => {});
      }
    }

    return null;
  });


/* ──────────────────────────────────────────────────────────────
   FUNCTION 3: cleanupExpiredCallNotifications
   Runs every hour — deletes call_notifications older than 1 min
   (calls expire fast, no need to keep old docs)
────────────────────────────────────────────────────────────── */
exports.cleanupExpiredCallNotifications = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const oneMinAgo = new Date(Date.now() - 60 * 1000);
    const old = await db.collection('call_notifications')
      .where('timestamp', '<', oneMinAgo)
      .get();

    const batch = db.batch();
    old.docs.forEach(function(doc) { batch.delete(doc.ref); });

    if (old.docs.length > 0) {
      await batch.commit();
      console.log('[Cleanup] Deleted', old.docs.length, 'old call notifications');
    }

    return null;
  });
