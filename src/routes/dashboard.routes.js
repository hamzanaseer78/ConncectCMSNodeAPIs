const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const dashboardController = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(authenticateJwt);
router.use(dashboardController.requireAuthContext);

router.get("/section-1", dashboardController.getSection1);
router.get("/job-summary", dashboardController.getJobSummary);
router.get("/technicians", dashboardController.getTechnicians);
router.get("/technicians/stats", dashboardController.getTechnicianStats);
router.get("/technicians-live-status", dashboardController.getTechniciansLiveStatus);
router.get("/job-pipeline", dashboardController.getJobPipeline);
router.get("/today-jobs", dashboardController.getTodayJobs);
router.get("/activity-feed", dashboardController.getLiveActivityFeed);
router.get("/jobs-by-group", dashboardController.getJobsByGroup);
router.get("/location-wise-jobs", dashboardController.getLocationWiseJobs);
router.get("/category-wise-jobs", dashboardController.getCategoryWiseJobs);
router.get("/top-faults", dashboardController.getTopFaults);
router.get("/technician-performance", dashboardController.getTechnicianPerformance);
router.get("/manager-jobs", dashboardController.getManagerJobs);
router.get("/manager-technicians", dashboardController.getManagerTechnicians);
router.get("/manager-summary", dashboardController.getManagerSummary);
router.get("/active-jobs", dashboardController.getActiveJobs);
router.get("/todays-progress", dashboardController.getTodaysProgress);
router.get("/warranty-split", dashboardController.getWarrantySplit);
router.get("/weekly-job-volume", dashboardController.getWeeklyJobVolume);
router.get("/avg-resolution-by-category", dashboardController.getAvgResolutionByCategory);
router.get("/ticket-reopening-rate", dashboardController.getTicketReopeningRate);

module.exports = router;
