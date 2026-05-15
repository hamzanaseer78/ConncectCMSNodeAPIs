/**
 * Global Error Handler Middleware
 * Catches and formats all errors consistently
 */
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
  }

  console.error(`[ERROR] ${status} - ${message}`, {
    path: req.path,
    method: req.method,
    userId: req.auth?.userid,
    tenantId: req.auth?.tenantid,
    stack: err.stack
  });

  res.status(status).json({
    error: message,
    status,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
