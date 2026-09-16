const { getFirestore, getFirebaseAdmin, isFirebaseConfigured } = require("../config/firebase");

const DEFAULT_COLLECTION = "cmsusernotifications";
const MAX_PAGE_SIZE = 100;
const BATCH_SIZE = 500;

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function collectionName() {
  return String(process.env.FIREBASE_NOTIFICATIONS_COLLECTION || DEFAULT_COLLECTION).trim();
}

function firestoreUnavailableError() {
  const err = new Error("Firebase Firestore is not configured");
  err.status = 503;
  return err;
}

function extractFirestoreIndexUrl(message) {
  const match = String(message || "").match(/https:\/\/console\.firebase\.google\.com[^\s)]+/);
  return match ? match[0] : null;
}

function rethrowFirestoreIndexError(err) {
  const message = String(err?.message || err || "");
  const isIndexError =
    err?.code === 9 ||
    /FAILED_PRECONDITION/i.test(message) ||
    /requires an index/i.test(message);

  if (!isIndexError) {
    throw err;
  }

  const indexUrl = extractFirestoreIndexUrl(message);
  const next = new Error(
    indexUrl
      ? `Firestore composite index required for notifications. Create it in Firebase Console: ${indexUrl}`
      : "Firestore composite index required for notifications. Deploy firestore.indexes.json (firebase deploy --only firestore:indexes) or create the index in Firebase Console."
  );
  next.status = 503;
  next.code = "FIRESTORE_INDEX_REQUIRED";
  next.indexUrl = indexUrl;
  throw next;
}

async function runFirestoreQuery(queryPromise) {
  try {
    return await queryPromise;
  } catch (err) {
    rethrowFirestoreIndexError(err);
  }
}

function requireFirestore() {
  const db = getFirestore();
  if (!db) {
    throw firestoreUnavailableError();
  }
  return db;
}

function sanitizeData(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const next = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "object") {
      next[key] = JSON.stringify(value);
      return;
    }
    next[key] = String(value);
  });
  return next;
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatNotificationDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    userid: data.userid ?? null,
    tenantid: data.tenantid ?? null,
    branchid: data.branchid ?? null,
    title: data.title ?? "",
    body: data.body ?? "",
    type: data.type ?? null,
    event: data.event ?? null,
    data: data.data ?? {},
    read: data.read === true,
    createdAt: timestampToIso(data.createdAt),
    readAt: timestampToIso(data.readAt)
  };
}

function resolveScopeFromPayload(payload = {}) {
  const tenantid =
    payload.tenantid != null
      ? Number(payload.tenantid)
      : payload.data?.tenantid != null
        ? Number(payload.data.tenantid)
        : null;
  const branchid =
    payload.branchid != null
      ? Number(payload.branchid)
      : payload.data?.branchid != null && payload.data.branchid !== ""
        ? Number(payload.data.branchid)
        : null;

  return {
    tenantid: Number.isFinite(tenantid) ? tenantid : null,
    branchid: Number.isFinite(branchid) ? branchid : null
  };
}

class UserNotificationService {
  isConfigured() {
    return isFirebaseConfigured() && Boolean(getFirestore());
  }

  /**
   * Persist inbox notifications in Firestore for each target user.
   */
  async saveForUsers(userIds, payload = {}) {
    const db = getFirestore();
    const admin = getFirebaseAdmin();
    if (!db || !admin || !userIds?.length) {
      return { saved: 0 };
    }

    const ids = [...new Set(userIds.map(Number).filter((id) => id > 0))];
    if (!ids.length) {
      return { saved: 0 };
    }

    const scope = resolveScopeFromPayload(payload);
    const col = db.collection(collectionName());
    const now = admin.firestore.FieldValue.serverTimestamp();
    const record = {
      title: String(payload.title || "Notification"),
      body: String(payload.body || ""),
      type: payload.type ?? payload.data?.type ?? null,
      event: payload.event ?? payload.data?.event ?? null,
      data: sanitizeData(payload.data),
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      read: false,
      readAt: null,
      createdAt: now
    };

    let saved = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      chunk.forEach((userid) => {
        const ref = col.doc();
        batch.set(ref, { ...record, userid });
      });

      await batch.commit();
      saved += chunk.length;
    }

