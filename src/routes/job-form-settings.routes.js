const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/settings", jobController.getFormSettings);
router.put("/settings", jobController.saveFormSettings);

/** Alias for job code format settings (same handlers as /api/jobs/code/settings). */
router.get("/code-settings", jobController.getJobCodeSettings);
router.put("/code-settings", jobController.saveJobCodeSettings);

module.exports = router;
