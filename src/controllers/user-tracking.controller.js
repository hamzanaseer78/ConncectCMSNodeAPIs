const userTrackingService = require("../services/user-tracking.service");

function requireAuthContext(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

async function postPing(req, res, next) {
  try {
    const data = await userTrackingService.recordPing(req.auth, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function getLive(req, res, next) {
  try {
    const data = await userTrackingService.getLiveLocations(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAuthContext,
  postPing,
  getLive
};
