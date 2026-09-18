const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/settings", jobController.getFormSettings);
router.put("/settings", jobController.saveFormSettings);

module.exports = router;
