// ---------------------------------------------------------------------------
// App configuration.
//
// MODE:
//   "demo"     -> everything is stored in this browser only (localStorage).
//                 No setup required. Good for trying the app out, but data
//                 does NOT sync between devices and is lost if you clear
//                 your browser data.
//   "firebase" -> real cloud database (Firestore), works offline and syncs
//                 automatically, supports multiple staff logins.
//                 Requires the config below to be filled in -- see
//                 FIREBASE_SETUP.md for step-by-step instructions.
//
// You can switch modes any time by changing APP_MODE and reloading.
// ---------------------------------------------------------------------------

export const APP_MODE = "demo"; // "demo" | "firebase"

export const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// EmailJS is used to email receipts to customers without needing a mail
// server. See FIREBASE_SETUP.md for how to get these three values (all free).
export const EMAILJS_CONFIG = {
  publicKey: "REPLACE_ME",
  serviceId: "REPLACE_ME",
  templateId: "REPLACE_ME",
};

export const APP_NAME = "Big Screen Collectables";
export const DEFAULT_EVENT_NAME = "Home Store";
