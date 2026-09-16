const productBulkUploadService = require("../services/product-bulk-upload.service");

async function downloadTemplate(req, res, next) {
  try {
    const buffer = productBulkUploadService.buildTemplateBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="product-bulk-upload-template.xlsx"');
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

async function uploadFile(req, res, next) {
  try {
    const data = await productBulkUploadService.handleUpload(req.auth, req.file, req.bulkUploadId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function previewMapping(req, res, next) {
  try {
    const data = await productBulkUploadService.preview(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function confirmImport(req, res, next) {
  try {
    const data = await productBulkUploadService.confirm(req.auth, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function cancelUpload(req, res, next) {
  try {
    const uploadId = req.params.uploadId || req.body?.uploadId;
    const data = await productBulkUploadService.cancel(req.auth, uploadId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  downloadTemplate,
  uploadFile,
  previewMapping,
  confirmImport,
  cancelUpload
};
