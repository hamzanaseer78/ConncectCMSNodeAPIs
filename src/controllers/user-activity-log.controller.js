const userActivityLogService = require("../services/user-activity-log.service");

async function listActivityLogs(req, res, next) {
  try {
    const data = await userActivityLogService.list(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

module.exports = {
  listActivityLogs
};
