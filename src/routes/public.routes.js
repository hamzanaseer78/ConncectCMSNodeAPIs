const express = require("express");
const publicJobStatsController = require("../controllers/public-job-stats.controller");
const { buildRouteDiagnostics } = require("../utils/express-route-diagnostics");

const router = express.Router();

router.get("/jobs/stats", publicJobStatsController.getPublicJobStats);

/**
 * Compare on-disk route files vs what this Node process actually registered.
 * GET /api/public/deploy-info (no auth)
 */
router.get("/deploy-info", (req, res) => {
  res.status(200).json(buildRouteDiagnostics(req.app));
});

module.exports = router;
