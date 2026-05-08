const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

// Separate "my assigned jobs" namespace
router.get("/", jobController.getMyJobs);
router.get("/dashboard", jobController.getDashboardMy);
router.get("/reports", jobController.getReportMy);

module.exports = router;
