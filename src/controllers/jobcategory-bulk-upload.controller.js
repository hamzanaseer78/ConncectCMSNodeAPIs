const { createBulkUploadController } = require("./bulk-upload.controller");
const jobCategoryBulkUploadService = require("../services/jobcategory-bulk-upload.service");

jobCategoryBulkUploadService.templateFilename = "job-category-bulk-upload-template.xlsx";

module.exports = createBulkUploadController(jobCategoryBulkUploadService);
