const { createBulkUploadRouter } = require("./create-bulk-upload.routes");
const { uploadJobSubcategoryBulkSingle } = require("../middlewares/upload.middleware");
const controller = require("../controllers/jobsubcategory-bulk-upload.controller");

module.exports = createBulkUploadRouter({
  resourceName: "jobsubcategories",
  controller,
  uploadMiddleware: uploadJobSubcategoryBulkSingle
});
