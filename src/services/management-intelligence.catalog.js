const REPORTS = Object.freeze([
  { key: "jobs_by_status", title: "Jobs by Status", group: "Jobs", type: "dimension", dimension: "status", defaultSort: "jobs" },
  { key: "jobs_by_technician", title: "Jobs by Technician", group: "Jobs", type: "dimension", dimension: "technician", defaultSort: "jobs" },
  { key: "jobs_by_customer", title: "Jobs by Customer", group: "Jobs", type: "dimension", dimension: "customer", defaultSort: "jobs" },
  { key: "jobs_by_category", title: "Jobs by Category", group: "Jobs", type: "dimension", dimension: "category", defaultSort: "jobs" },
  { key: "jobs_by_fault", title: "Jobs by Fault", group: "Jobs", type: "dimension", dimension: "fault", defaultSort: "jobs" },
  { key: "jobs_by_group", title: "Jobs by Group", group: "Jobs", type: "dimension", dimension: "group", defaultSort: "jobs" },
  { key: "jobs_by_brand", title: "Jobs by Brand", group: "Jobs", type: "dimension", dimension: "brand", defaultSort: "jobs" },
  { key: "jobs_by_source", title: "Jobs by Source", group: "Jobs", type: "dimension", dimension: "source", defaultSort: "jobs" },
  { key: "jobs_by_area", title: "Jobs by Area", group: "Jobs", type: "dimension", dimension: "area", defaultSort: "jobs" },
  { key: "jobs_by_city", title: "Jobs by City", group: "Jobs", type: "dimension", dimension: "city", defaultSort: "jobs" },
  { key: "jobs_by_product", title: "Jobs by ERP Product", group: "Jobs", type: "dimension", dimension: "product", defaultSort: "jobs" },
  { key: "job_balances", title: "Job Amounts and Collections", group: "Financial", type: "balances", defaultSort: "outstanding" },
  { key: "expenses_by_technician", title: "Expenses by Technician", group: "Expenses", type: "dimension", dimension: "technician", defaultSort: "expenses" },
  { key: "collections_by_collector", title: "Collections by Collector", group: "Collections", type: "collections", defaultSort: "collected" },
  { key: "cpair_by_technician", title: "C-Pair by Technician", group: "C-Pair", type: "cpair", defaultSort: "outstanding" }
]);

const LIMITS = Object.freeze([
  "Amount to collect is job.totalcost, the same figure as the Job Revenue report. It is not cash collected.",
  "Collected cash is jobcollections.amount. A job has at most one collection row.",
  "Expenses are the sum of jobexpenses.amount. Amount to collect minus expenses is not net profit.",
  "Pending jobs are new jobs plus assigned jobs, using the Jobs List status rules.",
  "There is no stored overdue date, late arrival, on-leave status, or technician remittance ledger.",
  "C-Pair figures are quantities from jobcpairsummary, not money.",
  "Live attendance is the open session only: checked in or on break. An empty stop time on travel or work history means on the way or on location.",
  "Product and model totals on job lines are not aggregated here, because one job can have many lines and that would double-count the job total."
]);

function getReportDefinition(key) {
  return REPORTS.find((report) => report.key === key) || null;
}

function listReportCatalog() {
  return REPORTS.map((report) => ({
    key: report.key,
    title: report.title,
    group: report.group
  }));
}

module.exports = {
  REPORTS,
  LIMITS,
  getReportDefinition,
  listReportCatalog
};
