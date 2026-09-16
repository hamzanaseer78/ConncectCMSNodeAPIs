const { z } = require("zod");
const jobsListReportService = require("../../src/services/jobs-list-report.service");
const jobsSummaryReportService = require("../../src/services/jobs-summary-report.service");
const { buildJobsReportsCatalog } = require("../../src/reports/jobs-reports-catalog");
const { textResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { paginationSchema, sortSchema, jsonRecord } = require("../helpers/schemas");

function registerReportsTools(server) {
  server.registerTool(
    "cms_reports_catalog",
    {
      description: "List available jobs reports (list + summary reports)."
    },
    withAuth(async () => textResult({ reports: buildJobsReportsCatalog() }))
  );

  server.registerTool(
    "cms_jobs_list_report",
    {
      description:
        "Run the jobs list report (GraphQL jobsListReport). filter.from and filter.to are required.",
      inputSchema: {
        page: paginationSchema.page,
        pageSize: paginationSchema.pageSize,
        sortBy: sortSchema.sortBy,
        sortOrder: sortSchema.sortOrder,
        filter: z
          .object({
            from: z.string().min(1),
            to: z.string().min(1)
          })
          .passthrough()
      }
    },
    withAuth(async (auth, args = {}) => {
      const data = await jobsListReportService.getReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_jobs_list_report_columns",
    {
      description: "Get saved column preferences for the jobs list report."
    },
    withAuth(async (auth) => {
      const columns = await jobsListReportService.getColumns(auth);
      return textResult({ columns });
    })
  );

  server.registerTool(
    "cms_jobs_summary_report",
    {
      description:
        "Run a grouped jobs summary report. Use cms_reports_catalog for reportKey values.",
      inputSchema: {
        reportKey: z.string().min(1),
        page: paginationSchema.page,
        pageSize: paginationSchema.pageSize,
        sortBy: sortSchema.sortBy,
        sortOrder: sortSchema.sortOrder,
        filter: jsonRecord
      }
    },
    withAuth(async (auth, { reportKey, ...args }) => {
      const data = await jobsSummaryReportService.getReport(auth, reportKey, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_jobs_summary_report_definitions",
    {
      description: "List summary report definitions (reportKey, title, grouping)."
    },
    withAuth(async () => {
      const definitions = jobsSummaryReportService.listDefinitions().map((def) => ({
        reportKey: def.reportKey,
        title: def.title,
        graphqlSuffix: def.graphqlSuffix,
        unassignedLabel: def.unassignedLabel
      }));
      return textResult({ definitions });
    })
  );
}

module.exports = {
  registerReportsTools
};
