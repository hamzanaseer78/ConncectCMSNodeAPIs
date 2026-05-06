const express = require("express");
const controller = require("../controllers/auth.controller");
const authenticateJwt = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/signup", controller.signup);
router.post("/signup/verify", controller.verifySignupToken);
router.get("/signup/verify", controller.verifySignupToken);
router.post("/password", controller.configurePassword);
router.post("/organizations", controller.createOrganization);
router.post("/login", controller.login);
router.post("/switch", authenticateJwt, controller.switchContext);
router.post("/invite", authenticateJwt, controller.inviteUser);
router.post("/addOrganization", controller.createOrganization);

module.exports = router;
