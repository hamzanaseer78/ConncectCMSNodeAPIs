function createBulkUploadController(service) {
  return {
    async downloadTemplate(req, res, next) {
      try {
        const buffer = service.buildTemplateBuffer();
        const filename = service.templateFilename || "bulk-upload-template.xlsx";
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(200).send(buffer);
      } catch (err) {
        next(err);
      }
    },

    async uploadFile(req, res, next) {
      try {
        const data = await service.handleUpload(req.auth, req.file, req.bulkUploadId);
        res.status(200).json(data);
      } catch (err) {
        next(err);
      }
    },

    async previewMapping(req, res, next) {
      try {
        const data = await service.preview(req.auth, req.body);
        res.status(200).json(data);
      } catch (err) {
        next(err);
      }
    },

    async confirmImport(req, res, next) {
      try {
        const data = await service.confirm(req.auth, req.body);
        res.status(201).json(data);
      } catch (err) {
        next(err);
      }
    },

    async cancelUpload(req, res, next) {
      try {
        const uploadId = req.params.uploadId || req.body?.uploadId;
        const data = await service.cancel(req.auth, uploadId);
        res.status(200).json(data);
      } catch (err) {
        next(err);
      }
    }
  };
}

module.exports = { createBulkUploadController };
