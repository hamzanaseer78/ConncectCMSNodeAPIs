const { detectRange, detectEntityRef } = require("./management-intelligence.intent");

const ENTITIES = new Set(["jobs", "technicians", "attendance", "expenses", "revenue", "collections", "cpair"]);
const INTENTS = new Set([
  "GENERAL_QUESTION",
  "ENTITY_SUMMARY",
  "ENTITY_LIST",
  "ENTITY_DETAILS",
  "ENTITY_REPORT",
  "ENTITY_KPI",
  "ENTITY_CHART",
  "PERIOD_COMPARISON",
  "ENTITY_FILTER",
  "ENTITY_EXPORT",
  "CLARIFICATION"
]);
const STATUSES = new Set(["pending", "new", "assigned", "resolved", "completed", "cancelled"]);
const GROUPS = new Set(["status", "technician", "customer", "category", "fault", "group", "brand", "source", "area", "city"]);
const RANGES = new Set([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "previous_month",
  "this_quarter",
  "this_year",
  "year_to_date",
  "previous_year"
]);
const NAME_STOP = new Set([
  "those", "them", "their", "the", "jobs", "job", "pending", "summary", "list", "report",
  "me", "my", "a", "an", "attendance", "status", "revenue", "expenses", "performance",
  "id", "this", "that"
]);

const REPORT_CLARIFICATION = "Which report would you like to see: Jobs, Technician Performance, Attendance, Revenue, or Expenses?";

function emptyState() {
  return {
    entity: null,
    intent: null,
    filters: {
      status: null,
      range: null,
      rangeExplicit: false,
      technician: null,
      technicianId: null,
      groupBy: null
    },
    outputFormat: null,
    comparison: false,
    lastSuccessfulTool: null
  };
}

function allowed(value, set) {
  return set.has(value) ? value : null;
}

