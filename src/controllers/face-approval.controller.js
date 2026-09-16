const faceApprovalService = require("../services/face-approval.service");

function requireAuthContext(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

function handleError(err, next) {
  if (err.status) err.statusCode = err.status;
  next(err);
}

async function getSettings(req, res, next) {
  try {
    const data = await faceApprovalService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function saveSettings(req, res, next) {
  try {
    const data = await faceApprovalService.saveSettings(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function getUserSettings(req, res, next) {
  try {
    const data = await faceApprovalService.getUserSettings(req.auth, req.params.userid);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function saveUserSettings(req, res, next) {
  try {
    const data = await faceApprovalService.saveUserSettings(
      req.auth,
      req.params.userid,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function getMyStatus(req, res, next) {
  try {
    const data = await faceApprovalService.getMyStatus(req.auth);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function submitRequest(req, res, next) {
  try {
    const data = await faceApprovalService.submitRequest(req.auth, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function listRequests(req, res, next) {
  try {
    const data = await faceApprovalService.listRequests(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function listPending(req, res, next) {
  try {
    const data = await faceApprovalService.listPending(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function getRequest(req, res, next) {
  try {
    const data = await faceApprovalService.getRequest(req.auth, req.params.requestId);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function approveRequest(req, res, next) {
  try {
    const data = await faceApprovalService.approveRequest(
      req.auth,
      req.params.requestId,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function rejectRequest(req, res, next) {
  try {
    const data = await faceApprovalService.rejectRequest(
      req.auth,
      req.params.requestId,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  requireAuthContext,
  getSettings,
  saveSettings,
  getUserSettings,
  saveUserSettings,
  getMyStatus,
  submitRequest,
  listRequests,
  listPending,
  getRequest,
  approveRequest,
  rejectRequest
};
