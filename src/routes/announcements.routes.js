const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const announcementsController = require("../controllers/announcements.controller");

const router = express.Router();

router.use(authenticateJwt);
router.use(announcementsController.requireAuthContext);

router.get("/", announcementsController.list);
router.get("/:id", announcementsController.getById);

router.post("/", announcementsController.create);
router.put("/:id", announcementsController.update);
router.patch("/:id/deactivate", announcementsController.deactivate);
router.delete("/:id", announcementsController.remove);

module.exports = router;
