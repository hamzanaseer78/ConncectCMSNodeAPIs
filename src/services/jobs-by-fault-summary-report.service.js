const jobsSummaryReportService = require("./jobs-summary-report.service");

module.exports = {
  getColumns: (auth) => jobsSummaryReportService.getColumns(auth, "jobs_by_fault_summary"),
  updateColumns: (auth, columns) =>
    jobsSummaryReportService.updateColumns(auth, "jobs_by_fault_summary", columns),
  getReport: (auth, args) => jobsSummaryReportService.getReport(auth, "jobs_by_fault_summary", args)
};
