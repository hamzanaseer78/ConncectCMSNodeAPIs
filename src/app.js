const express = require("express");
const path = require("path");
const cors = require("cors");
const compression = require("compression");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const graphqlHandler = require("./graphql/handler");
const graphqlPlaygroundRoute = require("./graphql/playground");

const authRoutes = require("./routes/auth.routes");
const userProfileRoutes = require("./routes/userprofile.routes");
const orgBranchRoutes = require("./routes/orgbranch.routes");
const createDropdownRoutes = require("./routes/dropdowns.routes");
const jobRoutes = require("./routes/job.routes");
const jobsAllRoutes = require("./routes/jobs-all.routes");
const jobsMyRoutes = require("./routes/jobs-my.routes");
const resources = require("./config/resources");
const createResourceRouter = require("./routes/generic.routes");

// Middleware
const requestLogger = require("./middlewares/request-logger.middleware");
const errorHandler = require("./middlewares/error.middleware");
const tenantBranchFilter = require("./middlewares/tenant-branch-filter.middleware");

const app = express();

// Static uploads (job attachments, etc.)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Security & Performance Middleware
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  maxAge: 86400, // 24 hours
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Gzip compression
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between compression ratio and speed
}));

// Body parser with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Security headers
app.use((req, res, next) => {
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
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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
app.all("/graphql", graphqlHandler);

// REST API Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/org", orgBranchRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/jobs-all", jobsAllRoutes);
app.use("/api/jobs-my", jobsMyRoutes);

// Dropdown routes - separate endpoints for dropdowns (JWT only, no RBAC)
app.use("/api/dropdowns", createDropdownRoutes());

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
