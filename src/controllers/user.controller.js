const UserService = require("../bll/concretes/user.service");
const UserProfileService = require("../bll/concretes/userprofile.service");
const serviceContainer = require("../utils/service-container");

const service = new UserService();
const profileService = new UserProfileService();
const authService = serviceContainer.getAuthService();
const adminUsersService = serviceContainer.getAdminUsersService();

const getUsers = async (req, res) => {
  try {
    const data = await service.getUsers();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createUser = async (req, res) => {
  try {
    const data = await service.createUser(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
};

const adminCreateUser = async (req, res, next) => {
  try {
    const data = await authService.inviteUser(req.auth, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

const adminListUsers = async (req, res, next) => {
  try {
    const data = await adminUsersService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const adminGetUser = async (req, res, next) => {
  try {
    const data = await adminUsersService.getById(req.auth, req.params.id, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const adminUpdateUser = async (req, res, next) => {
  try {
    const data = await adminUsersService.update(req.auth, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const adminSetUserActive = async (req, res, next) => {
  try {
    const isactive = req.body?.isactive;
    if (isactive === undefined) {
      return res.status(400).json({ error: "isactive is required (true or false)" });
    }
    const data = await adminUsersService.setActive(req.auth, req.params.id, isactive);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const adminSetUserBlocked = async (req, res, next) => {
  try {
    const isblocked = req.body?.isblocked;
    if (isblocked === undefined) {
      return res.status(400).json({ error: "isblocked is required (true or false)" });
    }
    const data = await adminUsersService.setBlocked(
      req.auth,
      req.params.id,
      isblocked,
      req.body?.branchid
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const getUserById = async (req, res) => {
  try {
    const data = await service.getUserById(req.params.id);
    if (!data) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const data = await service.updateUser(req.params.id, req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await service.deleteUser(req.params.id);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Profile APIs
const getProfile = async (req, res) => {
  try {
    const data = await authService.getProfile(req.auth);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateProfile = async (req, res, next) => {
  try {
    await profileService.updateProfile(req.auth.userid, req.body);
    const data = await authService.getProfile(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const data = await profileService.changePassword(
      req.auth.userid,
      req.body.oldPassword,
      req.body.newPassword
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

const updateProfileImage = async (req, res, next) => {
  try {
    const data = await profileService.uploadProfileImageFromRequest(
      req.auth,
      req,
      (auth) => authService.getProfile(auth)
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getUsers,
  createUser,
  adminCreateUser,
  adminUpdateUser,
  adminListUsers,
  adminGetUser,
  adminSetUserActive,
  adminSetUserBlocked,
  getUserById,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile,
  changePassword,
  updateProfileImage
};