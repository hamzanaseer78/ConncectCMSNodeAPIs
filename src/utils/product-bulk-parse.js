const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  PRODUCT_BULK_COLUMNS,
  PRODUCT_BULK_TEMPLATE_ROW,
  EXCEL_EXTENSIONS,
  PDF_EXTENSIONS
} = require("../config/product-bulk-upload");

function detectFileType(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  if (EXCEL_EXTENSIONS.has(ext)) return "excel";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "unknown";
}

function readExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error("Excel file has no worksheets");
    err.status = 400;
    throw err;
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false
  });

  if (!matrix.length) {
    const err = new Error("Excel file is empty");
    err.status = 400;
    throw err;
  }

  const headers = matrix[0].map((cell) => String(cell ?? "").trim());
  const rows = matrix.slice(1).filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== "")
  );

  return { headers, rows, sheetName };
}

function buildTemplateWorkbookBuffer() {
  const headers = PRODUCT_BULK_COLUMNS.map((col) => col.label);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, PRODUCT_BULK_TEMPLATE_ROW]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Products");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function cellToString(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function rowToRecord(headers, row) {
  const record = {};
  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = cellToString(row[index]);
  });
  return record;
}

function parseUploadedFile(filePath, originalName) {
  const fileType = detectFileType(originalName || filePath);

  if (fileType === "pdf") {
    return {
      fileType: "pdf",
      headers: [],
      rows: [],
      rowCount: 0,
      parseable: false,
      message:
        "PDF files cannot be column-mapped. Download the Excel template, fill it in, and upload .xlsx or .xls."
    };
  }

  if (fileType !== "excel") {
    const err = new Error("Unsupported file type. Upload .xlsx, .xls, or .csv");
    err.status = 400;
    throw err;
  }

  if (!fs.existsSync(filePath)) {
    const err = new Error("Uploaded file not found on server");
    err.status = 404;
    throw err;
  }

  const { headers, rows } = readExcelRows(filePath);
  const availableColumns = headers.filter(Boolean);

  if (!availableColumns.length) {
    const err = new Error("No column headers found in the first row of the file");
    err.status = 400;
    throw err;
  }

  return {
    fileType: "excel",
    headers: availableColumns,
    rows,
    rowCount: rows.length,
    parseable: true,
    message: null
  };
}

function mapRows(headers, rawRows, columnMapping) {
  return rawRows.map((row, index) => ({
    rowNumber: index + 2,
    source: rowToRecord(headers, row),
    mapped: applyColumnMapping(rowToRecord(headers, row), columnMapping)
  }));
}

function applyColumnMapping(sourceRecord, columnMapping = {}) {
  const mapped = {};
  Object.entries(columnMapping || {}).forEach(([targetKey, sourceHeader]) => {
    if (!sourceHeader) return;
    mapped[targetKey] = sourceRecord[sourceHeader] ?? "";
  });
  return mapped;
}

module.exports = {
  applyColumnMapping,
  buildTemplateWorkbookBuffer,
  cellToString,
  detectFileType,
  mapRows,
  parseUploadedFile,
  readExcelRows,
  rowToRecord
};
