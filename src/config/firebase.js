const fs = require("fs");
const path = require("path");

let admin = null;
let initialized = false;
let initError = null;

function isEnabled() {
  const flag = String(process.env.FIREBASE_ENABLED || "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") {
    return false;
  }
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
}

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline && String(inline).trim()) {
    try {
      return JSON.parse(inline);
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON: ${err.message}`);
    }
  }

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!filePath || !String(filePath).trim()) {
    return null;
  }

  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Firebase service account file not found: ${resolved}`);
  }

  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (err) {
    throw new Error(`Failed to read Firebase service account file: ${err.message}`);
  }
}

function getFirebaseAdmin() {
  if (!isEnabled()) {
    return null;
  }

  if (initialized) {
    if (initError) {
      throw initError;
    }
    return admin;
  }

  initialized = true;

  try {
    // eslint-disable-next-line global-require
    const firebaseAdmin = require("firebase-admin");

    if (firebaseAdmin.apps.length > 0) {
      admin = firebaseAdmin;
      return admin;
    }

    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      initError = new Error("Firebase service account not configured");
      return null;
    }

    const options = {
      credential: firebaseAdmin.credential.cert(serviceAccount)
    };

    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    if (databaseURL && String(databaseURL).trim()) {
      options.databaseURL = String(databaseURL).trim();
    }

    firebaseAdmin.initializeApp(options);
    admin = firebaseAdmin;
    console.log("[FIREBASE] Admin SDK initialized");
    return admin;
  } catch (err) {
    initError = err;
    console.warn("[FIREBASE] Initialization failed:", err.message);
    return null;
  }
}

function isFirebaseConfigured() {
  try {
    return Boolean(getFirebaseAdmin());
  } catch {
    return false;
  }
}

function getMessaging() {
  const firebaseAdmin = getFirebaseAdmin();
  if (!firebaseAdmin) {
    return null;
  }
  return firebaseAdmin.messaging();
}

function getFirestore() {
  const firebaseAdmin = getFirebaseAdmin();
  if (!firebaseAdmin) {
    return null;
  }
  return firebaseAdmin.firestore();
}

module.exports = {
  isEnabled,
  isFirebaseConfigured,
  getFirebaseAdmin,
  getMessaging,
  getFirestore,
  loadServiceAccount
};
