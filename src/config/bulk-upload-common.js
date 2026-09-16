const BULK_UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const BULK_UPLOAD_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".pdf"]);

const BULK_DATE_FORMATS = {
  "YYYY-MM-DD": /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  "DD/MM/YYYY": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  "MM/DD/YYYY": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  "DD-MM-YYYY": /^(\d{1,2})-(\d{1,2})-(\d{4})$/
};

module.exports = {
  BULK_UPLOAD_SESSION_TTL_MS,
  BULK_UPLOAD_EXTENSIONS,
  BULK_DATE_FORMATS
};
