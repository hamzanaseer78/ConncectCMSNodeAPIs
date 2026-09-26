const DEFAULT_SEQUENCE_PAD_WIDTH = 5;
const DEFAULT_SEPARATOR = "-";
const MAX_CODE_ALLOCATION_ATTEMPTS = 10000;

function branchNameToDefaultPrefix(branchName) {
  const text = branchName != null ? String(branchName).trim() : "";
  if (!text) return "JB";

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, "").charAt(0))
      .filter(Boolean)
      .join("")
      .toUpperCase();
  }

  const alnum = text.replace(/[^a-zA-Z0-9]/g, "");
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
  if (alnum.length === 1) return alnum.toUpperCase();
  return "JB";
}

function normalizePrefix(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizePostfix(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeSeparator(value) {
  if (value == null || String(value).trim() === "") return DEFAULT_SEPARATOR;
  return String(value);
}

function parseSequenceInput(raw, fallbackPadWidth = DEFAULT_SEQUENCE_PAD_WIDTH) {
  if (raw == null || raw === "") {
    return { nextSequenceNumber: 1, sequencePadWidth: fallbackPadWidth };
  }

  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    const n = Math.trunc(raw);
    return {
      nextSequenceNumber: n,
      sequencePadWidth: Math.max(String(n).length, fallbackPadWidth, 1)
    };
  }

  const text = String(raw).trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return {
      nextSequenceNumber: n,
      sequencePadWidth: Math.max(text.length, fallbackPadWidth, 1)
    };
  }

  const err = new Error("sequence / nextSequence must be a positive integer");
  err.status = 400;
  throw err;
}

function formatSequenceNumber(sequenceNumber, padWidth) {
  const n = Math.max(Math.trunc(Number(sequenceNumber) || 0), 0);
  const width = Math.max(Math.trunc(Number(padWidth) || DEFAULT_SEQUENCE_PAD_WIDTH), 1);
  return String(n).padStart(width, "0");
}

function formatJobCode({ prefix, separator, sequenceNumber, sequencePadWidth, postfix }) {
  const pre = normalizePrefix(prefix);
  const post = normalizePostfix(postfix);
  const sep = normalizeSeparator(separator);
  const seq = formatSequenceNumber(sequenceNumber, sequencePadWidth);
  return `${pre}${sep}${seq}${post}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse sequence from an existing code matching prefix/separator/postfix/pad rules.
 */
function parseSequenceFromJobCode(code, settings = {}) {
  if (code == null) return null;
  const text = String(code).trim();
  if (!text) return null;

  const prefix = normalizePrefix(settings.prefix);
  const postfix = normalizePostfix(settings.postfix);
  const separator = normalizeSeparator(settings.separator);
  const padWidth = Math.max(Number(settings.sequencePadWidth) || DEFAULT_SEQUENCE_PAD_WIDTH, 1);

  if (!text.startsWith(prefix)) return null;
  let rest = text.slice(prefix.length);
  if (separator && rest.startsWith(separator)) {
    rest = rest.slice(separator.length);
  }

  if (postfix && rest.endsWith(postfix)) {
    rest = rest.slice(0, -postfix.length);
  }

  if (!/^\d+$/.test(rest)) return null;
  if (rest.length !== padWidth) return null;

  const n = Number(rest);
  return Number.isFinite(n) ? n : null;
}

function buildCodePatternPrefix(settings = {}) {
  const prefix = normalizePrefix(settings.prefix);
  const separator = normalizeSeparator(settings.separator);
  return `${prefix}${separator}`;
}

module.exports = {
  DEFAULT_SEQUENCE_PAD_WIDTH,
  DEFAULT_SEPARATOR,
  MAX_CODE_ALLOCATION_ATTEMPTS,
  branchNameToDefaultPrefix,
  normalizePrefix,
  normalizePostfix,
  normalizeSeparator,
  parseSequenceInput,
  formatSequenceNumber,
  formatJobCode,
  parseSequenceFromJobCode,
  buildCodePatternPrefix,
  escapeRegExp
};
