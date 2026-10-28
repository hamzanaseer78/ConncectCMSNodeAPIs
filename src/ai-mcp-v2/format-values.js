const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT = /^\d{4}-\d{2}-\d{2}T(?:00:00:00)(?:\.0+)?Z$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ID_COLUMN = /^(recno|.*(?:id|code)|manualjobno|priority|quotationstatus)$/i;
const DATE_COLUMN = /^(.*date|.*at|checkinat|checkoutat|collectedat|createdat|lastupdatedat)$/i;

const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

function isIdentifierColumn(column) {
  return ID_COLUMN.test(String(column || ""));
}

function isDateColumn(column) {
  return DATE_COLUMN.test(String(column || ""));
}

function utcDateFromParts(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date) {
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatUtcTimestamp(date) {
  return `${formatUtcDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function isDateOnlyValue(value) {
  if (typeof value === "string") {
    if (DATE_ONLY.test(value)) return true;
    if (UTC_MIDNIGHT.test(value)) return true;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getUTCHours() === 0
      && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0
      && value.getUTCMilliseconds() === 0;
  }
  return false;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return utcDateFromParts(year, month, day);
  }
  if (UTC_TIMESTAMP.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return null;
  if (isDateOnlyValue(value) || isDateOnlyValue(date)) return formatUtcDate(date);
  return formatUtcTimestamp(date);
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  const decimals = String(value).split(".")[1]?.length || 0;
  const fraction = Math.min(Math.max(decimals, 2), 6);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(value);
}

function formatDisplay(value, column = "") {
  if (value == null) return { text: "—", kind: "null" };
  if (typeof value === "boolean") return { text: value ? "true" : "false", kind: "boolean" };
  if (typeof value === "string" && /^0\d+$/.test(value)) {
    return { text: value, kind: "identifier" };
  }
  if (isIdentifierColumn(column) && (typeof value === "number" || typeof value === "string")) {
    return { text: String(value), kind: "identifier" };
  }
  if (isDateColumn(column) || parseDate(value)) {
    const formatted = formatDate(value);
    if (formatted) return { text: formatted, kind: isDateOnlyValue(value) ? "date" : "timestamp" };
  }
  if (typeof value === "number") {
    const formatted = formatNumber(value);
    return { text: formatted == null ? String(value) : formatted, kind: "number" };
  }
  return { text: String(value), kind: "text" };
}

function formatNarrativeDates(text) {
  return String(text || "")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (match) => formatDate(match) || match)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (match) => formatDate(match) || match);
}

module.exports = {
  isIdentifierColumn,
  isDateColumn,
  isDateOnlyValue,
  parseDate,
  formatDate,
  formatNumber,
  formatDisplay,
  formatNarrativeDates
};
