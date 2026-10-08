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

function classifyQuestion(message) {
  const text = String(message || "").toLowerCase();
  const range = detectRange(text);
  const report = /\bby\b|which technician|per technician|c-?pair/.test(text) ? detectReport(text) : null;
  const financial = /revenue|expense|collect|outstanding|amount to collect|receivable|financial|margin/.test(text);
  const chart = /chart|graph|trend|analytics/.test(text);
  const cpair = /c-?pair/.test(text);
  const attendance = /attendance|checked in|on break|on the way|on location|available right now|technician status/.test(text);
  const jobs = /how many|pending|completed|cancelled|assigned|jobs?\b/.test(text);

  let kind = "clarify";
  if (cpair) kind = "cpair";
  else if (attendance && !financial) kind = "attendance";
  else if (financial || chart) kind = "financial";
  else if (jobs || report) kind = "jobs";

  return {
    kind,
    range,
    report: report && REPORTS.some((item) => item.key === report) ? report : null
  };
}

module.exports = {
  classifyQuestion,
  detectRange,
  detectReport
};
