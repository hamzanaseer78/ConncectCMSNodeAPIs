const fs = require("fs");
const path = require("path");
const { BULK_UPLOAD_SESSION_TTL_MS } = require("../config/bulk-upload-common");

function createBulkSessionStore(tempFolder, ttlMs = BULK_UPLOAD_SESSION_TTL_MS) {
  function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function sessionRoot(auth) {
    return path.join(
      process.cwd(),
      "uploads",
      "temp",
      tempFolder,
      String(auth.tenantid),
      String(auth.userid)
    );
  }

  function sessionDir(auth, uploadId) {
    return path.join(sessionRoot(auth), String(uploadId));
  }

  function metaPath(auth, uploadId) {
    return path.join(sessionDir(auth, uploadId), "meta.json");
  }

  function readMeta(auth, uploadId) {
    const file = metaPath(auth, uploadId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  function writeMeta(auth, uploadId, meta) {
    ensureDir(sessionDir(auth, uploadId));
    fs.writeFileSync(metaPath(auth, uploadId), JSON.stringify(meta, null, 2), "utf8");
  }

  function isSessionExpired(meta) {
    if (!meta?.expiresAt) return true;
    return Date.now() > new Date(meta.expiresAt).getTime();
  }

  function assertSessionAccess(auth, uploadId) {
    const meta = readMeta(auth, uploadId);
    if (!meta) {
      const err = new Error("Upload session not found");
      err.status = 404;
      throw err;
    }
    if (isSessionExpired(meta)) {
      removeSession(auth, uploadId);
      const err = new Error("Upload session expired; please upload the file again");
      err.status = 410;
      throw err;
    }
    if (
      Number(meta.tenantid) !== Number(auth.tenantid) ||
      Number(meta.userid) !== Number(auth.userid)
    ) {
      const err = new Error("Upload session not found");
      err.status = 404;
      throw err;
    }
    return meta;
  }

  function createSession(auth, uploadId, { originalName, storedFilename, fileType, headers, rowCount }) {
    const now = new Date();
    const meta = {
      uploadId,
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid),
      userid: Number(auth.userid),
      originalName,
      storedFilename,
      fileType,
      headers,
      rowCount,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      columnMapping: null,
      dateFormat: null
    };
    writeMeta(auth, uploadId, meta);
    return meta;
  }

  function updateSession(auth, uploadId, patch) {
    const meta = assertSessionAccess(auth, uploadId);
    const next = { ...meta, ...patch };
    writeMeta(auth, uploadId, next);
    return next;
  }

  function removeSession(auth, uploadId) {
    const dir = sessionDir(auth, uploadId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function getSourceFilePath(meta, auth, uploadId) {
    return path.join(sessionDir(auth, uploadId), meta.storedFilename);
  }

  return {
    assertSessionAccess,
    createSession,
    getSourceFilePath,
    removeSession,
    updateSession
  };
}

module.exports = { createBulkSessionStore };
