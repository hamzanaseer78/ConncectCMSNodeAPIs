const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

// Separate "my assigned jobs" namespace
router.get("/", jobController.getMyJobs);
router.get("/stats-kpis", jobController.getStatsKpisMy);
router.get("/dashboard", jobController.getDashboardMy);
router.get("/reports", jobController.getReportMy);
router.get("/reports/jobs-list/columns", jobController.getJobsListReportColumns);
router.put("/reports/jobs-list/columns", jobController.updateJobsListReportColumns);
router.post("/reports/jobs-list/export", jobController.exportJobsListMy);
router.get("/reports/jobs-list/export", jobController.exportJobsListMy);
router.get("/cash/expenses/pending", jobController.listJobPendingExpensesMy);
router.get("/cash/collections/pending", jobController.listJobPendingCollectionsMy);
router.get("/cash/collections", jobController.listJobCollectionsMy);

module.exports = router;
