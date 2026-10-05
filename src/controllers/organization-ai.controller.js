const organizationAiService = require("../services/organization-ai.service");

async function getAiSetup(req, res, next) {
  try {
    const data = await organizationAiService.getSetup(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveAiSetup(req, res, next) {
  try {
    const data = await organizationAiService.saveSetup(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function askAi(req, res, next) {
  try {
    const data = await organizationAiService.ask(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.details) {
      res.status(err.status || 402).json({
        error: err.message,
        status: err.status || 402,
        ...err.details
      });
      return;
    }
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

module.exports = {
  getAiSetup,
  saveAiSetup,
  askAi
};
