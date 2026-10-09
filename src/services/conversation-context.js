const { detectRange, detectEntityRef } = require("./management-intelligence.intent");
const {
  JOB_LINKS,
  explicitRecord,
  choiceTypeFromMessage
} = require("./entity-resolution");
const { interpretRequest } = require("./request-interpretation");

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
      groupBy: null,
      requestedName: null,
      hintedType: null,
      preferredType: null,
      subject: null,
      pendingCandidates: null,
      chartType: null
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

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sanitizeSubject(subject) {
  if (!subject || typeof subject !== "object") return null;
  const type = JOB_LINKS[subject.type] ? subject.type : null;
  const id = positiveId(subject.id);
  const name = cleanName(subject.name) || (typeof subject.name === "string" ? subject.name.trim().slice(0, 60) : null);
  if (!type || !id || !name) return null;
  return { type, id, name };
}

function sanitizeCandidates(list) {
  if (!Array.isArray(list)) return null;
  const candidates = list.slice(0, 8).map((item) => {
    const entityType = JOB_LINKS[item?.entityType] ? item.entityType : null;
    const entityId = positiveId(item?.entityId);
    const displayName = typeof item?.displayName === "string" ? item.displayName.trim().slice(0, 80) : "";
    if (!entityType || !entityId || !displayName) return null;
    return {
      entityType,
      entityId,
      displayName,
      detail: typeof item.detail === "string" ? item.detail.slice(0, 120) : null,
      match: item.match === "partial" ? "partial" : "exact"
    };
  }).filter(Boolean);
  return candidates.length ? candidates : null;
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
  state.filters.technicianId = positiveId(filters.technicianId);
  state.filters.groupBy = allowed(filters.groupBy, GROUPS);
  state.filters.requestedName = cleanName(filters.requestedName);
  state.filters.hintedType = JOB_LINKS[filters.hintedType] ? filters.hintedType : null;
  state.filters.preferredType = JOB_LINKS[filters.preferredType] ? filters.preferredType : null;
  state.filters.subject = sanitizeSubject(filters.subject);
  state.filters.pendingCandidates = sanitizeCandidates(filters.pendingCandidates);
  state.filters.chartType = ["pie", "donut", "bar", "line"].includes(filters.chartType) ? filters.chartType : null;
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
    technician: state.filters.subject?.type === "technician" || state.filters.subject?.type === "user"
      ? state.filters.subject.name
      : state.filters.technician,
    focus: "jobs",
    statusReport,
    listByStatus: false,
    chart: null,
    report: null,
    entity: state.filters.subject
      ? { type: state.filters.subject.type, id: state.filters.subject.id, name: state.filters.subject.name }
      : state.filters.technicianId
        ? { type: "technician", id: state.filters.technicianId, name: state.filters.technician }
        : null,
    requestedName: state.filters.requestedName,
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
      chart: { type: state.filters.chartType || "bar", metrics: [], metricsExplicit: false },
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
  const interpretation = interpretRequest(message);
  const mention = interpretation.businessFilterCandidate;
  const record = explicitRecord(message);
  if (interpretation.chartTypeOnly) {
    const hasChart = prior.intent === "ENTITY_CHART" || prior.outputFormat === "chart" || prior.filters.chartType || prior.filters.groupBy;
    if (!hasChart || !prior.entity) {
      return clarify("What would you like to chart? For example, jobs by category.", prior.entity ? prior : emptyState());
    }
    const next = sanitizeState(prior);
    next.filters.chartType = interpretation.chartType;
    next.intent = "ENTITY_CHART";
    next.outputFormat = "chart";
    return {
      handled: true,
      state: next,
      clarification: null,
      suggestions: followUps(next),
      classified: toClassified(next)
    };
  }
  if (interpretation.groupingDimensions.length > 1) {
    const next = sanitizeState(prior);
    next.entity = interpretation.businessEntity || next.entity || "jobs";
    next.intent = "ENTITY_CHART";
    next.filters.requestedName = null;
    next.filters.subject = null;
    next.filters.technician = null;
    next.filters.technicianId = null;
    next.filters.chartType = interpretation.chartType;
    const labels = interpretation.groupingDimensions.join(" or ");
    return {
      handled: true,
      state: next,
      clarification: `I can chart jobs by one grouping at a time: ${labels}. Which one should I use?`,
      suggestions: interpretation.groupingDimensions.map((dim) => ({
        label: `By ${dim}`,
        message: `Show graph of jobs by ${dim}`
      })),
      classified: { kind: "clarify", intent: "CLARIFICATION", range: next.filters.range || "year_to_date", chart: null }
    };
  }
  const choiceType = choiceTypeFromMessage(message, prior.filters.pendingCandidates);
  const compare = /\bcompare\b/.test(text);
  const clear = /\b(start (?:a )?new topic|start over|new topic|forget (?:that|this))\b/.test(text);
  const carriesName = Boolean(prior.filters.subject || prior.filters.requestedName);
  const linked = referencesPrevious(text)
    || Boolean(ref)
    || Boolean(record)
    || Boolean(choiceType)
    || Boolean(range && !entity && !intent && !mention)
    || (carriesName && !mention && /\b(list|report|status[\s-]?wise|not the summary|as a list)\b/.test(text));
  const meaningful = Boolean(
    entity || intent || status !== undefined || groupBy || range || technician || ref || record || mention || choiceType || compare || clear || linked
  );

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
    state.filters.subject = null;
    state.filters.requestedName = null;
    state.filters.pendingCandidates = null;
    state.filters.hintedType = null;
    state.filters.chartType = null;
    state.comparison = false;
  }

  if (nextEntity) state.entity = nextEntity;
  if (intent) state.intent = intent;
  if (status !== undefined) state.filters.status = status;
  if (technician && !mention) {
    state.filters.technician = technician;
    state.filters.technicianId = null;
    state.filters.requestedName = technician;
    state.filters.hintedType = "technician";
    state.filters.subject = null;
  }
  if (mention) {
    state.entity = state.entity || "jobs";
    const sameSubject = state.filters.subject
      && state.filters.subject.name.toLowerCase() === mention.name.toLowerCase()
      && (!mention.hintedType || mention.hintedType === state.filters.subject.type);
    state.filters.requestedName = sameSubject ? null : mention.name;
    state.filters.hintedType = mention.hintedType || (!sameSubject ? state.filters.preferredType : null);
    if (!sameSubject) {
      state.filters.subject = null;
      if (mention.hintedType !== "technician" && mention.hintedType !== "user") {
        state.filters.technician = null;
        state.filters.technicianId = null;
      }
    }
    if (mention.hintedType) state.filters.preferredType = mention.hintedType;
  } else if (choiceType && state.filters.requestedName) {
    state.filters.hintedType = choiceType;
    state.entity = state.entity || "jobs";
  } else if (!linked && !record && nextEntity === "jobs" && (intent || nextEntity) && !technician) {
    state.filters.requestedName = null;
    state.filters.pendingCandidates = null;
    state.filters.subject = null;
    state.filters.hintedType = null;
    state.filters.technician = null;
    state.filters.technicianId = null;
  }
  const pinned = record || (ref ? { type: ref.type, id: Number(ref.id) } : null);
  if (pinned && JOB_LINKS[pinned.type]) {
    state.filters.subject = {
      type: pinned.type,
      id: Number(pinned.id),
      name: state.filters.requestedName || state.filters.subject?.name || state.filters.technician || pinned.type
    };
    state.filters.requestedName = null;
    state.filters.pendingCandidates = null;
    state.filters.hintedType = null;
    if (pinned.type === "technician" || pinned.type === "user") {
      state.filters.technicianId = Number(pinned.id);
      state.filters.technician = state.filters.subject.name;
    }
  }
  if (/\btechnicians?\b/.test(text) && !mention && !choiceType && state.entity !== "attendance") {
    state.filters.preferredType = "technician";
  }
  if (interpretation.chartType) state.filters.chartType = interpretation.chartType;
  if (interpretation.groupingDimensions.length === 1 && GROUPS.has(interpretation.groupingDimensions[0])) {
    state.filters.groupBy = interpretation.groupingDimensions[0];
  }
  if (interpretation.intent === "chart") state.intent = "ENTITY_CHART";
  if (interpretation.intent === "list" && !state.intent) state.intent = "ENTITY_LIST";
  if (range) {
    state.filters.range = range;
    state.filters.rangeExplicit = true;
  }
  if (!state.filters.range) state.filters.range = "year_to_date";
  if (groupBy) state.filters.groupBy = groupBy;
  if (compare) {
    state.comparison = true;
    state.intent = "PERIOD_COMPARISON";
  } else if (!state.intent && nextEntity) {
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
    return { handled: false, state, clarification: null, suggestions: [], classified: null };
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
    comparison: Boolean(state?.comparison),
    subjectType: filters.subject?.type || null,
    subjectId: filters.subject?.id || null,
    subjectName: filters.subject?.name || null,
    requestedName: filters.requestedName || null,
    chartType: filters.chartType || null
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
  toClassified,
  responseTypeFor,
  publicFilters,
  toolName,
  REPORT_CLARIFICATION
};
