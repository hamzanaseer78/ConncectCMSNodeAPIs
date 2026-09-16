const announcementsService = require("../services/announcements.service");

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

async function list(req, res, next) {
  try {
    const data = await announcementsService.listForUser(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function getById(req, res, next) {
  try {
    const data = await announcementsService.getById(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function create(req, res, next) {
  try {
    const data = await announcementsService.create(req.auth, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function update(req, res, next) {
  try {
    const data = await announcementsService.update(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function remove(req, res, next) {
  try {
    const data = await announcementsService.remove(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function deactivate(req, res, next) {
  try {
    const data = await announcementsService.deactivate(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  requireAuthContext,
  list,
  getById,
  create,
  update,
  remove,
  deactivate
};
