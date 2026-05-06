/**
 * Request Logger Middleware
 * Logs all incoming requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`, {
      userId: req.auth?.userid,
      tenantId: req.auth?.tenantid
    });
  });

  next();
}

module.exports = requestLogger;
