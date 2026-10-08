const { REPORTS } = require("./management-intelligence.catalog");

const REPORT_PATTERNS = [
  [/c-?pair/, "cpair_by_technician"],
  [/expense/, "expenses_by_technician"],
  [/collect/, "collections_by_collector"],
  [/outstanding|balance|receivable/, "job_balances"],
  [/erp product|by product/, "jobs_by_product"],
  [/by categor/, "jobs_by_category"],
  [/fault/, "jobs_by_fault"],
  [/by group/, "jobs_by_group"],
  [/brand/, "jobs_by_brand"],
  [/source/, "jobs_by_source"],
  [/by area|areas/, "jobs_by_area"],
  [/by city|cities/, "jobs_by_city"],
  [/customer/, "jobs_by_customer"],
  [/technician/, "jobs_by_technician"],
  [/status/, "jobs_by_status"]
];

function detectRange(message) {
  const text = String(message || "").toLowerCase();
  if (/\byesterday\b/.test(text)) return "yesterday";
  if (/\btoday\b/.test(text)) return "today";
  if (/this week/.test(text)) return "this_week";
  if (/last month|previous month/.test(text)) return "previous_month";
  if (/this month/.test(text)) return "this_month";
  if (/this quarter/.test(text)) return "this_quarter";
  if (/last year|previous year/.test(text)) return "previous_year";
  if (/this year/.test(text)) return "this_year";
  return "this_month";
}

function detectReport(message) {
  const text = String(message || "").toLowerCase();
  const match = REPORT_PATTERNS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : null;
}

function detectTechnician(message) {
  const match = String(message || "").match(/\btechnician\s+([A-Za-z][A-Za-z .'-]{0,60})/i);
  if (!match) return null;
  const name = match[1]
    .replace(/\b(report|reports|chart|graph|line|for|vs|versus|today|yesterday)\b/gi, "")
    .replace(/[.?!,]+$/g, "")
    .trim();
  return name || null;
}

function detectStatusReport(message) {
  const text = String(message || "").toLowerCase();
  if (!/report|jobs?\b|list/.test(text)) return null;
  if (/completed/.test(text)) return "completed_jobs";
  if (/cancelled/.test(text)) return "cancelled_jobs";
  if (/pending/.test(text)) return "pending_jobs";
  if (/\bnew\b/.test(text)) return "new_jobs";
  if (/assigned/.test(text)) return "assigned_jobs";
  return null;
}

function detectChart(message) {
  const text = String(message || "").toLowerCase();
  if (!/chart|graph/.test(text)) return null;
  const metrics = [];
  if (/collect/.test(text)) metrics.push("collected");
  if (/expense/.test(text)) metrics.push("expenses");
  if (/revenue|amount to collect/.test(text)) metrics.push("amountToCollect");
  return {
    type: "line",
    metrics: metrics.length ? metrics : ["collected", "expenses"]
  };
}

function classifyQuestion(message) {
  const text = String(message || "").toLowerCase();
  const range = detectRange(text);
  const technician = detectTechnician(message);
  const chart = detectChart(text);
  const statusReport = detectStatusReport(text);
  const report = /\bby\b|which technician|per technician|c-?pair/.test(text) ? detectReport(text) : null;
  const financial = /revenue|expense|collect|outstanding|amount to collect|receivable|financial|margin/.test(text);
  const cpair = /c-?pair/.test(text);
  const attendance = /attendance|checked in|on break|on the way|on location|available right now|technician status/.test(text);
  const jobs = /how many|pending|completed|cancelled|assigned|jobs?\b/.test(text);

  let kind = "clarify";
  if (chart) kind = "chart";
  else if (statusReport) kind = "job_report";
  else if (cpair) kind = "cpair";
  else if (attendance && !financial) kind = "attendance";
  else if (financial) kind = "financial";
  else if (jobs || report) kind = "jobs";

  return {
    kind,
    range,
    technician,
    chart,
    statusReport,
    report: report && REPORTS.some((item) => item.key === report) ? report : null
  };
}

module.exports = {
  classifyQuestion,
  detectRange,
  detectReport,
  detectTechnician,
  detectChart
};
