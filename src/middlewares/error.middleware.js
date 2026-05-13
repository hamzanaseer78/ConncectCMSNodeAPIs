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
