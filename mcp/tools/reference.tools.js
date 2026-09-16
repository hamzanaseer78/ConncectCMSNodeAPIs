const { z } = require("zod");
const resources = require("../../src/config/resources");
const dropdownController = require("../../src/controllers/dropdown.controller");
const { buildDropdownCatalog, buildResourceCatalog } = require("../catalogs/resources");
const { textResult, errorResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { jsonRecord } = require("../helpers/schemas");

function registerReferenceTools(server) {
  server.registerTool(
    "cms_resources_catalog",
    {
      description: "List generic REST resources available via cms_list_resource / cms_get_resource."
    },
    withAuth(async () => textResult({ data: buildResourceCatalog() }))
  );

  server.registerTool(
    "cms_dropdown_catalog",
    {
      description:
        "List dropdown resources available for the authenticated tenant/branch."
    },
    withAuth(async () => textResult(buildDropdownCatalog()))
  );

  server.registerTool(
    "cms_dropdown",
    {
      description:
        "Fetch a tenant/branch-scoped dropdown (same as GET /api/dropdowns/:resource).",
      inputSchema: {
        resource: z.string().min(1),
        query: jsonRecord
      }
    },
    withAuth(async (auth, { resource, query = {} }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      const data = await dropdownController.getDropdown(resource, auth, query);
      return textResult(data);
    })
  );
}

module.exports = {
  registerReferenceTools
};
