const { createBulkUploadRouter } = require("./create-bulk-upload.routes");
const { uploadErpProductBulkSingle } = require("../middlewares/upload.middleware");
const controller = require("../controllers/erpproduct-bulk-upload.controller");

module.exports = createBulkUploadRouter({
  resourceName: "erpproducts",
  controller,
  uploadMiddleware: uploadErpProductBulkSingle
});
