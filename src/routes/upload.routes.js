const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const { uploadSingle } = require("../middlewares/upload.middleware");
const uploadController = require("../controllers/upload.controller");

const router = express.Router();

function requireTenantBranch(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

router.post("/", authenticateJwt, requireTenantBranch, uploadSingle, uploadController.uploadFile);

module.exports = router;
