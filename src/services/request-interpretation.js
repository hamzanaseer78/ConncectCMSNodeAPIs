const { isReservedName, JOB_LINKS } = require("./entity-resolution");

const DIMENSIONS = Object.freeze({
  category: "category",
  categories: "category",
  status: "status",
  technician: "technician",
  technicians: "technician",
  customer: "customer",
  customers: "customer",
  month: "month",
  months: "month",
  brand: "brand",
  brands: "brand",
  fault: "fault",
  faults: "fault",
  subcategory: "fault",
  subcategories: "fault",
  group: "group",
  groups: "group",
  source: "source",
  area: "area",
  city: "city"
});

const SUPPORTED_JOB_GROUPS = new Set([
  "status", "technician", "customer", "category", "fault", "group", "brand", "source", "area", "city"
]);

const TYPE_WORD = Object.freeze({
  customer: "customer",
  technician: "technician",
  employee: "user",
  user: "user",
  brand: "brand",
  category: "category",
  service: "category",
  subcategory: "fault",
  fault: "fault",
  group: "group"
});

function acceptName(value) {
  const name = String(value || "").replace(/[?.!,]+$/g, "").replace(/['’]s$/i, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60 || isReservedName(name)) return null;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) return null;
  return name;
}

function detectChartType(text) {
  if (/\b(doughnut|donut)\b/.test(text)) return "donut";
  if (/\bpie\b/.test(text)) return "pie";
  if (/\b(?:bar|column)\s+charts?\b|\bbar\s+graphs?\b/.test(text)) return "bar";
  if (/\bline\s+(?:charts?|graphs?)\b/.test(text)) return "line";
  return null;
}

function isChartTypeOnly(text) {
  return /^(?:please\s+)?(?:make\s+it\s+(?:a\s+|an\s+)?)?(?:a\s+|the\s+)?(?:pie|donut|doughnut|bar|line)(?:\s+charts?)?[.?!]?$/.test(String(text || "").trim());
}

function detectGroupings(text) {
  const dims = [];
  const add = (word) => {
    const mapped = DIMENSIONS[String(word || "").toLowerCase()];
    if (mapped && !dims.includes(mapped)) dims.push(mapped);
  };
  const match = String(text || "").match(/\bby\s+([a-z]+)(?:\s+and\s+([a-z]+))?/);
  if (match) {
    add(match[1]);
    if (match[2]) add(match[2]);
  }
  if (/status[\s-]?wise/.test(text)) add("status");
  return dims;
}

function detectBusinessFilter(original) {
  const text = String(original || "");
  const inCategory = text.match(/\b(?:in|for)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 .'-]{1,40}?)\s+categor(?:y|ies)\b/i);
  if (inCategory) {
    const name = acceptName(inCategory[1]);
    if (name) return { name, hintedType: "category" };
  }
  const typed = text.match(/\b(customer|technician|employee|user|brand|category|service|subcategory|fault|group)\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s+jobs?\b|\s+for\b|\s+as\b|[.?!]|$)/i);
  if (typed) {
    const name = acceptName(typed[2]);
    if (name) return { name, hintedType: TYPE_WORD[typed[1].toLowerCase()] || null };
  }
  const possessive = text.match(/\b([A-Za-z][A-Za-z .'-]{1,40}?)['’]s\s+jobs?\b/);
  if (possessive) {
    const name = acceptName(possessive[1]);
    if (name) return { name, hintedType: null };
  }
  const show = text.match(/\b(?:show|list|get|give|find)\s+(?:me\s+)?(?:the\s+)?([A-Za-z][A-Za-z .'-]{1,40}?)(?:['’]s)?\s+jobs?\b/i);
  if (show) {
    const name = acceptName(show[1]);
    if (name) return { name, hintedType: null };
  }
  const jobsFor = text.match(/\bjobs?\s+(?:for|of)\s+([A-Za-z][A-Za-z .'-]{1,40})\b/i);
  if (jobsFor) {
    const name = acceptName(jobsFor[1]);
    if (name && !DIMENSIONS[name.toLowerCase()]) return { name, hintedType: null };
  }
  return null;
}

function detectBusinessEntity(text, chartTypeOnly) {
  if (chartTypeOnly) return null;
  if (/\b(attendance|checked in|check-?in|absent|on the way|on location|on break)\b/.test(text)) return "attendance";
  if (/\b(revenue|amount to collect)\b/.test(text)) return "revenue";
  if (/\bexpenses?\b/.test(text)) return "expenses";
  if (/\b(collected|collections?)\b/.test(text)) return "collections";
  if (/\bc-?pair\b/.test(text)) return "cpair";
  if (/\bjobs?\b|\bjob performance\b/.test(text)) return "jobs";
  return null;
}

function detectStructuredIntent(text, chartType, chartTypeOnly, groupings) {
  if (chartTypeOnly) return "chart";
  if (/\b(not (?:the |a )?summary|as a list|the list|job list|list of)\b/.test(text)) return "list";
  if (/\blist\b/.test(text) && /\b(job|jobs|status|report|them|those)\b/.test(text)) return "list";
  if (chartType || /\b(charts?|graphs?|visualize|plot)\b/.test(text)) return "chart";
  if (/\bcompare\b/.test(text)) return "comparison";
  if (/\breport\b/.test(text) || groupings.length) return "report";
  return null;
}

function detectExplicitRange(text) {
  if (/\bcompare\b/.test(text) && /\b(last year|previous year)\b/.test(text)) return null;
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

function outputFor(intent) {
  if (intent === "chart") return "chart";
  if (intent === "list") return "table";
  if (intent === "report" || intent === "comparison") return "report";
  if (intent === "summary") return "summary";
  return null;
}

function interpretRequest(message) {
  const original = String(message || "").trim();
  const text = original.toLowerCase();
  const chartTypeOnly = isChartTypeOnly(text);
  const chartType = detectChartType(text);
  const groupingDimensions = chartTypeOnly ? [] : detectGroupings(text);
  const businessFilterCandidate = chartTypeOnly ? null : detectBusinessFilter(original);
  const businessEntity = detectBusinessEntity(text, chartTypeOnly);
  const intent = detectStructuredIntent(text, chartType, chartTypeOnly, groupingDimensions);
  const unresolvedEntities = businessFilterCandidate ? [businessFilterCandidate.name] : [];
  return {
    businessEntity,
    intent,
    groupingDimensions,
    chartType,
    chartTypeOnly,
    businessFilterCandidate,
    businessFilters: businessFilterCandidate ? [businessFilterCandidate] : [],
    dateRange: chartTypeOnly ? null : detectExplicitRange(text),
    outputFormat: outputFor(intent),
    unresolvedEntities,
    searchCandidates: unresolvedEntities.slice()
  };
}

function chartToolArguments(state) {
  const group = state?.filters?.groupBy || null;
  const requestedChartType = state?.filters?.chartType || null;
  const chartIntent = state?.intent === "ENTITY_CHART";
  return {
    tool: chartIntent && group && SUPPORTED_JOB_GROUPS.has(group) ? "getReport" : null,
    report: group && SUPPORTED_JOB_GROUPS.has(group) ? `jobs_by_${group}` : null,
    chartType: requestedChartType,
    renderedChartType: requestedChartType || (chartIntent ? "bar" : null),
    status: state?.filters?.status || null,
    range: state?.filters?.range || null,
    subjectType: state?.filters?.subject?.type || null,
    subjectId: state?.filters?.subject?.id || null,
    relationship: state?.filters?.subject?.type ? (JOB_LINKS[state.filters.subject.type] || null) : null,
    searchCandidates: state?.filters?.requestedName ? [state.filters.requestedName] : []
  };
}

function validateChartPlan(state) {
  const args = chartToolArguments(state);
  if (args.searchCandidates.some((name) => isReservedName(name))) {
    return { ok: false, reason: "presentation_word_as_filter", arguments: args };
  }
  if (state?.filters?.requestedName && !state?.filters?.subject?.id) {
    return { ok: false, reason: "unresolved_name", arguments: args };
  }
  if (state?.intent === "ENTITY_CHART" && state?.filters?.groupBy && !SUPPORTED_JOB_GROUPS.has(state.filters.groupBy)) {
    return { ok: false, reason: "unsupported_grouping", arguments: args };
  }
  if (state?.filters?.chartType && !["pie", "donut", "bar", "line"].includes(state.filters.chartType)) {
    return { ok: false, reason: "unsupported_chart", arguments: args };
  }
  return { ok: true, reason: null, arguments: args };
}

module.exports = {
  interpretRequest,
  chartToolArguments,
  validateChartPlan,
  SUPPORTED_JOB_GROUPS
};
