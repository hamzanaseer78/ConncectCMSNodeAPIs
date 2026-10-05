const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const organizationAiController = require("../controllers/organization-ai.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/setup", organizationAiController.getAiSetup);
router.put("/setup", organizationAiController.saveAiSetup);
router.post("/chat", organizationAiController.askAi);

module.exports = router;
