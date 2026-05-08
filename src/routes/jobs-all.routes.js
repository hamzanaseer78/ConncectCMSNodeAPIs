const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

// Separate "all jobs" namespace
router.get("/", jobController.getAllJobs);
router.get("/dashboard", jobController.getDashboardAll);
router.get("/reports", jobController.getReportAll);

module.exports = router;
