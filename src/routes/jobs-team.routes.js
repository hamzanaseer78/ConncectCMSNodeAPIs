const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/", jobController.getTeamJobs);
router.get("/stats-kpis", jobController.getStatsKpisTeam);
router.get("/dashboard", jobController.getDashboardTeam);
router.get("/reports", jobController.getReportTeam);
router.get("/reports/jobs-list/columns", jobController.getJobsListReportColumns);
router.put("/reports/jobs-list/columns", jobController.updateJobsListReportColumns);
router.post("/reports/jobs-list/export", jobController.exportJobsListTeam);
router.get("/reports/jobs-list/export", jobController.exportJobsListTeam);

module.exports = router;
