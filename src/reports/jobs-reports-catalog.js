const { listJobsSummaryReportDefinitions } = require("./jobs-summary-report.registry");
const {
  TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
  TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY
} = require("./technician-monthly-bills-report");
const { JOB_REVENUE_REPORT_KEY } = require("./job-revenue-report");
const { CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY } = require("./cpair-received-not-issued-report");
const { CPAIR_RECEIVABLE_REPORT_KEY } = require("./cpair-receivable-report");
const {
  PARTS_WARRANTY_CONSUMPTION_REPORT_KEY
} = require("./parts-warranty-consumption-report");

function buildJobsReportsCatalog() {
  const items = [
    {
      reportKey: "jobs_list",
      title: "Jobs List Report",
      kind: "detail",
      dataQuery: "jobsListReport",
      columnsQuery: "jobsListReportColumns",
      updateColumnsMutation: "updateJobsListReportColumns",
      exportEndpoint: "/api/jobs-all/reports/jobs-list/export",
      detailDataQuery: null
    },
    {
      reportKey: "technician_aging",
      title: "Technician wise Aging Report",
      kind: "summary",
      dataQuery: "technicianAgingReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "open_job_aging",
      title: "Open Job Aging",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "technician_performance",
      title: "Technician Performance",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "outstanding_collections",
      title: "Outstanding Collections",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "expenses_by_technician",
      title: "Expenses by Technician",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "first_response_sla",
      title: "First Response / SLA",
      kind: "detail",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "on_the_way_on_location",
      title: "On the Way / On Location",
      kind: "detail",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "cancelled_jobs",
      title: "Cancelled Jobs",
      kind: "detail",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "repeat_jobs",
      title: "Repeat Jobs",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "quotation_funnel",
      title: "Quotation Funnel",
      kind: "summary",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "parts_used",
      title: "Parts Used on Jobs",
      kind: "detail",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: "cpair_aging",
      title: "C-pair Aging",
      kind: "cpair",
      dataQuery: "opsReport",
      columnsQuery: null,
      updateColumnsMutation: null,
      detailDataQuery: "jobsListReport"
    },
    {
      reportKey: TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
      title: "Technician Monthly Bills (Summary)",
      kind: "summary",
      dataQuery: "technicianMonthlyBillsSummaryReport",
      columnsQuery: "technicianMonthlyBillsSummaryReportColumns",
      updateColumnsMutation: "updateTechnicianMonthlyBillsSummaryReportColumns",
      detailDataQuery: "technicianMonthlyBillsDetailReport"
    },
    {
      reportKey: TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
      title: "Technician Monthly Bills (Detail)",
      kind: "detail",
      dataQuery: "technicianMonthlyBillsDetailReport",
      columnsQuery: "technicianMonthlyBillsDetailReportColumns",
      updateColumnsMutation: "updateTechnicianMonthlyBillsDetailReportColumns",
      detailDataQuery: null
    },
    {
      reportKey: JOB_REVENUE_REPORT_KEY,
      title: "Job-wise Revenue Report",
      kind: "detail",
      dataQuery: "jobRevenueReport",
      columnsQuery: "jobRevenueReportColumns",
      updateColumnsMutation: "updateJobRevenueReportColumns",
      detailDataQuery: null
    },
    {
      reportKey: CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
      title: "C-pair Received Not Issued",
      kind: "cpair",
      dataQuery: "cpairReceivedNotIssuedReport",
      columnsQuery: "cpairReceivedNotIssuedReportColumns",
      updateColumnsMutation: "updateCpairReceivedNotIssuedReportColumns",
      detailDataQuery: null,
      restEndpoint: "/api/jobs/cpair/overview?lineIssueStatus=pending"
    },
    {
      reportKey: CPAIR_RECEIVABLE_REPORT_KEY,
      title: "C-pair Receivable",
      kind: "cpair",
      dataQuery: "cpairReceivableReport",
      columnsQuery: "cpairReceivableReportColumns",
      updateColumnsMutation: "updateCpairReceivableReportColumns",
      detailDataQuery: null,
      restEndpoint: "/api/jobs/cpair/overview?lineReceiveStatus=pending"
    },
    {
      reportKey: PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
      title: "Parts Consumption (Warranty Jobs)",
      kind: "detail",
      dataQuery: "partsWarrantyConsumptionReport",
      columnsQuery: "partsWarrantyConsumptionReportColumns",
      updateColumnsMutation: "updatePartsWarrantyConsumptionReportColumns",
      detailDataQuery: null
    }
  ];

  listJobsSummaryReportDefinitions().forEach((definition) => {
    const suffix = definition.graphqlSuffix;
    items.push({
      reportKey: definition.reportKey,
      title: definition.title,
      kind: "summary",
      dataQuery: `jobsBy${suffix}SummaryReport`,
      columnsQuery: `jobsBy${suffix}SummaryReportColumns`,
      updateColumnsMutation: `updateJobsBy${suffix}SummaryReportColumns`,
      detailDataQuery: "jobsListReport"
    });
  });

  return items.map((item) => ({
    ...item,
    columnsQuery: item.columnsQuery || "",
    updateColumnsMutation: item.updateColumnsMutation || ""
  }));
}

module.exports = {
  buildJobsReportsCatalog
};