function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[?.!,]+$/g, "").replace(/['’]s$/i, "").trim().slice(0, 60);
  if (!name || NAME_STOP.has(name.toLowerCase())) return null;
  return name;
}

function sanitizeState(input) {
  const state = emptyState();
  if (!input || typeof input !== "object") return state;
  state.entity = allowed(input.entity, ENTITIES);
  state.intent = allowed(input.intent, INTENTS);
  const filters = input.filters && typeof input.filters === "object" ? input.filters : {};
  state.filters.status = allowed(filters.status, STATUSES);
  state.filters.range = allowed(filters.range, RANGES);
  state.filters.rangeExplicit = Boolean(filters.rangeExplicit);
  state.filters.technician = cleanName(filters.technician);
  state.filters.technicianId = Number.isInteger(Number(filters.technicianId)) && Number(filters.technicianId) > 0
    ? Number(filters.technicianId)
    : null;
  state.filters.groupBy = allowed(filters.groupBy, GROUPS);
  state.outputFormat = typeof input.outputFormat === "string" ? input.outputFormat : null;
  state.comparison = Boolean(input.comparison);
  state.lastSuccessfulTool = typeof input.lastSuccessfulTool === "string"
    ? input.lastSuccessfulTool.slice(0, 80)
    : null;
  return state;
}

function mentionedRange(message) {
  const text = String(message || "").toLowerCase();
  if (/\bcompare\b/.test(text) && /\b(last year|previous year)\b/.test(text)) return null;
  if (!/\b(yesterday|today|this week|last month|previous month|this month|this quarter|last year|previous year|this year)\b/.test(text)) {
    return null;
  }
  const range = detectRange(message);
  return RANGES.has(range) ? range : null;
}

function detectStatus(text) {
  if (/\bpending\b/.test(text)) return "pending";
  if (/\bcancell?ed\b/.test(text)) return "cancelled";
  if (/\bcompleted\b/.test(text)) return "completed";
  if (/\bresolved\b/.test(text)) return "resolved";
  if (/\bnew jobs\b|\bstatus new\b/.test(text)) return "new";
  if (/\bassigned\b/.test(text) && !/\bassigned to\b/.test(text)) return "assigned";
  return undefined;
}

function detectGroup(text) {
  if (/status[\s-]?wise|by status/.test(text)) return "status";
  if (/by categor/.test(text)) return "category";
  if (/by technician/.test(text)) return "technician";
  if (/by customer/.test(text)) return "customer";
  if (/by brand/.test(text)) return "brand";
  if (/by fault/.test(text)) return "fault";
  if (/by group/.test(text)) return "group";
  return undefined;
}

function detectEntity(text) {
  if (/\b(attendance|checked in|check-?in|absent|on the way|on location|on break)\b/.test(text)) return "attendance";
  if (/\b(revenue|amount to collect)\b/.test(text)) return "revenue";
  if (/\bexpenses?\b/.test(text)) return "expenses";
  if (/\b(collected|collections?)\b/.test(text)) return "collections";
  if (/\bc-?pair\b/.test(text)) return "cpair";
  if (/\bjobs?\b|\bjob performance\b/.test(text)) return "jobs";
  return null;
}

function detectIntent(text) {
  if (/\b(export|download|csv)\b/.test(text)) return "ENTITY_EXPORT";
  if (/\b(not (?:the |a )?summary|as a list|the list|job list|list of)\b/.test(text)) return "ENTITY_LIST";
  if (/\blist\b/.test(text) && /\b(job|jobs|status|report|them|those)\b/.test(text)) return "ENTITY_LIST";
  if (/\bdetails?\b/.test(text)) return "ENTITY_DETAILS";
  if (/\b(chart|graph)\b/.test(text)) return "ENTITY_CHART";
  if (/\bcompare\b/.test(text)) return "PERIOD_COMPARISON";
  if (/\breport\b|\bbreak(?:\s+\w+){0,2}\s+down\b|\bbreakdown\b/.test(text)) return "ENTITY_REPORT";
  if (/status[\s-]?wise|by status|by categor|by technician|by customer|by brand|by fault/.test(text)) return "ENTITY_REPORT";
  if (/\b(performance|kpi)\b/.test(text)) return "ENTITY_KPI";
  return null;
}

function referencesPrevious(text) {
  if (/\b(them|those|their|the same|same ones|instead|not the summary|not summary)\b/.test(text)) return true;
  if (/\b(as a list|the list|break them|compare them|compare with|compare it|compare these)\b/.test(text)) return true;
  if (/^(only|just)\b/.test(text.trim())) return true;
  return false;
}

function captureTechnician(message) {
  const text = String(message || "");
  const assigned = text.match(/\bassigned to\s+([A-Za-z][A-Za-z .'-]{1,40})/i);
  if (assigned) return cleanName(assigned[1]);
  const only = text.match(/\bonly\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?:['’]s)?(?:\s+jobs?)?\s*[.?!]?$/i);
  if (only) return cleanName(only[1]);
  const possessive = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)['’]s\b/);
  if (possessive) return cleanName(possessive[1]);
  const tech = text.match(/\btechnician\s+([A-Za-z][A-Za-z .'-]{1,40})/i);
  if (tech) return cleanName(tech[1]);
  return undefined;
}

function formatFor(intent) {
  if (intent === "ENTITY_LIST" || intent === "ENTITY_DETAILS") return "table";
  if (intent === "ENTITY_REPORT" || intent === "PERIOD_COMPARISON") return "report";
  if (intent === "ENTITY_CHART") return "chart";
  if (intent === "CLARIFICATION") return "clarification";
  return "summary";
}

function reportChoices() {
  return [
    { label: "Jobs", message: "Show me the jobs report" },
    { label: "Technician performance", message: "Show me job performance this year" },
    { label: "Attendance", message: "Show technician attendance" },
    { label: "Revenue", message: "Show me revenue this year" },
    { label: "Expenses", message: "Show me expenses this year" }
  ];
}

function followUps(state) {
  if (state.entity === "attendance") {
    return [
      { label: "Who is checked in", message: "Who is checked in" },
      { label: "Job performance this year", message: "Show me job performance this year" }
    ];
  }
  if (state.entity === "revenue" || state.entity === "expenses" || state.entity === "collections") {
    return [
      { label: "Compare with last year", message: "Compare them with last year" },
      { label: "Show the job list", message: "Show them as a list" }
    ];
  }
  if (state.intent === "ENTITY_LIST" || state.intent === "ENTITY_REPORT") {
    return [
      { label: "Show their revenue", message: "Show their revenue" },
      { label: "Compare with last year", message: "Compare them with last year" },
      { label: "Break down by status", message: "Break them down by status" }
    ];
  }
  return [
    { label: "Show the list", message: "Show them as a list" },
    { label: "Break down by status", message: "Break them down by status" },
    { label: "Show their revenue", message: "Show their revenue" }
  ];
}

function toClassified(state) {
  const statusReport = state.filters.status ? `${state.filters.status}_jobs` : null;
  const base = {
    intent: state.intent,
    statusFilter: state.filters.status,
    comparison: Boolean(state.comparison),
    groupBy: state.filters.groupBy,
    range: state.filters.range || "year_to_date",
    technician: state.filters.technician,
    focus: "jobs",
    statusReport,
    listByStatus: false,
    chart: null,
    report: null,
    entity: state.filters.technicianId
      ? { type: "technician", id: state.filters.technicianId, name: state.filters.technician }
      : null,
    outputFormat: state.outputFormat
  };

  if (state.entity === "attendance") {
    return { ...base, kind: "attendance", attendanceFocus: "attendance", focus: "attendance" };
  }
  if (state.entity === "cpair") {
    return { ...base, kind: "cpair", focus: "cpair" };
  }
  if (state.entity === "revenue" || state.entity === "expenses" || state.entity === "collections") {
    const focus = state.entity === "revenue" ? "amountToCollect" : state.entity === "expenses" ? "expenses" : "collected";
    if (state.intent === "ENTITY_CHART") {
      return { ...base, kind: "chart", focus, chart: { type: "line", metrics: [focus], metricsExplicit: true } };
    }
    if (state.intent === "ENTITY_LIST") {
      return { ...base, kind: "job_report", focus, statusReport: statusReport || "all_jobs" };
    }
    return { ...base, kind: "financial", focus };
  }
  if (state.intent === "ENTITY_LIST" || state.intent === "ENTITY_DETAILS" || (state.intent === "ENTITY_REPORT" && !state.filters.groupBy)) {
    return {
      ...base,
      kind: "job_report",
      statusReport: statusReport || "all_jobs",
      listByStatus: state.filters.groupBy === "status",
      focus: "jobs"
    };
  }
  if (state.intent === "ENTITY_REPORT" && state.filters.groupBy) {
    return { ...base, kind: "dimension_report", report: `jobs_by_${state.filters.groupBy}`, focus: "jobs" };
  }
  if (state.intent === "ENTITY_CHART") {
    const group = state.filters.groupBy || "status";
    return {
      ...base,
      kind: "group_chart",
      report: `jobs_by_${group}`,
      chart: { type: "bar", metrics: [], metricsExplicit: false },
      focus: "jobs"
    };
  }
  return { ...base, kind: "jobs", focus: "jobs" };
}

function clarify(answer, state) {
  return {
    handled: true,
    state,
    clarification: answer,
    suggestions: reportChoices(),
    classified: { kind: "clarify", intent: "CLARIFICATION", range: "year_to_date", chart: null }
  };
}

function resolveConversation(message, previous) {
  const prior = sanitizeState(previous);
  const text = String(message || "").toLowerCase();
  const ref = detectEntityRef(message);
  const entity = detectEntity(text);
  const intent = detectIntent(text);
  const status = detectStatus(text);
  const groupBy = detectGroup(text);
  const range = mentionedRange(message);
  const technician = ref ? undefined : captureTechnician(message);
  const compare = /\bcompare\b/.test(text);
  const clear = /\b(start (?:a )?new topic|start over|new topic|forget (?:that|this))\b/.test(text);
  const linked = referencesPrevious(text) || Boolean(ref) || Boolean(range && !entity && !intent);
  const meaningful = Boolean(entity || intent || status !== undefined || groupBy || range || technician || ref || compare || clear || linked);

  if (!meaningful) {
    return { handled: false, state: prior, clarification: null, suggestions: [], classified: null };
  }

  let state = clear ? emptyState() : sanitizeState(prior);
  const nextEntity = entity;
  const switching = Boolean(nextEntity && state.entity && nextEntity !== state.entity && !linked);
  if (switching) {
    state.filters.status = null;
    state.filters.technician = null;
    state.filters.technicianId = null;
    state.filters.groupBy = null;
    state.comparison = false;
  }

  if (nextEntity) state.entity = nextEntity;
  if (intent) state.intent = intent;
  if (status !== undefined) state.filters.status = status;
  if (technician) {
    state.filters.technician = technician;
    state.filters.technicianId = null;
  }
  if (ref && (ref.type === "technician" || ref.type === "user")) {
    state.filters.technicianId = Number(ref.id);
  }
  if (range) {
    state.filters.range = range;
    state.filters.rangeExplicit = true;
  }
  if (!state.filters.range) state.filters.range = "year_to_date";
  if (groupBy) state.filters.groupBy = groupBy;
  if (compare) {
    state.comparison = true;
    state.intent = "PERIOD_COMPARISON";
  } else if (!intent && nextEntity) {
    state.intent = "ENTITY_SUMMARY";
  }
  if (!state.intent && state.entity) state.intent = "ENTITY_SUMMARY";

  if (intent === "ENTITY_EXPORT") {
    const kept = prior.intent && prior.intent !== "ENTITY_EXPORT" ? prior.intent : (state.entity ? "ENTITY_SUMMARY" : null);
    state.intent = kept;
    state.outputFormat = formatFor(kept);
    return {
      handled: true,
      state,
      clarification: "I can show that report in the chat. Downloading a CSV from the chat is not available yet.",
      suggestions: state.entity ? followUps(state) : reportChoices(),
      classified: { kind: "clarify", intent: "ENTITY_EXPORT", range: state.filters.range || "year_to_date", chart: null }
    };
  }
  if (clear && !nextEntity && !intent) {
    return clarify("What would you like to look at next?", state);
  }
  if (!state.entity) {
    if ((intent === "ENTITY_REPORT" || state.intent === "ENTITY_REPORT") && !state.filters.groupBy) {
      return clarify(REPORT_CLARIFICATION, emptyState());
    }
    return { handled: false, state: prior, clarification: null, suggestions: [], classified: null };
  }

  state.outputFormat = formatFor(state.intent);
  return {
    handled: true,
    state,
    clarification: null,
    suggestions: followUps(state),
    classified: toClassified(state)
  };
}

function responseTypeFor(payload, classified) {
  if (payload?.responseType) return payload.responseType;
  const kind = payload?.kind || classified?.kind;
  if (kind === "clarify" || kind === "confirm" || kind === "explain") return "clarification";
  if (kind === "job_report") return "table";
  if (kind === "dimension_report") return "report";
  if (kind === "group_chart" || kind === "chart") return "chart";
  if (classified?.comparison) return "report";
  return "summary";
}

function publicFilters(state) {
  const filters = state?.filters || {};
  return {
    status: filters.status || null,
    range: filters.range || null,
    technician: filters.technician || null,
    technicianId: filters.technicianId || null,
    groupBy: filters.groupBy || null,
    comparison: Boolean(state?.comparison)
  };
}

function toolName(classified) {
  if (!classified) return null;
  if (classified.kind === "job_report") return "statusJobsReport";
  if (classified.kind === "dimension_report" || classified.kind === "group_chart") return "getReport";
  if (classified.kind === "chart") return "buildMoneyChart";
  if (classified.kind === "attendance") return "answerAttendance";
  if (classified.kind === "financial" || classified.kind === "jobs" || classified.kind === "cpair") return "getOverview";
  return null;
}

module.exports = {
  emptyState,
  sanitizeState,
  resolveConversation,
  responseTypeFor,
  publicFilters,
  toolName,
  REPORT_CLARIFICATION
};
