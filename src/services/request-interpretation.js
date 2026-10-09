const { isReservedName, JOB_LINKS } = require("./entity-resolution");
const {
  SUPPORTED_JOB_GROUPS,
  MONEY_METRICS,
  findChartMention,
  isChartTypeOnly,
  isChartModifierOnly,
  getChart
} = require("./chart-registry");
const { planChart } = require("./chart-adapter");

const DIMENSIONS = Object.freeze({
  category: "category",
  categories: "category",
  status: "status",
  statuses: "status",
  technician: "technician",
  technicians: "technician",
  customer: "customer",
  customers: "customer",
  month: "month",
  months: "month",
  day: "day",
  days: "day",
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

const TOP_DIMENSIONS = Object.freeze({
  customers: "customer",
  technicians: "technician",
  categories: "category",
  brands: "brand",
  groups: "group",
  statuses: "status"
});

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
  return findChartMention(text)?.chart.id || null;
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
  const ranked = String(text || "").match(/\btop\s+\d{1,2}\s+(customers|technicians|categories|brands|groups|statuses)\b/);
  if (ranked) add(TOP_DIMENSIONS[ranked[1]]);
  if (/\btechnician performance\b/.test(text)) add("technician");
  return dims;
}

function detectMetricList(text) {
  const metrics = [];
  if (/\b(revenue|amount to collect)\b/.test(text)) metrics.push("amountToCollect");
  if (/\bexpenses?\b/.test(text)) metrics.push("expenses");
  if (/\b(collected cash|collections?|cash collected)\b/.test(text)) metrics.push("collected");
  if (/\b(job counts?|number of jobs|count of jobs)\b/.test(text)) metrics.push("jobs");
  return metrics;
}

function detectStatusSeries(text) {
  if (!/\b(versus|vs\.?|against)\b/.test(text)) return [];
  return ["completed", "pending", "cancelled", "assigned", "resolved", "new"].filter((status) => (
    new RegExp(`\\b${status}\\b`).test(text)
  ));
}

function detectGrain(text) {
  if (/\b(monthly|each month|by month)\b/.test(text)) return "month";
  if (/\b(by day|each day|daily)\b/.test(text)) return "day";
  if (/\bover time\b|\btrend\b/.test(text)) return "auto";
  return null;
}

function detectTopN(text) {
  const match = String(text || "").match(/\btop\s+(\d{1,2})\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 50 ? value : null;
}

function wantsPeriodComparison(text) {
  return /\bcompare\b/.test(text) && /\b(last year|previous year|previous period|last month|prior period|them|those|these)\b/.test(text);
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

function detectBusinessEntity(text, chartTypeOnly, metrics) {
  if (chartTypeOnly) return null;
  if (/\b(attendance|checked in|check-?in|absent|on the way|on location|on break)\b/.test(text)) return "attendance";
  if (/\btechnician performance\b/.test(text)) return "jobs";
  if (metrics.length >= 2) return "revenue";
  if (metrics.includes("amountToCollect")) return "revenue";
  if (metrics.includes("expenses")) return "expenses";
  if (metrics.includes("collected")) return "collections";
  if (/\bc-?pair\b/.test(text)) return "cpair";
  if (/\bjobs?\b|\bjob performance\b/.test(text)) return "jobs";
  return null;
}

function detectStructuredIntent(text, chartType, chartTypeOnly, groupings, statusSeries) {
  if (chartTypeOnly) return "chart";
  if (/\b(not (?:the |a )?summary|as a list|the list|job list|list of|as a table|list behind|behind this (?:graph|chart))\b/.test(text)) return "list";
  if (/\blist\b/.test(text) && /\b(job|jobs|status|report|them|those|graph|chart)\b/.test(text)) return "list";
  if (chartType || /\b(charts?|graphs?|visualize|plot)\b/.test(text)) return "chart";
  if (statusSeries.length >= 2) return "chart";
  if (wantsPeriodComparison(text)) return "comparison";
  if (/\breport\b|\bbreakdown\b|\bbreak (?:it |them )?down\b/.test(text)) return "report";
  if (groupings.length && /\b(show|give|plot|graph|chart)\b/.test(text)) return "chart";
  if (groupings.length) return "report";
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
  const modifierOnly = isChartModifierOnly(text);
  const mention = findChartMention(text);
  const chartType = mention?.chart.id || null;
  const groupingDimensions = chartTypeOnly || modifierOnly ? [] : detectGroupings(text);
  const businessFilterCandidate = chartTypeOnly || modifierOnly ? null : detectBusinessFilter(original);
  const metrics = chartTypeOnly || modifierOnly ? [] : detectMetricList(text);
  const statusSeries = chartTypeOnly || modifierOnly ? [] : detectStatusSeries(text);
  const businessEntity = detectBusinessEntity(text, chartTypeOnly || modifierOnly, metrics);
  const intent = detectStructuredIntent(text, chartType, chartTypeOnly, groupingDimensions, statusSeries);
  const unresolvedEntities = businessFilterCandidate ? [businessFilterCandidate.name] : [];
  const grain = chartTypeOnly || modifierOnly ? null : detectGrain(text);
  const categoryDimensions = groupingDimensions.filter((dimension) => dimension !== "day" && dimension !== "month");
  const metric = metrics[0] || (businessEntity === "jobs" || categoryDimensions.length ? "jobs" : null);
  const stacking = mention?.chart.stacked || /\bstacked\b/.test(text) ? true : (mention ? false : null);
  const horizontal = mention?.chart.horizontal || /\bhorizontal\b/.test(text) ? true : (mention ? false : null);
  return {
    businessEntity,
    intent,
    metric,
    aggregation: metric === "jobs" ? "count" : metric ? "sum" : null,
    groupingDimensions,
    xAxis: categoryDimensions[0] || (grain ? "date" : null),
    yAxis: metric,
    series: statusSeries.length ? statusSeries : metrics,
    chartType,
    chartTypeOnly,
    modifierOnly,
    stacking,
    horizontal,
    sorting: detectTopN(text) ? "desc" : null,
    topN: chartTypeOnly || modifierOnly ? null : detectTopN(text),
    comparisonPeriod: wantsPeriodComparison(text),
    businessFilterCandidate,
    businessFilters: businessFilterCandidate ? [businessFilterCandidate] : [],
    dateRange: chartTypeOnly || modifierOnly ? null : detectExplicitRange(text),
    grain,
    statusSeries,
    forecast: /\bforecast(?:ing)?\b/.test(text),
    formatting: metrics.some((item) => MONEY_METRICS.has(item)) ? "money" : "number",
    outputFormat: outputFor(intent),
    unresolvedEntities,
    searchCandidates: unresolvedEntities.slice()
  };
}

function chartToolArguments(state) {
  const plan = planChart(state);
  return {
    ...plan,
    relationship: state?.filters?.subject?.type ? (JOB_LINKS[state.filters.subject.type] || null) : null
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
  if (state?.filters?.chartType && !getChart(state.filters.chartType)) {
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
