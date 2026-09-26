const { z } = require("zod");
const jobsListReportService = require("../../src/services/jobs-list-report.service");
const jobsSummaryReportService = require("../../src/services/jobs-summary-report.service");
const technicianMonthlyBillsReportService = require("../../src/services/technician-monthly-bills-report.service");
const jobRevenueReportService = require("../../src/services/job-revenue-report.service");
const cpairReceivedNotIssuedReportService = require("../../src/services/cpair-received-not-issued-report.service");
const cpairReceivableReportService = require("../../src/services/cpair-receivable-report.service");
const partsWarrantyConsumptionReportService = require("../../src/services/parts-warranty-consumption-report.service");
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
    "cms_technician_monthly_bills_summary_report",
    {
      description:
        "Technician monthly bills summary (cash collected vs expenses). filter.from and filter.to are required.",
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
      const data = await technicianMonthlyBillsReportService.getSummaryReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_technician_monthly_bills_detail_report",
    {
      description:
        "Technician monthly bills detail (per job cash and expenses). filter.from and filter.to are required.",
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
      const data = await technicianMonthlyBillsReportService.getDetailReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_cpair_receivable_report",
    {
      description:
        "C-pair receivable: expected qty not yet fully received from technicians.",
      inputSchema: {
        page: paginationSchema.page,
        pageSize: paginationSchema.pageSize,
        sortBy: sortSchema.sortBy,
        sortOrder: sortSchema.sortOrder,
        filter: jsonRecord
      }
    },
    withAuth(async (auth, args = {}) => {
      const data = await cpairReceivableReportService.getReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_cpair_received_not_issued_report",
    {
      description:
        "C-pair lines received from technicians but not fully issued to store (qty pending issue > 0).",
      inputSchema: {
        page: paginationSchema.page,
        pageSize: paginationSchema.pageSize,
        sortBy: sortSchema.sortBy,
        sortOrder: sortSchema.sortOrder,
        filter: jsonRecord
      }
    },
    withAuth(async (auth, args = {}) => {
      const data = await cpairReceivedNotIssuedReportService.getReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_job_revenue_report",
    {
      description:
        "Job-wise revenue report (amount to collect vs collected cash). filter.from and filter.to are required.",
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
      const data = await jobRevenueReportService.getReport(auth, args);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_parts_warranty_consumption_report",
    {
      description:
        "Parts consumption on warranty jobs (job product lines, non-service items, qty > 0).",
      inputSchema: {
        page: paginationSchema.page,
        pageSize: paginationSchema.pageSize,
        sortBy: sortSchema.sortBy,
        sortOrder: sortSchema.sortOrder,
        filter: jsonRecord
      }
    },
    withAuth(async (auth, args = {}) => {
      const data = await partsWarrantyConsumptionReportService.getReport(auth, args);
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
