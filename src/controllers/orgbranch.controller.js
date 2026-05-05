const OrgBranchService = require("../bll/concretes/orgbranch.service");

const service = new OrgBranchService();

const updateOrganization = async (req, res) => {
  try {
    const data = await service.updateOrganization(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateOrganizationLogo = async (req, res) => {
  try {
    const data = await service.updateOrganizationLogo(req.auth, req.body.logoUrl);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateBranch = async (req, res) => {
  try {
    const branchId = req.params.branchId;
    const data = await service.updateBranch(req.auth, branchId, req.body);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateBranchLogo = async (req, res) => {
  try {
    const branchId = req.params.branchId;
    const data = await service.updateBranchLogo(req.auth, branchId, req.body.logoUrl);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  updateOrganization,
  updateOrganizationLogo,
  updateBranch,
  updateBranchLogo
};
