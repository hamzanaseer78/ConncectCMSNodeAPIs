const { z } = require("zod");
const {
  resolveDashboardAccess,
  buildEmptyDashboardResponse
} = require("../../src/utils/dashboard-access");
const {
  listDashboardSections,
  runDashboardSection
} = require("../catalogs/dashboard-sections");
const { textResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { jsonRecord } = require("../helpers/schemas");

function registerDashboardTools(server) {
  server.registerTool(
    "cms_dashboard_sections",
    {
      description: "List admin dashboard sections available via cms_dashboard."
    },
    withAuth(async () => textResult({ sections: listDashboardSections() }))
  );

  server.registerTool(
    "cms_dashboard",
    {
      description:
        "Fetch an admin dashboard section (same as GET /api/dashboard/:section). Requires dashboard access.",
      inputSchema: {
        section: z.string().min(1),
        query: jsonRecord
      }
    },
    withAuth(async (auth, { section, query = {} }) => {
      const access = await resolveDashboardAccess(auth);
      if (!access.canView) {
        return textResult(buildEmptyDashboardResponse(section, auth, query));
      }
      const data = await runDashboardSection(auth, section, query);
      return textResult({ section, data });
    })
  );
}

module.exports = {
  registerDashboardTools
};
