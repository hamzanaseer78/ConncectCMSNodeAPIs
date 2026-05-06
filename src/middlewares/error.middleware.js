/**
 * Global Error Handler Middleware
 * Catches and formats all errors consistently
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

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
