const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const settingsController = require("../controllers/settings.controller");

const router = express.Router();

router.use(authenticateJwt);

/** Job auto-code format: prefix, separator, sequence, postfix (per branch). */
router.get("/code", settingsController.getJobCodeSettings);
router.put("/code", settingsController.saveJobCodeSettings);

module.exports = router;
