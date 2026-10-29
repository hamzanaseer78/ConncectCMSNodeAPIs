const { headingFor } = require("./column-labels");

function numberOf(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && typeof value.toNumber === "function") return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inRange(value, range) {
  if (!range?.from || !range?.to) return true;
  if (value == null) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return time >= range.from.getTime() && time < range.to.getTime();
}

function tableRows(snapshot, name) {
  const table = snapshot?.tables?.[name];
  return Array.isArray(table?.rows) ? table.rows : [];
}

function displayOf(snapshot, tableName, id, fallback) {
  const rows = tableRows(snapshot, tableName);
  const found = rows.find((row) => Number(row.userid ?? row.recno ?? row.customerid ?? row.branchid) === Number(id));
  if (!found) return fallback ?? null;
  return found.name || found.title || found.label || fallback || null;
}

function columnsFrom(rows, sourceTable) {
  return Object.keys(rows[0] || {}).map((key) => {
    const label = headingFor(key, { sourceTable });
    return label ? { key, label } : null;
  }).filter(Boolean);
}

function filterJobs(snapshot, options = {}) {
  const jobs = tableRows(snapshot, "job");
  return jobs.filter((job) => {
    if (options.range && !inRange(job.date, options.range)) return false;
    if (options.assignedto != null && Number(job.assignedto) !== Number(options.assignedto)) return false;
    if (options.customerid != null && Number(job.customerid) !== Number(options.customerid)) return false;
    if (options.statusid != null && Number(job.statusid) !== Number(options.statusid)) return false;
    if (options.statusFilter === "resolved" && !job.isresolved) return false;
    if (options.statusFilter === "pending" && (job.isresolved || job.iscompleted)) return false;
    return true;
  });
}

function enrichJob(snapshot, job) {
  return {
    recno: job.recno,
    date: job.date,
    assignedto: displayOf(snapshot, "users", job.assignedto, job.assignedto),
    customerid: displayOf(snapshot, "customers", job.customerid, job.customerid),
    statusid: displayOf(snapshot, "jobstatuses", job.statusid, job.statusid),
    totalcost: numberOf(job.totalcost)
  };
}

function queryTechnicianJobs(snapshot, options = {}) {
  const jobs = filterJobs(snapshot, options);
  const grouped = new Map();
  jobs.forEach((job) => {
    const key = Number(job.assignedto) || 0;
    const current = grouped.get(key) || {
      assignedto: displayOf(snapshot, "users", job.assignedto, "Unassigned"),
      job_count: 0,
      totalcost: 0
    };
    current.job_count += 1;
    current.totalcost += numberOf(job.totalcost);
    grouped.set(key, current);
  });
  const rows = [...grouped.values()].sort((a, b) => b.job_count - a.job_count);
  return {
    report: "technician_jobs",
    verified: true,
    source: "cache",
    sourceTable: "job",
    count: jobs.length,
    rows,
    columns: columnsFrom(rows, "job"),
    truncated: Boolean(snapshot?.tables?.job?.truncated)
  };
}

function queryStatusJobs(snapshot, options = {}) {
  const jobs = filterJobs(snapshot, options);
  const grouped = new Map();
  jobs.forEach((job) => {
    const key = Number(job.statusid) || 0;
    const current = grouped.get(key) || {
      statusid: displayOf(snapshot, "jobstatuses", job.statusid, "Unknown"),
      job_count: 0
    };
    current.job_count += 1;
    grouped.set(key, current);
  });
  const rows = [...grouped.values()].sort((a, b) => b.job_count - a.job_count);
  return {
    report: "status_jobs",
    verified: true,
    source: "cache",
    sourceTable: "job",
    count: jobs.length,
    rows,
    columns: columnsFrom(rows, "job"),
    truncated: Boolean(snapshot?.tables?.job?.truncated)
  };
}

function queryFinancial(snapshot, options = {}) {
  const jobs = tableRows(snapshot, "job");
  const expenses = tableRows(snapshot, "jobexpenses");
  const collections = tableRows(snapshot, "jobcollections");
  if (!jobs.length && !expenses.length && !collections.length) return null;
  if (jobs.length && !Object.prototype.hasOwnProperty.call(jobs[0] || {}, "totalcost")) return null;
  const range = options.range;
  const amountToCollect = jobs.filter((job) => inRange(job.date, range)).reduce((sum, job) => sum + numberOf(job.totalcost), 0);
  const expenseTotal = expenses.filter((row) => inRange(row.createdat, range)).reduce((sum, row) => sum + numberOf(row.amount), 0);
  const collected = collections.filter((row) => inRange(row.collectedat, range)).reduce((sum, row) => sum + numberOf(row.amount), 0);
  const rows = [
    { metric: "Amount to collect", amount: amountToCollect },
    { metric: "Expenses", amount: expenseTotal },
    { metric: "Cash collected", amount: collected }
  ];
  return {
    report: "financial",
    verified: true,
    source: "cache",
    sourceTable: "job",
    totals: { amountToCollect, expenseTotal, collected },
    rows,
    columns: [
      { key: "metric", label: "Metric" },
      { key: "amount", label: "Amount" }
    ],
    truncated: Boolean(snapshot?.tables?.job?.truncated || snapshot?.tables?.jobexpenses?.truncated)
  };
}

function queryEntityJobs(snapshot, options = {}) {
  const jobs = filterJobs(snapshot, options).map((job) => enrichJob(snapshot, job));
  return {
    report: "entity_jobs",
    verified: true,
    source: "cache",
    sourceTable: "job",
    count: jobs.length,
    rows: jobs.slice(0, 50),
    columns: columnsFrom(jobs, "job"),
    truncated: Boolean(snapshot?.tables?.job?.truncated) || jobs.length > 50
  };
}

function queryFromCache(snapshot, intent, subject) {
  if (!snapshot?.complete) return null;
  const options = {
    range: intent.range,
    statusFilter: intent.statusFilter
  };
  if (subject?.type === "customer") options.customerid = subject.id;
  if (subject && ["technician", "manager", "admin", "user"].includes(subject.type)) {
    options.assignedto = subject.id;
  }
  if (intent.report === "technician_jobs") return queryTechnicianJobs(snapshot, options);
  if (intent.report === "status_jobs") return queryStatusJobs(snapshot, options);
  if (intent.report === "financial") return queryFinancial(snapshot, options);
  if (intent.report === "entity_jobs" || (subject && intent.report === "jobs")) {
    return queryEntityJobs(snapshot, options);
  }
  if (intent.report === "jobs") return queryStatusJobs(snapshot, options);
  return null;
}

module.exports = {
  queryFromCache,
  queryTechnicianJobs,
  queryStatusJobs,
  queryFinancial,
  queryEntityJobs,
  filterJobs,
  numberOf
};
