const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const dropdownController = require("../controllers/dropdown.controller");
const resources = require("../config/resources");

/**
 * Create dropdown routes
 * All dropdowns available via /api/dropdowns/:resource endpoint
 * No RBAC applied - only JWT authentication required
 * Returns data filtered by tenant and branch from JWT token
 */
function createDropdownRoutes() {
  const router = express.Router();

  // Apply JWT authentication to all dropdown routes
  router.use(authenticateJwt);

  /**
   * GET /api/dropdowns/:resource
   * Get dropdown list for a resource
   * Query params: search (optional)
   */
  router.get("/:resourceName", async (req, res, next) => {
    try {
      const { resourceName } = req.params;

      if (!resources[resourceName]) {
        const err = new Error(`Unknown resource: ${resourceName}`);
        err.status = 404;
        return next(err);
      }

      const data = await dropdownController.getDropdown(resourceName, req.auth);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dropdowns
   * Get list of all available dropdown resources
   */
  router.get("/", (req, res) => {
    const availableResources = Object.entries(resources)
      .filter(([, config]) => !config.backendOnly && !config.noCreate)
      .map(([name, config]) => ({
        resource: name,
        label: config.tag,
        url: `/api/dropdowns/${name}`
      }));

    res.status(200).json({
      data: availableResources,
      total: availableResources.length
    });
  });

  return router;
}

module.exports = createDropdownRoutes;
