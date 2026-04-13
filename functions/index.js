// ══════════════════════════════════════════════════════════════
//  LINKUP CHAT — Cloud Functions (FIXED VERSION)
// ══════════════════════════════════════════════════════════════

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

/* ─────────────────────────────────────────────
   FUNCTION 1: sendCallNotification
───────────────────────────────────────────── */
exports.sendCallNotification = functions.firestore
  .document('call_notifications/{docId}')
  .onCreate(async (snap, context) => {
    const callNotif = snap.data();
    if (!callNotif || !callNotif.to) return null;

    const receiverId = callNotif.to;
    const callerId   = callNotif.from || '';
    const callerName = callNotif.fromName || 'Someone';
    const callId     = callNotif.callId || '';
    const callType   = callNotif.callType || 'audio';
    const isVideo    = callType === 'video';

    let receiverDoc;
    try {
      receiverDoc = await db.collection('users').doc(receiverId).get();
    } catch (err) {
      console.error(err);
      return null;
    }

    if (!receiverDoc.exists) return null;

    const token = receiverDoc.data().fcmToken;
    if (!token) return null;

    const title = isVideo ? 'Incoming Video Call' : 'Incoming Voice Call';
    const body  = `${callerName} is calling you...`;

    const message = {
      token,

      notification: {
        title,
        body
      },

      data: {
        type: 'call',
        callId,
        callerId,
        callerName,
        callType
      },

      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'linkup_calls',
          visibility: 'public'
        }
      },

      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          requireInteraction: true,
          vibrate: [400, 150, 400]
        },
        fcmOptions: {
          link: 'https://shepherdai007.github.io/linkup/'
        }
      }
    };

    try {
      await messaging.send(message);
      console.log('Call sent to:', receiverId);
    } catch (err) {
      console.error(err);
    }

    return null;
  });

/* ─────────────────────────────────────────────
   FUNCTION 2: sendMessageNotification
───────────────────────────────────────────── */
exports.sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data();
    const chatId = context.params.chatId;
    if (!msg || !msg.senderId) return null;

    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return null;

    const participants = chatDoc.data().participants || [];
    const receiverId = participants.find(id => id !== msg.senderId);
    if (!receiverId) return null;

    const receiverDoc = await db.collection('users').doc(receiverId).get();
    if (!receiverDoc.exists) return null;

    const token = receiverDoc.data().fcmToken;
    if (!token) return null;

    let body = msg.text || 'New message';
    if (msg.type === 'image') body = 'Sent a photo';
    if (msg.type === 'audio') body = 'Sent a voice note';
    if (msg.type === 'file') body = 'Sent a file';

    await messaging.send({
      token,
      notification: {
        title: msg.senderName || 'Someone',
        body
      },
      data: {
        type: 'message',
        chatId
      }
    });

    return null;
  });

/* ─────────────────────────────────────────────
   FUNCTION 3: cleanupExpiredCallNotifications
───────────────────────────────────────────── */
exports.cleanupExpiredCallNotifications = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const oneMinAgo = new Date(Date.now() - 60 * 1000);

    const old = await db.collection('call_notifications')
      .where('timestamp', '<', oneMinAgo)
      .get();

    const batch = db.batch();
    old.forEach(doc => batch.delete(doc.ref));

    if (!old.empty) {
      await batch.commit();
      console.log('Deleted expired calls:', old.size);
    }

    return null;
  });