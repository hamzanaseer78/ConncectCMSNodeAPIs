const serviceContainer = require("../utils/service-container");
const mailService = require("../services/mail.service");

const service = serviceContainer.getAuthService();

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
  configurePassword,
  createOrganization,
  getProfile,
  inviteUser,
  login,
  sendTestMail,
  signup,
  switchContext,
  verifySignupToken
};
