const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const pushController = require("../controllers/push-notification.controller");

const router = express.Router();

router.use(authenticateJwt);
router.use(pushController.requireAuthContext);

router.get("/", pushController.listNotifications);
router.post("/mark-all-read", pushController.markAllNotificationsRead);
router.get("/status", pushController.getStatus);
router.post("/device-token", pushController.registerDeviceToken);
router.delete("/device-token", pushController.removeDeviceToken);
router.post("/test", pushController.sendTest);

module.exports = router;
