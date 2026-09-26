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

  return items;
}

module.exports = {
  buildJobsReportsCatalog
};
