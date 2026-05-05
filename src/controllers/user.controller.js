const UserService = require("../bll/concretes/user.service");
const UserProfileService = require("../bll/concretes/userprofile.service");
const AuthService = require("../bll/concretes/auth.service");

const service = new UserService();
const profileService = new UserProfileService();
const authService = new AuthService();

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
    res.status(400).json({ error: err.message });
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

const updateProfile = async (req, res) => {
  try {
    const data = await profileService.updateProfile(req.auth.userid, req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const data = await profileService.changePassword(
      req.auth.userid,
      req.body.oldPassword,
      req.body.newPassword
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    const data = await profileService.updateProfileImage(
      req.auth.userid,
      req.body.imageUrl
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile,
  changePassword,
  updateProfileImage
};