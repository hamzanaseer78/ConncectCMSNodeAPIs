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

  /**
   * Public overall geo dropdowns (no JWT required).
   * GET /api/dropdowns/overall
   * GET /api/dropdowns/overall/countries
   * GET /api/dropdowns/overall/cities?countryId=
   */
  router.get("/overall", (req, res) => {
    res.status(200).json({
      data: [
        {
          resource: "countries",
          label: "Countries",
          url: "/api/dropdowns/overall/countries",
          source: "static",
          description: "ISO 3166-1 world countries (no database seed required)"
        },
        {
          resource: "cities",
          label: "Cities",
          url: "/api/dropdowns/overall/cities",
          source: "static",
          description: "All cities for the selected ISO country (matches overall/countries value)",
          requiredQuery: ["countryId"],
          filters: [
            {
              field: "countryid",
              queryParams: ["countryId", "countryid", "country", "countryCode", "countrycode"]
            }
          ]
        }
      ],
      total: 2,
      scope: "overall"
    });
  });

  router.get("/overall/countries", async (req, res, next) => {
    try {
      const data = await dropdownController.getOverallCountries();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get("/overall/cities", async (req, res, next) => {
    try {
      const data = await dropdownController.getOverallCities(req.query);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  // Apply JWT authentication to all other dropdown routes
  router.use(authenticateJwt);

  router.get("/customer-addresses", async (req, res, next) => {
    try {
      const data = await dropdownController.getCustomerAddresses(req.auth, req.query);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dropdowns/:resource
   * Get dropdown list for a resource
   * Query params: optional parent filters (see resource dropdownFilters in config), e.g. groupId, categoryId
   */
  router.get("/:resourceName", async (req, res, next) => {
    try {
      const { resourceName } = req.params;

      if (!resources[resourceName]) {
        const err = new Error(`Unknown resource: ${resourceName}`);
        err.status = 404;
        return next(err);
      }

      const data = await dropdownController.getDropdown(resourceName, req.auth, req.query);
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
      .filter(([, config]) => !config.backendOnly && !config.noCreate && config.tenantScoped !== false)
      .map(([name, config]) => ({
        resource: name,
        label: config.tag,
        url: `/api/dropdowns/${name}`,
        filters: (config.dropdownFilters || []).map((def) => ({
          field: def.field,
          queryParams: def.params
        }))
      }));

    res.status(200).json({
      data: [
        {
          resource: "customer-addresses",
          label: "Customer Addresses",
          url: "/api/dropdowns/customer-addresses",
          source: "database",
          description: "Customer default address plus additional saved addresses",
          requiredQuery: ["customerId"],
          filters: [
            {
              field: "customerid",
              queryParams: ["customerId", "customerid"]
            }
          ]
        },
        ...availableResources
      ],
      total: availableResources.length + 1
    });
  });

  return router;
}

module.exports = createDropdownRoutes;
