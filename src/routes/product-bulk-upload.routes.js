const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const { authorizeResourceAction } = require("../middlewares/authorization.middleware");
const { uploadProductBulkSingle } = require("../middlewares/upload.middleware");
const controller = require("../controllers/product-bulk-upload.controller");

const router = express.Router();

function requireTenantBranch(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

router.use(authenticateJwt, requireTenantBranch);

router.get(
  "/template",
  authorizeResourceAction("products", "view"),
  controller.downloadTemplate
);

router.post(
  "/upload",
  authorizeResourceAction("products", "add"),
  uploadProductBulkSingle,
  controller.uploadFile
);

router.post(
  "/preview",
  authorizeResourceAction("products", "add"),
  controller.previewMapping
);

router.post(
  "/confirm",
  authorizeResourceAction("products", "add"),
  controller.confirmImport
);

router.delete(
  "/:uploadId",
  authorizeResourceAction("products", "add"),
  controller.cancelUpload
);

module.exports = router;
