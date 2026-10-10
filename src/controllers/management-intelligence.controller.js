const intelligence = require("../services/management-intelligence.service");

function forward(err, next) {
  if (err.status) err.statusCode = err.status;
  next(err);
}

async function getCatalog(req, res, next) {
  try {
    res.status(200).json(intelligence.getCatalog());
  } catch (err) {
    forward(err, next);
  }
}

async function getOverview(req, res, next) {
  try {
    res.status(200).json(await intelligence.getOverview(req.auth, req.query));
  } catch (err) {
    forward(err, next);
  }
}

async function askQuestion(req, res, next) {
  try {
    const message = String(req.body?.message || req.body?.question || "").trim();
    if (!message) {
      const err = new Error("message is required");
      err.status = 400;
      throw err;
    }
    const stateProvided = Boolean(req.body) && Object.prototype.hasOwnProperty.call(req.body, "conversationState");
    res.status(200).json(await intelligence.answerQuestion(
      req.auth,
      message,
      req.body?.history,
      req.body?.conversationState,
      stateProvided,
      req.body?.conversationId
    ));
  } catch (err) {
    forward(err, next);
  }
}

async function getReport(req, res, next) {
  try {
    res.status(200).json(await intelligence.getReport(req.auth, req.params.reportKey, req.query));
  } catch (err) {
    forward(err, next);
  }
}

async function exportReport(req, res, next) {
  try {
    const csv = await intelligence.exportReport(req.auth, req.params.reportKey, req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${csv.filename}"`);
    res.status(200).send(csv.body);
  } catch (err) {
    forward(err, next);
  }
}

module.exports = {
  getCatalog,
  getOverview,
  askQuestion,
  getReport,
  exportReport
};
