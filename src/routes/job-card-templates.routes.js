const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const controller = require("../controllers/job-card-templates.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/preview-mode", controller.getPreviewMode);
router.get("/templates/selected", controller.getSelectedTemplate);
router.get("/templates", controller.listTemplates);
router.post("/templates", controller.createTemplate);
router.get("/templates/:id", controller.getTemplate);
router.put("/templates/:id", controller.updateTemplate);
router.delete("/templates/:id", controller.deleteTemplate);

module.exports = router;
