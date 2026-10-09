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

function explicitRange(message) {
  const text = String(message || "").toLowerCase();
  if (/\byesterday\b/.test(text)) return "yesterday";
  if (/\btoday\b/.test(text)) return "today";
  if (/this week/.test(text)) return "this_week";
  if (/last month|previous month/.test(text)) return "previous_month";
  if (/this month/.test(text)) return "this_month";
  if (/this quarter/.test(text)) return "this_quarter";
  if (/last year|previous year/.test(text)) return "previous_year";
  if (/this year/.test(text)) return "this_year";
  return null;
}

function detectRange(message) {
  return explicitRange(message) || "this_month";
}

function detectFocus(message) {
  const text = String(message || "").toLowerCase();
  if (/c-?pair/.test(text)) return "cpair";
  if (/attendance|checked in|on break|on the way|on location/.test(text)) return "attendance";
  const financial = [];
  if (/expense/.test(text)) financial.push("expenses");
  if (/amount to collect|\brevenue\b/.test(text)) financial.push("amountToCollect");
  if (/outstanding|receivable|\bbalance\b/.test(text)) financial.push("outstanding");
  if (/collect/.test(text) && !/amount to collect/.test(text)) financial.push("collected");
  if (financial.length === 1) return financial[0];
  if (financial.length > 1) return "financial";
  if (/pending|completed|cancelled|assigned|\bjobs?\b|\bnew\b/.test(text)) return "jobs";
  return null;
}

function bareStatus(message) {
  const text = String(message || "").toLowerCase();
  if (/report|jobs?\b|list/.test(text)) return null;
  if (/completed/.test(text)) return "completed_jobs";
  if (/cancelled/.test(text)) return "cancelled_jobs";
  if (/pending/.test(text)) return "pending_jobs";
  if (/\bnew\b/.test(text)) return "new_jobs";
  if (/assigned/.test(text)) return "assigned_jobs";
  return null;
}

function metricsFor(classified) {
  if (classified?.chart?.metricsExplicit && classified.chart.metrics?.length) return classified.chart.metrics;
  if (classified?.focus === "expenses") return ["expenses"];
  if (classified?.focus === "collected") return ["collected"];
  if (classified?.focus === "amountToCollect") return ["amountToCollect"];
  if (classified?.focus === "outstanding") return ["amountToCollect", "collected"];
  if (classified?.kind === "financial" || classified?.focus === "financial") return ["collected", "expenses"];
  return null;
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
    metrics: metrics.length ? metrics : ["collected", "expenses"],
    metricsExplicit: metrics.length > 0
  };
}

function detectProfile(message) {
  const text = String(message || "").toLowerCase();
  if (/\bmy name\b|\bwho am i\b|\bwhat am i called\b/.test(text)) return "name";
  if (/\bmy email\b/.test(text)) return "email";
  return null;
}

function detectBranchQuestion(message) {
  const text = String(message || "").toLowerCase();
  return /\bbranches?\b/.test(text) && /how many|count|do i have|i have|list|which|show/.test(text);
}

function isContinuation(message, current) {
  const text = String(message || "").toLowerCase().trim();
  if (current.kind === "profile" || current.kind === "branches") return false;
  if (/\b(what|how) about\b|\bsame\b|\binstead\b/.test(text)) return true;
  if (/^(and|also|now|that|those)\b/.test(text)) return true;
  if (/chart|graph/.test(text) && !detectFocus(message)) return true;
  const words = text.replace(/[.?!,]/g, "").split(/\s+/).filter(Boolean);
  if (current.kind === "clarify" && explicitRange(message) && words.length <= 4) return true;
  if (bareStatus(text) && words.length <= 3) return true;
  if (/\b(by|per) technician\b|\bwhich technicians?\b/.test(text)) return true;
  return false;
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
  const profileField = detectProfile(message);
  const branchQuestion = detectBranchQuestion(message);
  const aboutJobs = /pending|completed|cancelled|assigned|\bjobs?\b/.test(text);
  const jobs = aboutJobs || (/how many/.test(text) && !branchQuestion && !profileField);

  let kind = "clarify";
  if (profileField) kind = "profile";
  else if (branchQuestion) kind = "branches";
  else if (chart) kind = "chart";
  else if (statusReport) kind = "job_report";
  else if (cpair) kind = "cpair";
  else if (attendance && !financial) kind = "attendance";
  else if (financial) kind = "financial";
  else if (jobs || report) kind = "jobs";

  return {
    kind,
    range,
    rangeExplicit: Boolean(explicitRange(message)),
    technician,
    focus: detectFocus(message),
    profileField,
    chart: kind === "profile" || kind === "branches" ? null : chart,
    statusReport,
    report: report && REPORTS.some((item) => item.key === report) ? report : null
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || item.text || "").trim()
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function latestUserClassification(history) {
  const turns = normalizeHistory(history);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role !== "user") continue;
    const classified = classifyQuestion(turns[index].content);
    if (classified.kind !== "clarify" && classified.kind !== "profile" && classified.kind !== "branches") {
      return classified;
    }
  }
  return null;
}

