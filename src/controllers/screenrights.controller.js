const screenRightsService = require("../bll/concretes/screenrights.service");

const getScreenRights = async (req, res) => {
  try {
    const data = await screenRightsService.getScreenRights(req.auth);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getScreenRights
};
