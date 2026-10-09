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
  return explicitRange(message) || "year_to_date";
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

function detectEntityRef(message) {
  const match = String(message || "").match(/\b(technician|user|category|service|brand|fault)\s+id\s+(\d+)\b/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return {
    word,
    type: word === "service" ? "category" : word,
    id: Number(match[2])
  };
}

function cleanEntityName(raw) {
  return String(raw || "")
    .replace(/\b(report|reports|chart|graph|line|for|vs|versus|today|yesterday|details|detail|info|list|show|me|jobs|job|performance|collections|collection|expenses|expense|this|last|previous|year|month|week|quarter)\b/gi, "")
    .replace(/[.?!,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectEntityName(message) {
  if (detectEntityRef(message)) return null;
  const match = String(message || "").match(/\b(technician|user|category|service|brand|fault)\s+([A-Za-z][A-Za-z0-9 .'-]{0,50})/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const name = cleanEntityName(match[2]);
  if (!name) return null;
  return {
    word,
    type: word === "service" ? "category" : word,
    name
  };
}

function pinEntity(message, word, id) {
  const pattern = new RegExp(`\\b${word}\\s+(?!id\\s+\\d+)`, "i");
  if (pattern.test(message)) return message.replace(pattern, `${word} id ${id} `);
  return `${message} ${word} id ${id}`;
}

const SUGGESTION_BANK = [
  { label: "Job performance this year", message: "Show me job performance this year", keys: ["job", "performance", "work", "complaint"] },
  { label: "Completed jobs this year", message: "Show me completed jobs report this year", keys: ["complete", "done", "closed"] },
  { label: "Collections this year", message: "Show me collections this year", keys: ["collect", "cash", "money", "payment", "paid"] },
  { label: "Expenses this year", message: "Show me expenses this year", keys: ["expense", "cost", "spend"] },
  { label: "Outstanding C-Pair", message: "Show outstanding C-Pair", keys: ["pair", "part", "spare", "stock"] },
  { label: "Who is checked in", message: "Who is checked in", keys: ["attend", "present", "absent", "staff", "check"] },
  { label: "Technicians", message: "Show technicians", keys: ["tech", "employee", "staff"] },
  { label: "How many customers", message: "How many customers do I have?", keys: ["customer", "client"] },
  { label: "Brands", message: "Show brands", keys: ["brand", "product", "item"] },
  { label: "My name", message: "What is my name?", keys: ["name", "who am", "profile", "account"] }
];

function buildSuggestions(message) {
  const text = String(message || "").toLowerCase();
  const scored = SUGGESTION_BANK.map((item) => ({
    item,
    score: item.keys.reduce((total, key) => total + (text.includes(key) ? 1 : 0), 0)
  }));
  const matched = scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  const chosen = (matched.length ? matched : scored).slice(0, 4);
  return chosen.map((entry) => ({ label: entry.item.label, message: entry.item.message }));
}

function detectTechnician(message) {
  if (detectEntityRef(message)?.type === "technician") return null;
  const match = String(message || "").match(/\btechnician\s+([A-Za-z][A-Za-z .'-]{0,60})/i);
  if (!match) return null;
  const name = match[1]
    .replace(/\b(report|reports|chart|graph|line|for|vs|versus|today|yesterday|details|detail|info|list|show|me)\b/gi, "")
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
  if (/collect/.test(text) && !/amount to collect/.test(text)) metrics.push("collected");
  if (/expense/.test(text)) metrics.push("expenses");
  if (/revenue|amount to collect/.test(text)) metrics.push("amountToCollect");
  return {
    type: "line",
    metrics,
    metricsExplicit: metrics.length > 0
  };
}

function dimensionReportKey(message) {
  const text = String(message || "").toLowerCase();
  if (!/\bby\b|group/.test(text)) return null;
  const report = detectReport(text);
  return report && report.startsWith("jobs_by_") ? report : null;
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

const MODULE_QUESTIONS = [
  [/customer/, "customers", "Customers"],
  [/erp product/, "erpproducts", "ERP products"],
  [/\bproducts?\b|\bitems?\b/, "products", "Products"],
  [/\bbrands?\b/, "brands", "Brands"],
  [/\bcities\b|\bcity\b/, "cities", "Cities"],
  [/\bcountries\b|\bcountry\b/, "countries", "Countries"],
  [/\bareas?\b/, "areas", "Areas"],
  [/job status/, "jobstauses", "Job statuses"],
  [/job categor/, "jobcategories", "Job categories"],
  [/job group/, "jobgroups", "Job groups"],
  [/subcategor/, "jobsubcategories", "Job subcategories"],
  [/\bpolicies\b|\bpolicy\b/, "policies", "Policies"],
  [/\bunits?\b/, "units", "Units"],
  [/expense type/, "expensetypes", "Expense types"],
  [/delivery type/, "deliverytypes", "Delivery types"],
  [/job type/, "jobtypes", "Job types"],
  [/job source/, "jobsources", "Job sources"],
  [/\busers?\b/, "users", "Users"]
];

function detectGreeting(message) {
  const text = String(message || "").toLowerCase().replace(/[.?!,]/g, "").trim();
  return /^(hi|hello|hey|thanks|thank you|good morning|good afternoon)$/.test(text);
}

function detectAttendanceFocus(message) {
  const text = String(message || "").toLowerCase();
  if (!/absent|leave|\blate\b|checked in|on break|on the way|on location|attendance|available right now/.test(text)) {
    return null;
  }
  if (/absent|leave/.test(text)) return "absent";
  if (/\blate\b/.test(text)) return "late";
  if (/on the way/.test(text)) return "on_the_way";
  if (/on location/.test(text)) return "on_location";
  if (/on break/.test(text)) return "on_break";
  if (/checked in/.test(text)) return "checked_in";
  return "attendance";
}

function detectTechnicianQuestion(message) {
  const text = String(message || "").toLowerCase();
  if (!/technician/.test(text)) return false;
  if (/expense|collect|c-?pair|chart|graph|report|revenue|outstanding|attendance|absent/.test(text)) return false;
  return true;
}

function detectModule(message) {
  const text = String(message || "").toLowerCase();
  if (/chart|graph|report|expense|collect|revenue|outstanding|c-?pair/.test(text)) return null;
  const match = MODULE_QUESTIONS.find(([pattern]) => pattern.test(text));
  if (!match) return null;
  return { resource: match[1], label: match[2] };
}

function wantsJobList(message) {
  const text = String(message || "").toLowerCase();
  if (/not summary|no summary|instead of summary/.test(text)) return true;
  if (/\blist\b/.test(text) && /job|status|report/.test(text)) return true;
  if (/\breport\b/.test(text) && /\bjobs?\b|\bstatus\b/.test(text)) return true;
  if (/status[\s-]?wise|by status/.test(text) && /job|list|report/.test(text)) return true;
  return false;
}

function wantsStatusWise(message) {
  return /status[\s-]?wise|by status/.test(String(message || "").toLowerCase());
}

function refersToPrevious(message) {
  const text = String(message || "").toLowerCase();
  return /what is this|what'?s this|explain (this|that)|what does (this|that) mean/.test(text);
}

function isRangeOnly(message) {
  if (!explicitRange(message)) return false;
  const stripped = String(message || "")
    .toLowerCase()
    .replace(/[.?!,]/g, " ")
    .replace(/\b(yesterday|today|this week|last month|previous month|this month|this quarter|last year|previous year|this year|show|me|the|for|in|on|a|an|please)\b/g, " ")
    .trim();
  return stripped.length === 0;
}

function isContinuation(message, current) {
  const text = String(message || "").toLowerCase().trim();
  if (["profile", "branches", "attendance", "technicians", "module", "greeting"].includes(current.kind)) {
    return false;
  }
  if (/\b(what|how) about\b|\bsame\b|\binstead\b/.test(text)) return true;
  if (/^(and|also|now|that|those)\b/.test(text)) return true;
  if (/chart|graph/.test(text) && !detectFocus(message)) return true;
  if (/\breport\b|\blist\b|not summary|status[\s-]?wise/.test(text)) return true;
  if (refersToPrevious(message)) return true;
  if (current.kind === "clarify" && isRangeOnly(message)) return true;
  if (bareStatus(text) && text.replace(/[.?!,]/g, "").split(/\s+/).filter(Boolean).length <= 3) return true;
  if (/\b(by|per) technician\b|\bwhich technicians?\b/.test(text)) return true;
  return false;
}

function classifyQuestion(message) {
  const text = String(message || "").toLowerCase();
  const range = detectRange(text);
  const technician = detectTechnician(message);
  const chart = detectChart(text);
  const groupedReport = dimensionReportKey(message);
  const statusReport = detectStatusReport(text);
  const report = /\bby\b|which technician|per technician|c-?pair/.test(text) ? detectReport(text) : null;
  const financial = /revenue|expense|collect|outstanding|amount to collect|receivable|financial|margin/.test(text);
  const cpair = /c-?pair/.test(text);
  const attendanceFocus = detectAttendanceFocus(message);
  const profileField = detectProfile(message);
  const branchQuestion = detectBranchQuestion(message);
  const greeting = detectGreeting(message);
  const technicianQuestion = detectTechnicianQuestion(message);
  const moduleQuestion = detectModule(message);
  const aboutJobs = /pending|completed|cancelled|assigned|\bjobs?\b|job performance/.test(text);
  const jobs = aboutJobs || (/how many/.test(text) && !branchQuestion && !profileField && !moduleQuestion);

  let kind = "clarify";
  if (profileField) kind = "profile";
  else if (branchQuestion) kind = "branches";
  else if (greeting) kind = "greeting";
  else if (attendanceFocus && !financial && !cpair) kind = "attendance";
  else if (technicianQuestion && !statusReport) kind = "technicians";
  else if (moduleQuestion && !statusReport && !aboutJobs) kind = "module";
  else if (groupedReport && chart) kind = "group_chart";
  else if (chart && aboutJobs && !financial) kind = "jobs";
  else if (chart && chart.metricsExplicit) kind = "chart";
  else if (statusReport) kind = "job_report";
  else if (wantsJobList(message)) kind = "job_report";
  else if (cpair) kind = "cpair";
  else if (financial) kind = "financial";
  else if (jobs || report) kind = "jobs";

  const plainAnswer = kind === "profile" || kind === "branches" || kind === "greeting" || kind === "attendance" || kind === "technicians" || kind === "module";

  return {
    kind,
    range,
    rangeExplicit: Boolean(explicitRange(message)),
    technician,
    focus: detectFocus(message),
    profileField,
    attendanceFocus,
    module: moduleQuestion,
    chart: kind === "group_chart"
      ? { type: "bar", metrics: [], metricsExplicit: false }
      : plainAnswer ? null : chart,
    statusReport: statusReport || (kind === "job_report" && wantsJobList(message) ? "all_jobs" : statusReport),
    listByStatus: kind === "job_report" && wantsStatusWise(message),
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
    if (!["clarify", "profile", "branches", "greeting", "attendance", "technicians", "module"].includes(classified.kind)) {
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
      const grouped = dimensionReportKey(message) || (String(prior.report || "").startsWith("jobs_by_") ? prior.report : null);
      const metrics = current.chart?.metricsExplicit ? current.chart.metrics : metricsFor(next);
      if (grouped) {
        next.kind = "group_chart";
        next.report = grouped;
        next.chart = { type: "bar", metrics: [], metricsExplicit: false };
      } else if (metrics) {
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
    if (refersToPrevious(message)) {
      return { ...inherited, kind: "explain", chart: null, statusReport: null };
    }
    if (!wantsChart && /\breport\b|\blist\b|not summary|status[\s-]?wise/.test(text)) {
      if (prior.kind === "financial" || ["expenses", "collected", "amountToCollect", "outstanding", "financial"].includes(prior.focus)) {
        return {
          ...inherited,
          kind: "financial",
          chart: null,
          report: prior.report || (prior.focus === "expenses" ? "expenses_by_technician" : prior.focus === "collected" ? "collections_by_collector" : "job_balances")
        };
      }
      return {
        ...inherited,
        kind: "job_report",
        statusReport: current.statusReport || "all_jobs",
        listByStatus: wantsStatusWise(message),
        focus: "jobs",
        chart: null
      };
    }
    if (wantsChart) {
      const grouped = dimensionReportKey(message) || (String(prior.report || "").startsWith("jobs_by_") ? prior.report : null);
      const metrics = current.chart?.metricsExplicit ? current.chart.metrics : metricsFor(prior);
      if (grouped) {
        inherited.kind = "group_chart";
        inherited.report = grouped;
        inherited.chart = { type: "bar", metrics: [], metricsExplicit: false };
        inherited.statusReport = null;
      } else if (metrics) {
        inherited.kind = "chart";
        inherited.chart = { type: "line", metrics, metricsExplicit: true };
        inherited.statusReport = null;
      } else if (prior.kind === "job_report" || prior.kind === "jobs" || prior.focus === "jobs" || prior.kind === "group_chart") {
        inherited.kind = "group_chart";
        inherited.report = prior.report && String(prior.report).startsWith("jobs_by_") ? prior.report : "jobs_by_status";
        inherited.focus = "jobs";
        inherited.statusReport = null;
        inherited.chart = { type: "bar", metrics: [], metricsExplicit: false };
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
  detectChart,
  detectEntityRef,
  detectEntityName,
  pinEntity,
  buildSuggestions
};
