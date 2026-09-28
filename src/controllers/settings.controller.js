const jobCodeSettingsService = require("../services/job-code-settings.service");

async function getJobCodeSettings(req, res, next) {
  try {
    const data = await jobCodeSettingsService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveJobCodeSettings(req, res, next) {
  try {
    const data = await jobCodeSettingsService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

module.exports = {
  getJobCodeSettings,
  saveJobCodeSettings
};
