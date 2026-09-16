const express = require("express");
const publicJobStatsController = require("../controllers/public-job-stats.controller");

const router = express.Router();

router.get("/jobs/stats", publicJobStatsController.getPublicJobStats);

module.exports = router;
