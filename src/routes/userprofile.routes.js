const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const userController = require("../controllers/user.controller");
const screenRightsController = require("../controllers/screenrights.controller");

const router = express.Router();

// All user profile endpoints require authentication
router.use(authenticateJwt);

// Effective screen rights for current JWT context (same payload as login/profile)
router.get("/screen-rights", screenRightsController.getScreenRights);

// Get profile with updated token
router.get("/profile", userController.getProfile);

// Update profile data
router.put("/profile", userController.updateProfile);

// Change password
router.post("/change-password", userController.changePassword);

// Update profile image
router.put("/profile-image", userController.updateProfileImage);

module.exports = router;
