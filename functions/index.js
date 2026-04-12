const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendPushNotification = functions.firestore
  .onDocumentCreated("messages/{messageId}", async (event) => {
    const msg = event.data.data();

    if (!msg) return;

    const receiverId = msg.to;
    const senderName = msg.senderName || "Someone";
    const text = msg.text || "New message";

    const userDoc = await admin.firestore()
      .collection("users")
      .doc(receiverId)
      .get();

    if (!userDoc.exists) return;

    const token = userDoc.data().fcmToken;
    if (!token) return;

    const payload = {
      token: token,
      notification: {
        title: senderName,
        body: text
      },
      data: {
        type: msg.type || "message"
      },
      android: {
        priority: "high"
      },
      webpush: {
        headers: { Urgency: "high" }
      }
    };

    try {
      await admin.messaging().send(payload);
      console.log("Notification sent to", receiverId);
    } catch (e) {
      console.error(e);
    }
  });