const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");
const settingsController = require("../controllers/settings.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/settings", jobController.getFormSettings);
router.put("/settings", jobController.saveFormSettings);

/** @deprecated Prefer GET/PUT /api/settings/code */
router.get("/code-settings", settingsController.getJobCodeSettings);
router.put("/code-settings", settingsController.saveJobCodeSettings);

module.exports = router;
