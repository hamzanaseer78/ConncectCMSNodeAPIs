const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const settingsController = require("../controllers/settings.controller");

const router = express.Router();

router.use(authenticateJwt);

/** @deprecated Prefer GET/PUT /api/settings/code */
router.get("/settings", settingsController.getJobCodeSettings);
router.put("/settings", settingsController.saveJobCodeSettings);

module.exports = router;
