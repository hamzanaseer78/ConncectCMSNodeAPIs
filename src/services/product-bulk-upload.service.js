const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const {
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
} = require("../config/product-bulk-upload");
const {
  assertSessionAccess,
  createSession,
  getSourceFilePath,
  removeSession,
  updateSession
} = require("../utils/product-bulk-session");
const {
  buildTemplateWorkbookBuffer,
  mapRows,
  parseUploadedFile
} = require("../utils/product-bulk-parse");
const { normalizeProductPayload } = require("../utils/product-payload");

const DATE_FORMATS = {
  "YYYY-MM-DD": /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  "DD/MM/YYYY": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  "MM/DD/YYYY": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  "DD-MM-YYYY": /^(\d{1,2})-(\d{1,2})-(\d{4})$/
};

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

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDiscountType(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (text === "%") return "%";
  if (text === "@") return "@";
  return null;
}

function parseProductType(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim().toLowerCase();
  if (text === "service") return "service";
  if (text === "part" || text === "parts") return "inventory";
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

  const pattern = DATE_FORMATS[dateFormat];
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

function validateMapping(columnMapping) {
  const required = getRequiredColumns();
  const missing = required.filter((col) => !columnMapping[col.key]);
  if (missing.length) {
    clientError(`Column mapping is missing required fields: ${missing.map((c) => c.key).join(", ")}`);
  }
}

async function loadLookupMaps(tenantid) {
  const [units, brands] = await Promise.all([
    prisma.units.findMany({
      where: { tenantid: Number(tenantid) },
      select: { recno: true, name: true, symbol: true }
    }),
    prisma.brands.findMany({
      where: { tenantid: Number(tenantid) },
      select: { recno: true, name: true }
    })
  ]);

  const unitByName = new Map();
  units.forEach((row) => {
    if (row.name) unitByName.set(String(row.name).trim().toLowerCase(), row.recno);
    if (row.symbol) unitByName.set(String(row.symbol).trim().toLowerCase(), row.recno);
    unitByName.set(String(row.recno), row.recno);
  });

  const brandByName = new Map();
  brands.forEach((row) => {
    if (row.name) brandByName.set(String(row.name).trim().toLowerCase(), row.recno);
    brandByName.set(String(row.recno), row.recno);
  });

  return { unitByName, brandByName };
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

async function ensureLookupEntities(readyRows, tenantid, userid) {
  const maps = await loadLookupMaps(tenantid);
  const now = utcNow();
  const unitNames = new Set();
  const brandNames = new Set();

  readyRows.forEach(({ payload }) => {
    if (payload._unitName) unitNames.add(String(payload._unitName).trim());
    if (payload._brandName) brandNames.add(String(payload._brandName).trim());
  });

  const createdUnits = [];
  const createdBrands = [];

  for (const name of unitNames) {
    const key = name.toLowerCase();
    if (!name || maps.unitByName.has(key)) continue;

    const row = await prisma.units.create({
      data: {
        tenantid: Number(tenantid),
        name,
        symbol: name.slice(0, 20),
        isactive: true,
        createdby: userid,
        createdat: now,
        lastupdatedby: userid,
        lastupdatedat: now
      }
    });
    maps.unitByName.set(key, row.recno);
    if (row.symbol) maps.unitByName.set(String(row.symbol).trim().toLowerCase(), row.recno);
    createdUnits.push({ recno: row.recno, name: row.name });
  }

  for (const name of brandNames) {
    const key = name.toLowerCase();
    if (!name || maps.brandByName.has(key)) continue;

    const row = await prisma.brands.create({
      data: {
        tenantid: Number(tenantid),
        name,
        isactive: true,
        createdby: userid,
        createdat: now,
        lastupdatedby: userid,
        lastupdatedat: now
      }
    });
    maps.brandByName.set(key, row.recno);
    createdBrands.push({ recno: row.recno, name: row.name });
  }

  return { maps, createdUnits, createdBrands };
}

function applyPendingLookups(payload, maps) {
  const next = { ...payload };

  if (next._unitName) {
    const id = maps.unitByName.get(String(next._unitName).trim().toLowerCase());
    if (id != null) next.unitid = id;
    delete next._unitName;
  }

  if (next._brandName) {
    const id = maps.brandByName.get(String(next._brandName).trim().toLowerCase());
    if (id != null) next.brandid = id;
    delete next._brandName;
  }

  return next;
}

function collectPendingCreates(readyRows) {
  const units = new Set();
  const brands = new Set();
  readyRows.forEach(({ payload }) => {
    if (payload._unitName) units.add(String(payload._unitName).trim());
    if (payload._brandName) brands.add(String(payload._brandName).trim());
  });
  return { units: [...units], brands: [...brands] };
}

function sanitizePreviewPayload(payload) {
  if (!payload) return payload;
  const { _unitName, _brandName, ...rest } = payload;
  return {
    ...rest,
    unitName: _unitName ?? null,
    brandName: _brandName ?? null
  };
}

function validateMappedRow(mapped, { dateFormat, lookupMaps }) {
  const issues = [];
  const payload = {};

  const name = String(mapped.name ?? "").trim();
  if (!name) {
    issues.push("name is required");
  } else {
    payload.name = name;
  }

  ["hscode", "barcode", "erpcode"].forEach((field) => {
    if (mapped[field] === undefined || mapped[field] === "") return;
    payload[field] = String(mapped[field]).trim();
  });

  ["salerate", "purchaserate", "discountvalue"].forEach((field) => {
    if (mapped[field] === undefined || mapped[field] === "") return;
    const n = parseNumber(mapped[field]);
    if (n === null) issues.push(`${field} must be a number`);
    else payload[field] = n;
  });

  if (mapped.discounttype !== undefined && mapped.discounttype !== "") {
    const dt = parseDiscountType(mapped.discounttype);
    if (dt === null) issues.push("discounttype must be % or @");
    else payload.discounttype = dt;
  }

  if (mapped.producttype !== undefined && mapped.producttype !== "") {
    const pt = parseProductType(mapped.producttype);
    if (pt === null) issues.push("producttype must be Part or Service");
    else payload.producttype = pt;
  }

  ["managestock", "isactive", "enablecpairreceive"].forEach((field) => {
    if (mapped[field] === undefined || mapped[field] === "") return;
    const b = parseBoolean(mapped[field]);
    if (b === null) issues.push(`${field} must be yes/no or true/false`);
    else payload[field] = b;
  });

  if (mapped.unit !== undefined && mapped.unit !== "") {
    const unit = resolveLookup(mapped.unit, lookupMaps.unitByName, "Unit");
    if (unit.error) issues.push(unit.error);
    else if (unit.id != null) payload.unitid = unit.id;
    else if (unit.createName) payload._unitName = unit.createName;
  }

  if (mapped.brand !== undefined && mapped.brand !== "") {
    const brand = resolveLookup(mapped.brand, lookupMaps.brandByName, "Brand");
    if (brand.error) issues.push(brand.error);
    else if (brand.id != null) payload.brandid = brand.id;
    else if (brand.createName) payload._brandName = brand.createName;
  }

  if (mapped.createdat !== undefined && mapped.createdat !== "") {
    const date = parseDateValue(mapped.createdat, dateFormat);
    if (date === null) {
      issues.push(
        dateFormat
          ? `createdat could not be parsed with format ${dateFormat}`
          : "createdat is not a valid date"
      );
    } else {
      payload.createdat = date;
    }
  }

  if (issues.length) {
    return { valid: false, issues, payload: null };
  }

  const normalized = normalizeProductPayload(payload);
  if (normalized.isactive === undefined) normalized.isactive = true;

  return { valid: true, issues: [], payload: normalized };
}

function analyzeRows(rows, options) {
  const problems = [];
  const readyRows = [];
  const seenNames = new Map();
  const seenBarcodes = new Map();

  rows.forEach(({ rowNumber, mapped }) => {
    const result = validateMappedRow(mapped, options);
    const rowIssues = [...result.issues];

    if (result.valid) {
      const nameKey = String(result.payload.name).toLowerCase();
      if (seenNames.has(nameKey)) {
        rowIssues.push(`duplicate name in file (also on row ${seenNames.get(nameKey)})`);
      } else {
        seenNames.set(nameKey, rowNumber);
      }

      if (result.payload.barcode) {
        const barcodeKey = String(result.payload.barcode).toLowerCase();
        if (seenBarcodes.has(barcodeKey)) {
          rowIssues.push(`duplicate barcode in file (also on row ${seenBarcodes.get(barcodeKey)})`);
        } else {
          seenBarcodes.set(barcodeKey, rowNumber);
        }
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

class ProductBulkUploadService {
  buildTemplateBuffer() {
    return buildTemplateWorkbookBuffer();
  }

  async handleUpload(auth, file, uploadId) {
    if (!file) clientError("No file uploaded; use multipart field name \"file\"");
    if (!uploadId) clientError("Upload session id missing");

    const parsed = parseUploadedFile(file.path, file.originalname);

    const meta = createSession(auth, uploadId, {
      originalName: file.originalname,
      storedFilename: file.filename,
      fileType: parsed.fileType,
      headers: parsed.headers,
      rowCount: parsed.rowCount
    });

    return {
      uploadId: meta.uploadId,
      fileType: parsed.fileType,
      originalName: file.originalname,
      rowCount: parsed.rowCount,
      parseable: parsed.parseable,
      message: parsed.message,
      requiredColumns: getRequiredColumns(),
      availableColumns: parsed.headers,
      targetColumns: getAllTargetColumns(),
      suggestedMapping: parsed.parseable ? suggestColumnMapping(parsed.headers) : {},
      dateFormatOptions: Object.keys(DATE_FORMATS),
      expiresAt: meta.expiresAt
    };
  }

  async preview(auth, body = {}) {
    const uploadId = String(body.uploadId || "").trim();
    if (!uploadId) clientError("uploadId is required");

    const meta = assertSessionAccess(auth, uploadId);
    if (meta.fileType === "pdf") {
      clientError(
        "PDF bulk upload is not supported for column mapping. Please use the Excel template."
      );
    }

    const columnMapping = normalizeColumnMapping(body.columnMapping || {}, meta.headers || []);
    validateMapping(columnMapping);

    const dateFormat = body.dateFormat ? String(body.dateFormat).trim() : null;
    if (dateFormat && !DATE_FORMATS[dateFormat]) {
      clientError(`Unsupported dateFormat. Use one of: ${Object.keys(DATE_FORMATS).join(", ")}`);
    }

    const filePath = getSourceFilePath(meta, auth, uploadId);
    const parsed = parseUploadedFile(filePath, meta.originalName);
    const mappedRows = mapRows(parsed.headers, parsed.rows, columnMapping);
    const lookupMaps = await loadLookupMaps(auth.tenantid);
    const analysis = analyzeRows(mappedRows, { dateFormat, lookupMaps });

    updateSession(auth, uploadId, { columnMapping, dateFormat, lastPreviewAt: utcNow().toISOString() });

    const hasDateColumn = Boolean(columnMapping.createdat);
    const pendingCreates = collectPendingCreates(analysis.readyRows);

    return {
      uploadId,
      columnMapping,
      dateFormat: dateFormat || null,
      hasDateColumn,
      totalRows: analysis.totalRows,
      readyCount: analysis.readyCount,
      problemCount: analysis.problemCount,
      problems: analysis.problems,
      unitsToCreate: pendingCreates.units,
      brandsToCreate: pendingCreates.brands,
      readySample: analysis.readyRows.slice(0, 5).map((item) => ({
        row: item.row,
        data: sanitizePreviewPayload(item.payload)
      }))
    };
  }

  async confirm(auth, body = {}) {
    const uploadId = String(body.uploadId || "").trim();
    if (!uploadId) clientError("uploadId is required");

    const meta = assertSessionAccess(auth, uploadId);
    const columnMapping = normalizeColumnMapping(
      body.columnMapping || meta.columnMapping || {},
      meta.headers || []
    );
    validateMapping(columnMapping);

    const dateFormat =
      body.dateFormat !== undefined ? String(body.dateFormat || "").trim() || null : meta.dateFormat;

    const filePath = getSourceFilePath(meta, auth, uploadId);
    const parsed = parseUploadedFile(filePath, meta.originalName);
    const mappedRows = mapRows(parsed.headers, parsed.rows, columnMapping);
    const lookupMaps = await loadLookupMaps(auth.tenantid);
    const analysis = analyzeRows(mappedRows, { dateFormat, lookupMaps });

    if (!analysis.readyCount) {
      clientError("No valid rows to import. Fix mapping issues and run preview again.");
    }

    const now = utcNow();
    const tenantid = Number(auth.tenantid);
    const userid = Number(auth.userid);
    const { maps, createdUnits, createdBrands } = await ensureLookupEntities(
      analysis.readyRows,
      tenantid,
      userid
    );
    const imported = [];
    const insertErrors = [];

    for (const item of analysis.readyRows) {
      try {
        const resolved = applyPendingLookups(item.payload, maps);
        const data = {
          ...resolved,
          tenantid,
          createdby: userid,
          lastupdatedby: userid,
          createdat: resolved.createdat || now,
          lastupdatedat: now
        };

        const row = await prisma.products.create({ data });
        imported.push({ row: item.row, productid: row.productid, name: row.name });
      } catch (err) {
        insertErrors.push({
          row: item.row,
          issues: [err.message || "Failed to insert product"]
        });
      }
    }

    removeSession(auth, uploadId);

    return {
      uploadId,
      importedCount: imported.length,
      skippedCount: analysis.problemCount + insertErrors.length,
      validationProblemCount: analysis.problemCount,
      insertErrorCount: insertErrors.length,
      createdUnits,
      createdBrands,
      imported,
      validationProblems: analysis.problems,
      insertErrors
    };
  }

  async cancel(auth, uploadId) {
    const id = String(uploadId || "").trim();
    if (!id) clientError("uploadId is required");
    assertSessionAccess(auth, id);
    removeSession(auth, id);
    return { message: "Upload session cancelled", uploadId: id };
  }
}

module.exports = new ProductBulkUploadService();