function resolveQuestion(message, history) {
  const current = classifyQuestion(message);
  const prior = latestUserClassification(history);
  if (!prior || !isContinuation(message, current)) return current;

  const text = String(message || "").toLowerCase();
  const range = explicitRange(message);
  const technician = detectTechnician(message);
  const clearTechnician = /\b(all|every|each) technicians?\b|\bwhole branch\b|\beveryone\b/.test(text);
  const wantsChart = /chart|graph/.test(text);
  const focus = detectFocus(message);
  const statusWord = current.statusReport || bareStatus(text);
  const technicianName = clearTechnician ? null : technician || prior.technician;

  const inherited = {
    ...prior,
    range: range || prior.range,
    rangeExplicit: Boolean(range) || prior.rangeExplicit,
    technician: technicianName,
    focus: focus || prior.focus
  };

  if (/\bby technician\b|\bper technician\b|\bwhich technicians?\b/.test(text)) {
    const topic = focus || prior.focus;
    if (topic === "expenses") {
      inherited.report = "expenses_by_technician";
      inherited.kind = "financial";
      inherited.focus = "expenses";
    } else if (topic === "collected") {
      inherited.report = "collections_by_collector";
      inherited.kind = "financial";
      inherited.focus = "collected";
    } else if (topic === "cpair" || prior.kind === "cpair") {
      inherited.report = "cpair_by_technician";
      inherited.kind = "cpair";
      inherited.focus = "cpair";
    } else if (topic === "jobs" || prior.kind === "jobs" || prior.kind === "job_report") {
      inherited.report = "jobs_by_technician";
      inherited.kind = "jobs";
      inherited.focus = "jobs";
    }
  }

  if (focus && focus !== prior.focus && current.kind !== "clarify") {
    const next = {
      ...current,
      range: range || prior.range,
      rangeExplicit: Boolean(range),
      technician: technicianName,
      focus
    };
    if (wantsChart) {
      const metrics = current.chart?.metricsExplicit ? current.chart.metrics : metricsFor(next);
      if (metrics) {
        next.kind = "chart";
        next.chart = { type: "line", metrics, metricsExplicit: true };
      }
    }
    if (!wantsChart && statusWord && (focus === "jobs" || prior.kind === "job_report")) {
      next.kind = "job_report";
      next.statusReport = statusWord;
    }
    return next;
  }

  if (current.kind === "clarify" || !focus) {
    if (wantsChart) {
      const metrics = current.chart?.metricsExplicit ? current.chart.metrics : metricsFor(prior);
      if (metrics) {
        inherited.kind = "chart";
        inherited.chart = { type: "line", metrics, metricsExplicit: true };
        inherited.statusReport = null;
      } else if (prior.kind === "job_report" || prior.kind === "jobs" || prior.focus === "jobs") {
        inherited.kind = "jobs";
        inherited.focus = "jobs";
        inherited.statusReport = null;
        inherited.chart = null;
      }
    }
    if (!wantsChart && statusWord && (prior.kind === "job_report" || prior.kind === "jobs" || prior.focus === "jobs")) {
      inherited.kind = "job_report";
      inherited.statusReport = statusWord;
      inherited.focus = "jobs";
      inherited.chart = null;
    }
    return inherited;
  }

  return {
    ...current,
    range: range || prior.range,
    technician: technicianName
  };
}

module.exports = {
  classifyQuestion,
  resolveQuestion,
  detectRange,
  detectReport,
  detectTechnician,
  detectChart
};
