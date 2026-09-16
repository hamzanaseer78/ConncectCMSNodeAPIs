const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const controller = require("../controllers/user-activity-log.controller");

const router = express.Router();

router.use(authenticateJwt);
router.get("/", controller.listActivityLogs);

module.exports = router;
