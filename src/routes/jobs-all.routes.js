const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

// Separate "all jobs" namespace
router.get("/", jobController.getAllJobs);
router.get("/stats-kpis", jobController.getStatsKpisAll);
router.get("/dashboard", jobController.getDashboardAll);
router.get("/reports", jobController.getReportAll);
router.get("/reports/jobs-list/columns", jobController.getJobsListReportColumns);
router.put("/reports/jobs-list/columns", jobController.updateJobsListReportColumns);
router.post("/reports/jobs-list/export", jobController.exportJobsListAll);
router.get("/reports/jobs-list/export", jobController.exportJobsListAll);

module.exports = router;
