const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const trackingController = require("../controllers/user-tracking.controller");

const router = express.Router();

router.use(authenticateJwt);
router.use(trackingController.requireAuthContext);

router.post("/ping", trackingController.postPing);
router.get("/live", trackingController.getLive);

module.exports = router;
