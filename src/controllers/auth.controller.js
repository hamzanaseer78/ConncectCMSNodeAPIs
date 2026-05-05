const AuthService = require("../bll/concretes/auth.service");

const service = new AuthService();

const signup = async (req, res) => {
  try {
    const data = await service.signup({
      ...req.body,
      signupIp: req.ip
    });
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const verifySignupToken = async (req, res) => {
  try {
    const data = await service.verifySignupToken({
      email: req.body.email || req.query.email,
      token: req.body.token || req.query.token
    });
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const configurePassword = async (req, res) => {
  try {
    const data = await service.configurePassword(req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const createOrganization = async (req, res) => {
  try {
    const data = await service.createOrganization(req.body, req.auth || null);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const login = async (req, res) => {
  try {
    debugger;
    const data = await service.login(req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

const switchContext = async (req, res) => {
  try {
    const data = await service.switchContext(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const inviteUser = async (req, res) => {
  try {
    const data = await service.inviteUser(req.auth, req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  configurePassword,
  createOrganization,
  inviteUser,
  login,
  signup,
  switchContext,
  verifySignupToken
};
