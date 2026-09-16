const {
  BULK_UPLOAD_EXTENSIONS,
  BULK_DATE_FORMATS
} = require("../config/bulk-upload-common");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "active"].includes(text)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(text)) return false;
  return null;
}

function parseDateValue(value, dateFormat) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text) return undefined;

  if (!dateFormat) {
    const direct = new Date(text);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const pattern = BULK_DATE_FORMATS[dateFormat];
  if (!pattern) return null;

  const match = text.match(pattern);
  if (!match) return null;

  if (dateFormat === "YYYY-MM-DD") {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  if (dateFormat === "DD/MM/YYYY" || dateFormat === "DD-MM-YYYY") {
    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  }
  if (dateFormat === "MM/DD/YYYY") {
    return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  }

  return null;
}

function normalizeColumnMapping(input = {}, availableColumns = []) {
  const available = new Set(availableColumns);
  const mapping = {};

  Object.entries(input).forEach(([key, header]) => {
    if (!header) return;
    const trimmed = String(header).trim();
    if (!available.has(trimmed)) {
      clientError(`Mapped column "${trimmed}" for "${key}" was not found in the uploaded file`);
    }
    mapping[key] = trimmed;
  });

  return mapping;
}

function validateRequiredMapping(columnMapping, getRequiredColumns) {
  const missing = getRequiredColumns().filter((col) => !columnMapping[col.key]);
  if (missing.length) {
    clientError(
      `Column mapping is missing required fields: ${missing.map((c) => c.key).join(", ")}`
    );
  }
}

function resolveLookup(value, lookupMap, label) {
  if (value === undefined || value === null || value === "") return {};
  const text = String(value).trim();
  if (!text) return {};

  if (/^\d+$/.test(text)) {
    const id = lookupMap.get(text);
    if (id != null) return { id };
    return { error: `${label} id ${text} was not found` };
  }

  const byName = lookupMap.get(text.toLowerCase());
  if (byName != null) return { id: byName };
  return { createName: text };
}

function buildNameLookupMap(rows, { idField = "recno", nameField = "name" } = {}) {
  const map = new Map();
  rows.forEach((row) => {
    if (row[nameField]) map.set(String(row[nameField]).trim().toLowerCase(), row[idField]);
    map.set(String(row[idField]), row[idField]);
  });
  return map;
}

function analyzeValidatedRows(rows, validateRow, { duplicateKeyFn } = {}) {
  const problems = [];
  const readyRows = [];
  const seen = new Map();

  rows.forEach(({ rowNumber, mapped }) => {
    const result = validateRow(mapped);
    const rowIssues = [...result.issues];

    if (result.valid && duplicateKeyFn) {
      const key = duplicateKeyFn(result.payload);
      if (key && seen.has(key)) {
        rowIssues.push(`duplicate row in file (also on row ${seen.get(key)})`);
      } else if (key) {
        seen.set(key, rowNumber);
      }
    }

    if (rowIssues.length) {
      problems.push({ row: rowNumber, issues: rowIssues });
    } else {
      readyRows.push({ row: rowNumber, payload: result.payload });
    }
  });

  return {
    totalRows: rows.length,
    readyCount: readyRows.length,
    problemCount: problems.length,
    problems,
    readyRows
  };
}

module.exports = {
  BULK_DATE_FORMATS,
  BULK_UPLOAD_EXTENSIONS,
  analyzeValidatedRows,
  buildNameLookupMap,
  clientError,
  normalizeColumnMapping,
  parseBoolean,
  parseDateValue,
  resolveLookup,
  validateRequiredMapping
};
