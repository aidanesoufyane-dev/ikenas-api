const admin = require('firebase-admin');

// Note: ensure process.env.FIREBASE_PRIVATE_KEY etc. are initialized in server.js
if (process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
  } catch (e) {
    if (!/already exists/.test(e.message)) console.error('Firebase init failed', e);
  }
}

// Intercept existing notify export
const fs = require('fs');
let notifyCode = fs.readFileSync('backend-demo/utils/notify.js', 'utf8');
if (!notifyCode.includes('firebase-admin')) {
  notifyCode = "const admin = require('firebase-admin');\n" +
  "if (process.env.FIREBASE_PROJECT_ID && !admin.apps.length) {\n" +
  "  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n') }) });\n" +
  "}\n" + notifyCode;

  notifyCode = notifyCode.replace(/await notification\.save\(\);/, "await notification.save();\n\n" +
  "  // Send FCM Push Notification\n" +
  "  try {\n" +
  "    const targetUser = await require('../models/User').findById(recipient);\n" +
  "    if (targetUser && targetUser.fcmTokens && targetUser.fcmTokens.length > 0 && admin.apps.length) {\n" +
  "      await admin.messaging().sendEachForMulticast({\n" +
  "        tokens: targetUser.fcmTokens,\n" +
  "        notification: { title: title || 'New Notification', body: message || '' },\n" +
  "        data: { link: link || '' }\n" +
  "      });\n" +
  "    }\n" +
  "  } catch (err) { console.error('FCM Error:', err); }\n");
  
  fs.writeFileSync('backend-demo/utils/notify.js', notifyCode);
}
console.log('Notify injected');
