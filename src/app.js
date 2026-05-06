const express = require("express");
const cors = require("cors");
const compression = require("compression");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const authRoutes = require("./routes/auth.routes");
const userProfileRoutes = require("./routes/userprofile.routes");
const orgBranchRoutes = require("./routes/orgbranch.routes");
const createDropdownRoutes = require("./routes/dropdowns.routes");
const resources = require("./config/resources");
const createResourceRouter = require("./routes/generic.routes");

// Middleware
const requestLogger = require("./middlewares/request-logger.middleware");
const errorHandler = require("./middlewares/error.middleware");
const tenantBranchFilter = require("./middlewares/tenant-branch-filter.middleware");

const app = express();

// Security & Performance Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  maxAge: 86400 // 24 hours
}));

app.use(compression()); // Gzip compression
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Request Logging
app.use(requestLogger);

// Tenant & Branch Filter - Add context to all responses
app.use(tenantBranchFilter);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/org", orgBranchRoutes);

// Dropdown routes - separate endpoints for dropdowns (JWT only, no RBAC)
app.use("/api/dropdowns", createDropdownRoutes());

// Generic CRUD routes with RBAC
Object.entries(resources).forEach(([resourceName, config]) => {
  if (config.backendOnly) {
    return;
  }

  app.use(`/api/${resourceName}`, createResourceRouter(resourceName));
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler (must be last)
app.use(errorHandler);

module.exports = app;
