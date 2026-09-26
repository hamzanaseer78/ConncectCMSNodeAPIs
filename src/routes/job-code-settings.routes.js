const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/settings", jobController.getJobCodeSettings);
router.put("/settings", jobController.saveJobCodeSettings);

module.exports = router;
