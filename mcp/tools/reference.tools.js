const { z } = require("zod");
const resources = require("../../src/config/resources");
const dropdownController = require("../../src/controllers/dropdown.controller");
const prisma = require("../../src/database/prisma");
const { buildDropdownCatalog, buildResourceCatalog } = require("../catalogs/resources");
const { textResult, errorResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { jsonRecord } = require("../helpers/schemas");
const { searchJobEntities, decideResolution, JOB_LINKS } = require("../../src/services/entity-resolution");

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

  server.registerTool(
    "cms_search_entities",
    {
      description:
        "Resolve a name inside the signed-in tenant and branch across customers, technicians, users, brands, categories, subcategories, and groups. Does not return jobs.",
      inputSchema: {
        name: z.string().min(1).max(60),
        hintedType: z.enum(["customer", "technician", "user", "brand", "category", "fault", "group"]).optional()
      }
    },
    withAuth(async (auth, { name, hintedType }) => {
      const tenantScope = { tenantid: Number(auth.tenantid), branchid: Number(auth.branchid) };
      const candidates = await searchJobEntities(prisma, tenantScope, name);
      const decision = decideResolution({
        requestedName: name,
        hintedType: hintedType || null,
        preferredType: null,
        candidates
      }, tenantScope);
      return textResult({
        outcome: decision.outcome,
        message: decision.message,
        subject: decision.subject,
        choices: (decision.choices || []).map((choice) => ({
          entityType: choice.entityType,
          entityId: choice.entityId,
          displayName: choice.displayName,
          detail: choice.detail,
          relationship: JOB_LINKS[choice.entityType] || null
        }))
      });
    })
  );
}

module.exports = {
  registerReferenceTools
};
