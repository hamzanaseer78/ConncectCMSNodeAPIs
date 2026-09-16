const { pickAttachmentList } = require("./job-attachments-payload");

function collectMulterFiles(req) {
  const out = [];
  if (req.file) {
    out.push(req.file);
  }
  if (!req.files) {
    return out;
  }
  if (Array.isArray(req.files)) {
    return out.concat(req.files);
  }
  if (req.files.files) {
    const f = req.files.files;
    out.push(...(Array.isArray(f) ? f : [f]));
  }
  if (req.files.file) {
    const f = req.files.file;
    out.push(...(Array.isArray(f) ? f : [f]));
  }
  return out;
}

function multerFilesToAttachments(req, jobId, auth) {
  const files = collectMulterFiles(req);
  if (!files.length) {
    return [];
  }

  const tenant = String(auth.tenantid);
  const branch = String(auth.branchid);
  const job = String(jobId);

  return files.map((file) => ({
    attachmentname: file.originalname || file.filename || "attachment",
    url: `/uploads/jobs/${tenant}/${branch}/${job}/${file.filename}`,
    remarks: null
  }));
}

function parseJsonField(value, fieldName) {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON in ${fieldName}`);
    }
  }
  return value;
}

/**
 * Merge JSON body and multipart uploads for job action endpoints.
 */
function buildJobActionPayload(req) {
  const body = { ...(req.body || {}) };

  if (typeof body.attachments === "string") {
    body.attachments = parseJsonField(body.attachments, "attachments");
  }
  if (typeof body.customerFeedback === "string") {
    body.customerFeedback = parseJsonField(body.customerFeedback, "customerFeedback");
  }

  const fromBody = pickAttachmentList(body);
  const fromFiles = multerFilesToAttachments(req, req.params.id, req.auth);
  body._attachmentItems = [...fromBody, ...fromFiles];

  return body;
}

module.exports = {
  buildJobActionPayload,
  multerFilesToAttachments,
  collectMulterFiles
};
