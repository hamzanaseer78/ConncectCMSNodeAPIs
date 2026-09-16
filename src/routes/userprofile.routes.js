const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const { authorizeResourceAction } = require("../middlewares/authorization.middleware");
const { uploadProfileSingle } = require("../middlewares/upload.middleware");
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

// Create user in current org/branch when caller has Users add permission
router.post(
  "/admin/create",
  authorizeResourceAction("users", "add"),
  userController.adminCreateUser
);

// Admin: update user fields, policy, and branch membership
router.post(
  "/admin/update",
  authorizeResourceAction("users", "update"),
  userController.adminUpdateUser
);

// Admin: list users with policies / rights for current org
router.get(
  "/admin/users",
  authorizeResourceAction("users", "view"),
  userController.adminListUsers
);
router.get(
  "/admin/users/:id",
  authorizeResourceAction("users", "view"),
  userController.adminGetUser
);
router.patch(
  "/admin/users/:id/active",
  authorizeResourceAction("users", "update"),
  userController.adminSetUserActive
);
router.patch(
  "/admin/users/:id/blocked",
  authorizeResourceAction("users", "update"),
  userController.adminSetUserBlocked
);

// Profile image: multipart upload, URL in body, or remove=true
router.post("/profile-image", uploadProfileSingle, userController.updateProfileImage);
router.put("/profile-image", userController.updateProfileImage);

module.exports = router;
