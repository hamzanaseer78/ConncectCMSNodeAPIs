const { createBulkUploadController } = require("./bulk-upload.controller");
const jobSubcategoryBulkUploadService = require("../services/jobsubcategory-bulk-upload.service");

jobSubcategoryBulkUploadService.templateFilename = "job-subcategory-bulk-upload-template.xlsx";

module.exports = createBulkUploadController(jobSubcategoryBulkUploadService);
