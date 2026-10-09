const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const controller = require("../controllers/management-intelligence.controller");

const router = express.Router();

router.use(authenticateJwt);
router.get("/catalog", controller.getCatalog);
router.get("/overview", controller.getOverview);
router.post("/question", controller.askQuestion);
router.get("/reports/:reportKey/export", controller.exportReport);
router.get("/reports/:reportKey", controller.getReport);

module.exports = router;
