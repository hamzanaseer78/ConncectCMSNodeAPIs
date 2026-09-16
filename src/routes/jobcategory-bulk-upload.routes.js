const { createBulkUploadRouter } = require("./create-bulk-upload.routes");
const { uploadJobCategoryBulkSingle } = require("../middlewares/upload.middleware");
const controller = require("../controllers/jobcategory-bulk-upload.controller");

module.exports = createBulkUploadRouter({
  resourceName: "jobcategories",
  controller,
  uploadMiddleware: uploadJobCategoryBulkSingle
});
