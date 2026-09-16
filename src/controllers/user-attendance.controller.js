const userAttendanceService = require("../services/user-attendance.service");

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

async function getMyStatus(req, res, next) {
  try {
    const data = await userAttendanceService.getMyStatus(req.auth);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function checkIn(req, res, next) {
  try {
    const data = await userAttendanceService.checkIn(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function checkOut(req, res, next) {
  try {
    const data = await userAttendanceService.checkOut(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function breakIn(req, res, next) {
  try {
    const data = await userAttendanceService.breakIn(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function breakOut(req, res, next) {
  try {
    const data = await userAttendanceService.breakOut(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function listBranchUsers(req, res, next) {
  try {
    const data = await userAttendanceService.listBranchUsers(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function getSessionLogs(req, res, next) {
  try {
    const data = await userAttendanceService.getSessionLogs(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function listMyAttendance(req, res, next) {
  try {
    const data = await userAttendanceService.listMyAttendance(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  requireAuthContext,
  getMyStatus,
  listMyAttendance,
  checkIn,
  checkOut,
  breakIn,
  breakOut,
  listBranchUsers,
  getSessionLogs
};
