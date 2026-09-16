const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const { authorizeResourceAction } = require("../middlewares/authorization.middleware");

function requireTenantBranch(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

function createBulkUploadRouter({ resourceName, controller, uploadMiddleware }) {
  const router = express.Router();

  router.use(authenticateJwt, requireTenantBranch);

  router.get("/template", authorizeResourceAction(resourceName, "view"), controller.downloadTemplate);
  router.post(
    "/upload",
    authorizeResourceAction(resourceName, "add"),
    uploadMiddleware,
    controller.uploadFile
  );
  router.post("/preview", authorizeResourceAction(resourceName, "add"), controller.previewMapping);
  router.post("/confirm", authorizeResourceAction(resourceName, "add"), controller.confirmImport);
  router.delete("/:uploadId", authorizeResourceAction(resourceName, "add"), controller.cancelUpload);

  return router;
}

module.exports = { createBulkUploadRouter };