    return { saved };
  }

  async countUnread(auth) {
    const db = requireFirestore();
    const userid = Number(auth.userid);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    let query = db
      .collection(collectionName())
      .where("userid", "==", userid)
      .where("tenantid", "==", tenantid)
      .where("branchid", "==", branchid)
      .where("read", "==", false);

    const snap = await runFirestoreQuery(query.count().get());
    return snap.data().count;
  }

  /**
   * List notifications for the JWT user from Firestore.
   */
  async listForUser(auth, query = {}) {
    const db = requireFirestore();
    const userid = Number(auth.userid);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    const pageSize = Math.min(
      Math.max(Number(query.pageSize || query.limit) || 25, 1),
      MAX_PAGE_SIZE
    );
    const unreadOnly =
      query.unreadOnly === true ||
      query.unreadOnly === "true" ||
      query.unreadOnly === "1";
    const typeFilter =
      query.type != null && String(query.type).trim() !== ""
        ? String(query.type).trim()
        : null;
    const cursor = query.cursor != null ? String(query.cursor).trim() : null;

    let firestoreQuery = db
      .collection(collectionName())
      .where("userid", "==", userid)
      .where("tenantid", "==", tenantid)
      .where("branchid", "==", branchid);

    if (unreadOnly) {
      firestoreQuery = firestoreQuery.where("read", "==", false);
    }

    if (typeFilter) {
      firestoreQuery = firestoreQuery.where("type", "==", typeFilter);
    }

    firestoreQuery = firestoreQuery.orderBy("createdAt", "desc");

    if (cursor) {
      const cursorDoc = await db.collection(collectionName()).doc(cursor).get();
      if (cursorDoc.exists) {
        firestoreQuery = firestoreQuery.startAfter(cursorDoc);
      }
    }

    const snapshot = await runFirestoreQuery(firestoreQuery.limit(pageSize + 1).get());
    const docs = snapshot.docs;

    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const includeUnreadCount =
      query.includeUnreadCount === true ||
      query.includeUnreadCount === "true" ||
      query.includeUnreadCount === "1";

    let unreadCount = null;
    if (includeUnreadCount) {
      unreadCount = await this.countUnread(auth);
    }

    return {
      userid,
      tenantid,
      branchid,
      filters: {
        unreadOnly,
        type: typeFilter,
        pageSize
      },
      unreadCount,
      data: pageDocs.map(formatNotificationDoc),
      pagination: {
        pageSize,
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null
      }
    };
  }

  /**
   * Mark all unread notifications as read for the JWT user in current tenant/branch.
   */
  async markAllAsRead(auth) {
    const db = requireFirestore();
    const admin = getFirebaseAdmin();
    if (!admin) {
      throw firestoreUnavailableError();
    }

    const userid = Number(auth.userid);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const now = admin.firestore.FieldValue.serverTimestamp();
    let updated = 0;

    while (true) {
      const snapshot = await runFirestoreQuery(
        db
          .collection(collectionName())
          .where("userid", "==", userid)
          .where("tenantid", "==", tenantid)
          .where("branchid", "==", branchid)
          .where("read", "==", false)
          .limit(BATCH_SIZE)
          .get()
      );

      if (snapshot.empty) {
        break;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true, readAt: now });
      });
      await batch.commit();
      updated += snapshot.docs.length;

      if (snapshot.docs.length < BATCH_SIZE) {
        break;
      }
    }

    return {
      message: "All notifications marked as read",
      updated,
      unreadCount: 0
    };
  }
}

module.exports = new UserNotificationService();
