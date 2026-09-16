const { createBulkUploadController } = require("./bulk-upload.controller");
const erpProductBulkUploadService = require("../services/erpproduct-bulk-upload.service");

erpProductBulkUploadService.templateFilename = "erp-product-bulk-upload-template.xlsx";

module.exports = createBulkUploadController(erpProductBulkUploadService);
