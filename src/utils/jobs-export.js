const XLSX = require("xlsx");
const { mergeReportColumns } = require("../services/report-columns.service");

const SUPPORTED_FORMATS = ["csv", "xlsx", "xls"];

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeExportFormat(value) {
  const key = String(value || "xlsx")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_FORMATS.includes(key)) {
    throw clientError(`format must be one of: ${SUPPORTED_FORMATS.join(", ")}`);
  }
  return key;
}

function resolveExportColumns(defaultColumns, savedColumns, requestColumns) {
  if (Array.isArray(requestColumns) && requestColumns.length) {
    return mergeReportColumns(defaultColumns, requestColumns).filter((column) => column.isShow !== false);
  }
  if (Array.isArray(savedColumns) && savedColumns.length) {
    return savedColumns.filter((column) => column.isShow !== false);
  }
  return defaultColumns.filter((column) => column.isShow !== false);
}

function formatExportCellValue(value, columnFieldType) {
  if (value == null || value === "") return "";
  if (columnFieldType === "date") {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  return value;
}

function buildExportSheetRows(rows, columns) {
  const headers = columns.map((column) => column.columnDescription || column.columnName);
  const dataRows = rows.map((row) =>
    columns.map((column) => formatExportCellValue(row[column.columnName], column.columnFieldType))
  );
  return [headers, ...dataRows];
}

function buildExportBuffer(rows, columns, format) {
  const sheetRows = buildExportSheetRows(rows, columns);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Jobs");

  const bookType = format === "csv" ? "csv" : format === "xls" ? "biff8" : "xlsx";
  const buffer = XLSX.write(workbook, { type: "buffer", bookType });

  const contentType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : format === "xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const extension = format === "csv" ? "csv" : format === "xls" ? "xls" : "xlsx";

  return { buffer, contentType, extension };
}

function buildExportFilename(prefix = "jobs-export") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefix}-${stamp}`;
}

module.exports = {
  SUPPORTED_FORMATS,
  normalizeExportFormat,
  resolveExportColumns,
  buildExportBuffer,
  buildExportFilename,
  clientError
};
