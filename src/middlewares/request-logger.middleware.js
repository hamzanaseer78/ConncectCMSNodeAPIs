const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Request Logger Middleware
 * Logs all incoming HTTP requests to console and Seq (when configured).
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();

  res.on("finish", () => {
    // Ingest posts directly to SEQ_UPSTREAM_URL; skip if any still hit the proxy.
    if (req.path.startsWith("/logs/api/events")) {
      return;
    }

    const durationMs = Date.now() - start;
    const properties = {
      RequestId: req.requestId,
      Method: req.method,
      Path: req.path,
      Url: req.originalUrl,
      StatusCode: res.statusCode,
      DurationMs: durationMs,
      UserId: req.auth?.userid ?? null,
      TenantId: req.auth?.tenantid ?? null,
      BranchId: req.auth?.branchid ?? null,
      UserAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 500) : null,
      IpAddress:
        (typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
          : null) ||
        req.ip ||
        null
    };

    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level](
      `HTTP ${req.method} ${req.path} ${res.statusCode} (${durationMs}ms)`,
      properties
    );
  });

  next();
}

module.exports = requestLogger;
