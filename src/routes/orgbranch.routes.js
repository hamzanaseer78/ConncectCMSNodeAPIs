const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const orgBranchController = require("../controllers/orgbranch.controller");

const router = express.Router();

// All org/branch endpoints require authentication
router.use(authenticateJwt);

// Organization routes
router.put("/organization", orgBranchController.updateOrganization);
router.put("/organization/logo", orgBranchController.updateOrganizationLogo);

// Branch routes  
router.put("/branch/:branchId", orgBranchController.updateBranch);
router.put("/branch/:branchId/logo", orgBranchController.updateBranchLogo);

module.exports = router;
