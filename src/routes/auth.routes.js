const express = require("express");
const controller = require("../controllers/auth.controller");
const authenticateJwt = require("../middlewares/auth.middleware");
const { authorizeResourceAction } = require("../middlewares/authorization.middleware");

const router = express.Router();

router.post("/signup", controller.signup);
router.post("/signup/verify", controller.verifySignupToken);
router.get("/signup/verify", controller.verifySignupToken);
router.post("/password", controller.configurePassword);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.post("/organizations", controller.createOrganization);
router.post("/login", controller.login);
router.post("/change-password", authenticateJwt, controller.changePassword);
router.get("/profile", authenticateJwt, controller.getProfile);
router.put("/profile", authenticateJwt, controller.updateProfile);
const { uploadProfileSingle } = require("../middlewares/upload.middleware");
router.post("/profile-image", authenticateJwt, uploadProfileSingle, controller.uploadProfileImage);
router.put("/profile-image", authenticateJwt, controller.uploadProfileImage);
router.post("/switch", authenticateJwt, controller.switchContext);
router.post("/invite", authenticateJwt, authorizeResourceAction("users", "add"), controller.inviteUser);
router.post("/users/create", authenticateJwt, authorizeResourceAction("users", "add"), controller.inviteUser);
router.post("/mail/test", authenticateJwt, controller.sendTestMail);
router.post("/addOrganization", controller.createOrganization);

module.exports = router;
