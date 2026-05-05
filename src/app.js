const express = require("express");
const cors = require("cors");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const authRoutes = require("./routes/auth.routes");
const userProfileRoutes = require("./routes/userprofile.routes");
const orgBranchRoutes = require("./routes/orgbranch.routes");
const resources = require("./config/resources");
const createResourceRouter = require("./routes/generic.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/org", orgBranchRoutes);

Object.entries(resources).forEach(([resourceName, config]) => {
  if (config.backendOnly) {
    return;
  }

  app.use(`/api/${resourceName}`, createResourceRouter(resourceName));
});

module.exports = app;
