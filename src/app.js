const express = require("express");
const path = require("path");
const cors = require("cors");
const compression = require("compression");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const graphqlHandler = require("./graphql/handler");
const graphqlPlaygroundRoute = require("./graphql/playground");
const graphqlStudioRoute = require("./graphql/studio");
const { printSchema } = require("graphql");

const authRoutes = require("./routes/auth.routes");
const userProfileRoutes = require("./routes/userprofile.routes");
const orgBranchRoutes = require("./routes/orgbranch.routes");
const createDropdownRoutes = require("./routes/dropdowns.routes");
const jobRoutes = require("./routes/job.routes");
const jobsAllRoutes = require("./routes/jobs-all.routes");
const jobsMyRoutes = require("./routes/jobs-my.routes");
const jobsTeamRoutes = require("./routes/jobs-team.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const uploadRoutes = require("./routes/upload.routes");
const productBulkUploadRoutes = require("./routes/product-bulk-upload.routes");
const jobCategoryBulkUploadRoutes = require("./routes/jobcategory-bulk-upload.routes");
const jobSubcategoryBulkUploadRoutes = require("./routes/jobsubcategory-bulk-upload.routes");
const erpProductBulkUploadRoutes = require("./routes/erpproduct-bulk-upload.routes");
const trackingRoutes = require("./routes/tracking.routes");
const userActivityLogRoutes = require("./routes/user-activity-log.routes");
const publicRoutes = require("./routes/public.routes");
const announcementsRoutes = require("./routes/announcements.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const resources = require("./config/resources");
const createResourceRouter = require("./routes/generic.routes");

// Middleware
const requestLogger = require("./middlewares/request-logger.middleware");
const parseJsonBody = require("./middlewares/json-body.middleware");
const errorHandler = require("./middlewares/error.middleware");
const tenantBranchFilter = require("./middlewares/tenant-branch-filter.middleware");
const { createSeqProxy } = require("./middlewares/seq-proxy.middleware");

const seqProxy = createSeqProxy();

const app = express();

// Static uploads (job attachments, etc.)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Security & Performance Middleware
/**
 * CORS_ORIGIN:
 *   - `*` or CORS_ALLOW_ALL=true → allow any origin (reflects request Origin; works with credentials)
 *   - comma-separated list → allow only those origins (e.g. http://localhost:3000,https://app.example.com)
 *   - single URL → allow one origin (default http://localhost:3000)
 */
function normalizeCorsOrigin(value) {
  if (!value || value === "*") return value;
  return String(value).trim().replace(/\/+$/, "");
}

function buildCorsOptions() {
  const raw = (process.env.CORS_ORIGIN || "http://localhost:3000").trim();
  const allowAll =
    raw === "*" ||
    process.env.CORS_ALLOW_ALL === "true" ||
    process.env.CORS_ALLOW_ALL === "1";

  let origin;
  if (allowAll) {
    origin = (requestOrigin, callback) => {
      callback(null, requestOrigin || true);
    };
  } else if (raw.includes(",")) {
    const allowed = new Set(
      raw.split(",").map((o) => normalizeCorsOrigin(o)).filter(Boolean)
    );
    origin = (requestOrigin, callback) => {
      const normalized = normalizeCorsOrigin(requestOrigin);
      if (!requestOrigin || allowed.has(normalized)) {
        callback(null, requestOrigin || true);
      } else {
        callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
      }
    };
  } else {
    const allowed = normalizeCorsOrigin(raw);
    origin = (requestOrigin, callback) => {
      const normalized = normalizeCorsOrigin(requestOrigin);
      if (!requestOrigin || normalized === allowed) {
        callback(null, requestOrigin || allowed);
      } else {
        callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
      }
    };
  }

  return {
    origin,
    credentials: true,
    maxAge: 86400,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    exposedHeaders: ["Content-Disposition"]
  };
}

app.use(cors(buildCorsOptions()));

// Seq UI/API proxy must run before body parsers (login POST body would otherwise be consumed).
if (seqProxy) {
  app.use(seqProxy.middleware);
}

// Gzip compression (skip Seq UI proxy — streaming + subpath breaks easily)
app.use(compression({
  filter: (req, res) => {
    if (req.url === "/logs" || req.url.startsWith("/logs/")) {
      return false;
    }
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between compression ratio and speed
}));

// Body parser (empty JSON body + GET with application/json are tolerated)
app.use(parseJsonBody);
app.use((req, res, next) => {
  if (req.url === "/logs" || req.url.startsWith("/logs/")) {
    return next();
  }
  return express.urlencoded({ limit: process.env.JSON_BODY_LIMIT || "256kb", extended: true })(req, res, next);
});

// Security headers (skip Seq — it sets its own)
app.use((req, res, next) => {
  if (req.url === "/logs" || req.url.startsWith("/logs/")) {
    return next();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request Logging
app.use(requestLogger);

// Tenant & Branch Filter - Add context to all responses
app.use(tenantBranchFilter);

/**
 * Health Check Endpoint
 * Used for deployment health checks and monitoring
 */
app.get('/health', async (req, res) => {
  const seqUpstreamOk = seqProxy ? await seqProxy.checkUpstreamReachable() : null;

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    seq: {
      loggingEnabled: Boolean(process.env.SEQ_SERVER_URL && process.env.SEQ_LOGGING_ENABLED !== 'false'),
      uiUrl: process.env.SEQ_SERVER_URL || null,
      proxyEnabled: Boolean(seqProxy),
      upstreamUrl: seqProxy?.upstreamUrl || null,
      upstreamReachable: seqUpstreamOk
    }
  });
});

/**
 * Ready Check Endpoint
 * Used for deployment readiness probes
 */
app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// GraphQL
app.use("/graphql/playground", graphqlPlaygroundRoute);
app.get("/graphql/studio", graphqlStudioRoute);
app.get("/graphql/schema", (_req, res) => {
  res.type("text/plain; charset=utf-8").send(printSchema(graphqlHandler.schema));
});
app.all("/graphql", graphqlHandler);

// REST API Routes
app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/user-activity-logs", userActivityLogRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/org", orgBranchRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/jobs-all", jobsAllRoutes);
app.use("/api/jobs-my", jobsMyRoutes);
app.use("/api/jobs-team", jobsTeamRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Dropdown routes - separate endpoints for dropdowns (JWT only, no RBAC)
app.use("/api/dropdowns", createDropdownRoutes());

// Product bulk upload (must register before /api/products generic routes)
app.use("/api/products/bulk-upload", productBulkUploadRoutes);
app.use("/api/jobcategories/bulk-upload", jobCategoryBulkUploadRoutes);
app.use("/api/jobsubcategories/bulk-upload", jobSubcategoryBulkUploadRoutes);
app.use("/api/erpproducts/bulk-upload", erpProductBulkUploadRoutes);

// Generic CRUD routes with RBAC
Object.entries(resources).forEach(([resourceName, config]) => {
  if (config.backendOnly) {
    return;
  }
  app.use(`/api/${resourceName}`, createResourceRouter(resourceName));
});

// 404 Handler - must be before error handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global Error Handler (must be last)
app.use(errorHandler);

module.exports = app;
module.exports.seqProxy = seqProxy;
