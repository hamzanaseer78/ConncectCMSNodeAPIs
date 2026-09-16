const serviceContainer = require("../utils/service-container");
const mailService = require("../services/mail.service");
const UserProfileService = require("../bll/concretes/userprofile.service");

const service = serviceContainer.getAuthService();
const userProfileService = new UserProfileService();

const signup = async (req, res, next) => {
  try {
    const data = await service.signup({
      ...req.body,
      signupIp: req.ip
    });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

const verifySignupToken = async (req, res, next) => {
  try {
    const data = await service.verifySignupToken({
      email: req.body.email || req.query.email,
      token: req.body.token || req.query.token
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const configurePassword = async (req, res, next) => {
  try {
    const data = await service.configurePassword(req.body);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const createOrganization = async (req, res, next) => {
  try {
    const data = await service.createOrganization(req.body, req.auth || null);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const data = await service.login(req.body);
    const userActivityLogService = require("../services/user-activity-log.service");
    await userActivityLogService.logSafe(
      {
        tenantid: data.tenantid,
        branchid: data.branchid,
        userid: data.user?.userid
      },
      {
        module: "auth",
        action: "login",
        entityName: data.user?.name ?? null,
        entityId: data.user?.userid ?? null,
        summary: `Logged in${data.user?.email ? ` (${data.user.email})` : ""}`
      },
      req
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const switchContext = async (req, res, next) => {
  try {
    const data = await service.switchContext(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const inviteUser = async (req, res, next) => {
  try {
    const data = await service.inviteUser(req.auth, req.body);
    const userActivityLogService = require("../services/user-activity-log.service");
    await userActivityLogService.logSafe(
      req.auth,
      {
        module: "users",
        action: data.isNewUser ? "invite" : "update",
        entityName: req.body?.name ?? null,
        entityId: data.userid ?? null,
        entityCode: data.email ?? null,
        summary: data.isNewUser
          ? `Invited user ${data.email || ""}`.trim()
          : `Updated user ${data.email || ""}`.trim()
      },
      req
    );
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const data = await service.getProfile(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    await userProfileService.updateProfile(req.auth.userid, req.body);
    const data = await service.getProfile(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const data = await userProfileService.changePassword(
      req.auth.userid,
      req.body?.oldPassword,
      req.body?.newPassword
    );
    const userActivityLogService = require("../services/user-activity-log.service");
    await userActivityLogService.logSafe(
      req.auth,
      {
        module: "users",
        action: "password_changed",
        entityName: req.auth?.name ?? null,
        entityId: req.auth.userid,
        summary: "Password changed"
      },
      req
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const data = await service.requestPasswordReset({
      email: req.body?.email,
      baseUrl: req.body?.baseUrl
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const data = await service.resetPassword(req.body);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const uploadProfileImage = async (req, res, next) => {
  try {
    const data = await userProfileService.uploadProfileImageFromRequest(req.auth, req, (auth) =>
      service.getProfile(auth)
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const sendTestMail = async (req, res, next) => {
  try {
    await service.ensureAdmin(req.auth.userid, req.auth.tenantid, req.auth.branchid);
    const to = req.body?.email || req.auth.email;
    if (!to) {
      return res.status(400).json({ error: "Target email required in body.email or JWT email" });
    }

    const result = await mailService.sendTestMail(to, req.auth);
    res.status(200).json({
      message: "Test email sent",
      to,
      ...result
    });
  } catch (err) {
    next(err);
  }
};




module.exports = {
  changePassword,
  configurePassword,
  createOrganization,
  forgotPassword,
  getProfile,
  updateProfile,
  inviteUser,
  login,
  resetPassword,
  sendTestMail,
  signup,
  switchContext,
  uploadProfileImage,
  verifySignupToken
};
