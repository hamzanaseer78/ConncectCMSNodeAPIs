const { extractMention } = require("../services/entity-resolution");
const { resolveIntelligenceRange } = require("../utils/intelligence-range");

function parseRangeFromText(text, session, now) {
  const source = String(text || "");
  let preset = null;
  if (/\blast\s+month|previous\s+month\b/i.test(source)) preset = "previous_month";
  else if (/\bthis\s+month\b/i.test(source)) preset = "this_month";
  else if (/\btoday\b/i.test(source)) preset = "today";
  else if (/\byesterday\b/i.test(source)) preset = "yesterday";
  else if (/\bthis\s+week\b/i.test(source)) preset = "this_week";
  else if (/\bthis\s+year\b/i.test(source)) preset = "this_year";
  else if (session?.range?.preset) preset = session.range.preset;
  if (!preset) return null;
  try {
    return resolveIntelligenceRange({ range: preset }, now);
  } catch {
    return null;
  }
}

function classifyIntent(message, session = {}, now = new Date()) {
  const text = String(message || "").trim();
  if (!text) return { kind: "empty" };
  if (/^(hi|hello|hey|yo|good\s+(morning|afternoon|evening)|thanks|thank\s+you|ok|okay)[\s!.?]*$/i.test(text)) {
    return { kind: "chat", subtype: "greeting" };
  }
  if (/what can you (do|help)|how can you help|what do you (do|support)|your capabilities/i.test(text)) {
    return { kind: "chat", subtype: "capabilities" };
  }

  const range = parseRangeFromText(text, session, now);
  const mention = extractMention(text);
  const namedStatus = text.match(/\b(pending|completed|resolved|cancelled|canceled|open)\b/i);
  const statusFilter = /\bonly\s+resolved\b|\bresolved\s+ones\b|\bresolved\s+jobs?\b/i.test(text)
    ? "resolved"
    : (/\bonly\s+pending\b|\bpending\s+ones\b|\bpending\s+jobs?\b/i.test(text)
      ? "pending"
      : (namedStatus && /\bjobs?\b/i.test(text) ? namedStatus[1].toLowerCase() : (session?.status || null)));
  const wantsCount = /\b(how many|number of|count of|\bcount\b)\b/i.test(text);

  if (/\btechnician[- ]wise\b|\bjobs?\s+by\s+technicians?\b/i.test(text)) {
    return { kind: "data", report: wantsCount ? "job_count" : "technician_jobs", range, mention, statusFilter };
  }
  if (/\bstatus[- ]wise\b|\bjobs?\s+by\s+status\b/i.test(text)) {
    return { kind: "data", report: "status_jobs", range, mention, statusFilter };
  }
  if (/amount to collect|totalcost|expenses?|collections?|cash collected|financial|revenue/i.test(text)) {
    return { kind: "data", report: "financial", range: range || parseRangeFromText("this month", {}, now), mention };
  }
  if (wantsCount && /\bjobs?\b/i.test(text)) {
    return { kind: "data", report: "job_count", range, mention, statusFilter };
  }
  if (mention) {
    return { kind: "data", report: "entity_jobs", range, mention, statusFilter };
  }
  if (/\bjobs?\b|\battendance\b|\bcustomers?\b|\btechnicians?\b|\binventory\b|\bstock\b|\btotals?\b|\bsum\b/i.test(text)) {
    return { kind: "data", report: (/total|sum|amount/i.test(text) ? "financial" : "jobs"), range, mention, statusFilter };
  }
  if (session?.report && /\b(same report|last month|previous|only |those|them|that)\b/i.test(text)) {
    return {
      kind: "data",
      report: session.report,
      range: range || session.range || null,
      mention: session.subject ? { name: session.subject.name, hintedType: session.subject.type } : mention,
      statusFilter,
      followUp: true
    };
  }
  return { kind: "chat", subtype: "general" };
}

module.exports = {
  classifyIntent,
  parseRangeFromText
};
