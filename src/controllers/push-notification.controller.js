const pushNotificationService = require("../services/push-notification.service");
const userNotificationService = require("../services/user-notification.service");
const serviceContainer = require("../utils/service-container");

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

async function registerDeviceToken(req, res, next) {
  try {
    const data = await pushNotificationService.registerDeviceToken(
      req.auth.userid,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function removeDeviceToken(req, res, next) {
  try {
    const data = await pushNotificationService.removeDeviceToken(
      req.auth.userid,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function sendTest(req, res, next) {
  try {
    const authService = serviceContainer.getAuthService();
    await authService.ensureAdmin(req.auth.userid, req.auth.tenantid, req.auth.branchid);

    const data = await pushNotificationService.sendTestNotification(req.auth, req.body || {});
    res.status(200).json({
      configured: pushNotificationService.isConfigured(),
      ...data
    });
  } catch (err) {
    handleError(err, next);
  }
}

async function getStatus(req, res, next) {
  try {
    res.status(200).json({
      configured: pushNotificationService.isConfigured(),
      firestoreInbox: userNotificationService.isConfigured()
    });
  } catch (err) {
    handleError(err, next);
  }
}

async function listNotifications(req, res, next) {
  try {
    const data = await userNotificationService.listForUser(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const data = await userNotificationService.markAllAsRead(req.auth);
    res.status(200).json(data);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  requireAuthContext,
  registerDeviceToken,
  removeDeviceToken,
  sendTest,
  getStatus,
  listNotifications,
  markAllNotificationsRead
};
