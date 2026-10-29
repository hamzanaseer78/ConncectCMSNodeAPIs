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

function statusTitleOf(snapshot, job) {
  return String(displayOf(snapshot, "jobstatuses", job.statusid, "") || "").toLowerCase();
}

function jobMatchesStatus(snapshot, job, statusFilter) {
  if (!statusFilter) return true;
  const wanted = String(statusFilter).toLowerCase();
  const title = statusTitleOf(snapshot, job);
  if (wanted === "resolved") return Boolean(job.isresolved) || title.includes("resolved");
  if (wanted === "completed") return Boolean(job.iscompleted) || title.includes("complet");
  if (wanted === "pending" || wanted === "open") {
    if (job.isresolved || job.iscompleted) return false;
    return !title || title.includes("pend") || title.includes("open") || title.includes("new");
  }
  if (wanted === "cancelled" || wanted === "canceled") return title.includes("cancel");
  return title.includes(wanted);
}

function filterJobs(snapshot, options = {}) {
  const jobs = tableRows(snapshot, "job");
  return jobs.filter((job) => {
    if (options.range && !inRange(job.date, options.range)) return false;
    if (options.assignedto != null && Number(job.assignedto) !== Number(options.assignedto)) return false;
    if (options.customerid != null && Number(job.customerid) !== Number(options.customerid)) return false;
    if (options.statusid != null && Number(job.statusid) !== Number(options.statusid)) return false;
    if (!jobMatchesStatus(snapshot, job, options.statusFilter)) return false;
    return true;
  });
}

function enrichJob(snapshot, job) {
  return {
    recno: job.recno,
    code: job.code || job.manualjobno || job.recno,
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

const LIST_PAGE_SIZE = 50;

function queryEntityJobs(snapshot, options = {}) {
  const jobs = filterJobs(snapshot, options).map((job) => enrichJob(snapshot, job));
  const offset = Math.max(0, Number(options.offset) || 0);
  const page = jobs.slice(offset, offset + LIST_PAGE_SIZE);
  return {
    report: "jobs",
    verified: true,
    source: "cache",
    sourceTable: "job",
    count: jobs.length,
    totalMatched: jobs.length,
    displayed: page.length,
    offset,
    rows: page,
    columns: columnsFrom(page, "job"),
    truncated: Boolean(snapshot?.tables?.job?.truncated) || jobs.length > offset + LIST_PAGE_SIZE
  };
}

function queryJobCount(snapshot, options = {}) {
  const jobs = filterJobs(snapshot, options);
  return {
    report: "job_count",
    verified: true,
    source: "cache",
    sourceTable: "job",
    count: jobs.length,
    totalMatched: jobs.length,
    rows: [{ metric: "Jobs", count: jobs.length }],
    columns: [
      { key: "metric", label: "Metric" },
      { key: "count", label: "Count" }
    ],
    truncated: Boolean(snapshot?.tables?.job?.truncated)
  };
}

function queryFromCache(snapshot, intent, subject) {
  if (!snapshot?.complete) return null;
  const options = {
    range: intent.range,
    statusFilter: intent.statusFilter,
    offset: intent.offset
  };
  if (subject?.type === "customer") options.customerid = subject.id;
  if (subject && ["technician", "manager", "admin", "user"].includes(subject.type)) {
    options.assignedto = subject.id;
  }
  if (intent.report === "technician_jobs") return queryTechnicianJobs(snapshot, options);
  if (intent.report === "status_jobs") return queryStatusJobs(snapshot, options);
  if (intent.report === "financial") return queryFinancial(snapshot, options);
  if (intent.report === "job_count") return queryJobCount(snapshot, options);
  if (intent.report === "entity_jobs" || intent.report === "jobs") {
    return queryEntityJobs(snapshot, options);
  }
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
