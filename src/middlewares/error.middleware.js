/**
 * Global Error Handler Middleware
 * Catches and formats all errors consistently
 */
const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "File exceeds maximum upload size";
  } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
    status = 400;
    message = "Unexpected file field; use field name \"file\"";
  } else if (
    err.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && /in JSON at position/i.test(String(err.message || "")))
  ) {
    status = 400;
    message =
      "Invalid JSON body. Use double quotes for all property names and string values, no trailing commas, and no comments. " +
      "For GET or DELETE, omit the body (or do not send Content-Type: application/json with a non-JSON body).";
  } else if (err.code === "P2002") {
    status = 409;
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(",")
      : String(err.meta?.target || "");
    if (/tenantid.*code|code.*tenantid|uq_job_tenant_code/i.test(target)) {
      const submittedCode =
        req.body?.code ??
        req.body?.jobNo ??
        req.body?.jobno ??
        null;
      const codeLabel =
        submittedCode != null && String(submittedCode).trim() !== ""
          ? `"${String(submittedCode).trim()}"`
          : "This job code";
      message = `${codeLabel} already exists in this organization`;
    } else if (
      /contactno|uq_customers_tenant_branch_contactno/i.test(target) ||
      (/tenantid/i.test(target) && /branchid/i.test(target) && /contactno/i.test(target))
    ) {
      const submittedPhone =
        req.body?.contactno ??
        req.body?.contactNo ??
        req.body?.phone ??
        req.body?.phoneNo ??
        req.body?.customer?.contactno ??
        req.body?.customer?.phone ??
        null;
      const phoneLabel =
        submittedPhone != null && String(submittedPhone).trim() !== ""
          ? `"${String(submittedPhone).trim()}"`
          : "This phone number";
      message = `A customer with phone ${phoneLabel} already exists`;
    } else if (/email/i.test(target)) {
      message = "A user with this email already exists";
    } else if (/branchid/i.test(target)) {
      message =
        "Could not create branch: primary key sequence is out of sync. Run: node scripts/fix-branches-branchid-sequence.js";
    }
  } else if (err.code === "FIRESTORE_INDEX_REQUIRED" || err.indexUrl) {
    status = err.status || 503;
    message = err.message || "Firestore composite index required";
  }

  logger.error(`HTTP error ${status} - ${message}`, {
    RequestId: req.requestId ?? null,
    Path: req.path,
    Method: req.method,
    UserId: req.auth?.userid ?? null,
    TenantId: req.auth?.tenantid ?? null,
    BranchId: req.auth?.branchid ?? null,
    StatusCode: status,
    ErrorCode: err.code ?? null
  }, err);

  res.status(status).json({
    error: message,
    status,
    ...(err.code === "FIRESTORE_INDEX_REQUIRED" && err.indexUrl
      ? { indexUrl: err.indexUrl, code: err.code }
      : {}),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
