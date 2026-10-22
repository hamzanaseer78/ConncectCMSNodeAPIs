const jobCardTemplatesService = require("../services/job-card-templates.service");
const jobsWorkflowService = require("../services/jobs-workflow.service");

function fail(err, next) {
  if (err.status) err.statusCode = err.status;
  next(err);
}

async function getPreviewMode(req, res, next) {
  try {
    res.status(200).json(jobCardTemplatesService.previewModePayload());
  } catch (err) {
    fail(err, next);
  }
}

async function listTemplates(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.listTemplates(req.auth));
  } catch (err) {
    fail(err, next);
  }
}

async function getSelectedTemplate(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.getSelectedTemplate(req.auth));
  } catch (err) {
    fail(err, next);
  }
}

async function getTemplate(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.getTemplate(req.auth, req.params.id));
  } catch (err) {
    fail(err, next);
  }
}

async function createTemplate(req, res, next) {
  try {
    res.status(201).json(await jobCardTemplatesService.saveTemplate(req.auth, req.body));
  } catch (err) {
    fail(err, next);
  }
}

async function updateTemplate(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.saveTemplate(req.auth, req.body, req.params.id));
  } catch (err) {
    fail(err, next);
  }
}

async function deleteTemplate(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.deleteTemplate(req.auth, req.params.id));
  } catch (err) {
    fail(err, next);
  }
}

async function getCardData(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.getCardData(req.auth, req.params.id, jobsWorkflowService));
  } catch (err) {
    fail(err, next);
  }
}

async function renderCard(req, res, next) {
  try {
    res.status(200).json(await jobCardTemplatesService.renderCard(req.auth, req.params.id, req.body, jobsWorkflowService));
  } catch (err) {
    fail(err, next);
  }
}

module.exports = {
  getPreviewMode,
  listTemplates,
  getSelectedTemplate,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getCardData,
  renderCard
};
