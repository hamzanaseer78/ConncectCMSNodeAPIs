const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { createBulkSessionStore } = require("../utils/bulk-upload-session");
const {
  buildTemplateWorkbookBuffer,
  mapRows,
  parseUploadedFile
} = require("../utils/bulk-upload-excel");
const {
  BULK_DATE_FORMATS,
  clientError,
  normalizeColumnMapping,
  parseBoolean,
  parseDateValue,
  resolveLookup,
  validateRequiredMapping
} = require("../utils/bulk-upload-helpers");
const {
  ERP_PRODUCT_BULK_COLUMNS,
  ERP_PRODUCT_BULK_TEMPLATE_ROW,
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
} = require("../config/erpproduct-bulk-upload");
const {
  buildErpProductBulkInsertData,
  normalizeErpProductPayload
} = require("../utils/erp-product-payload");
const { getPrismaDelegateName } = require("../utils/prisma-metadata");

const session = createBulkSessionStore("erpproducts");

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

async function loadLookupMaps(tenantid) {
  const [units, brands, groups, categories] = await Promise.all([
    prisma.units.findMany({
      where: { tenantid: Number(tenantid) },
      select: { recno: true, name: true, symbol: true }
    }),
    prisma.brands.findMany({
      where: { tenantid: Number(tenantid) },
      select: { recno: true, name: true }
    }),
    prisma.jobgroups.findMany({
      where: { tenantid: Number(tenantid) },
      select: { groupid: true, name: true }
    }),
    prisma.jobcategories.findMany({
      where: { tenantid: Number(tenantid) },
      select: { categoryid: true, name: true, groupid: true }
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

  const groupByName = new Map();
  groups.forEach((row) => {
    if (row.name) groupByName.set(String(row.name).trim().toLowerCase(), row.groupid);
    groupByName.set(String(row.groupid), row.groupid);
  });

  const categoryByName = new Map();
  categories.forEach((row) => {
    const entry = { categoryid: row.categoryid, groupid: row.groupid };
    if (row.name) categoryByName.set(String(row.name).trim().toLowerCase(), entry);
    categoryByName.set(String(row.categoryid), entry);
  });

  return { unitByName, brandByName, groupByName, categoryByName };
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

  ["isactive", "enablecpairreceive"].forEach((field) => {
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

  if (mapped.jobgroup !== undefined && mapped.jobgroup !== "") {
    const group = resolveLookup(mapped.jobgroup, lookupMaps.groupByName, "Job Group");
    if (group.error) issues.push(group.error);
    else if (group.id != null) payload.groupid = group.id;
    else if (group.createName) {
      issues.push("job group must already exist (creation during import is not supported)");
    }
  }

  if (mapped.jobcategory !== undefined && mapped.jobcategory !== "") {
    const text = String(mapped.jobcategory).trim();
    if (/^\d+$/.test(text)) {
      const match = lookupMaps.categoryByName.get(text);
      if (!match) issues.push(`Job Category id ${text} was not found`);
      else payload.serviceid = match.categoryid;
    } else {
      const match = lookupMaps.categoryByName.get(text.toLowerCase());
      if (!match) issues.push(`Job Category "${text}" was not found`);
      else payload.serviceid = match.categoryid;
    }
  }

  if (payload.groupid != null && payload.serviceid != null) {
    const category = lookupMaps.categoryByName.get(String(payload.serviceid));
    if (
      category?.groupid != null &&
      Number(category.groupid) !== Number(payload.groupid)
    ) {
      issues.push(
        `Job Category ${payload.serviceid} does not belong to Job Group ${payload.groupid}`
      );
    }
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

  const normalized = normalizeErpProductPayload(payload);
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

async function enrichPreviewPayload(payload, tenantid) {
  if (!payload) return payload;
  const { _unitName, _brandName, ...rest } = payload;
  const next = {
    ...rest,
    unitName: _unitName ?? null,
    brandName: _brandName ?? null,
    groupName: null,
    categoryName: null
  };

  const lookups = [];
  if (next.groupid != null) {
    lookups.push(
      prisma.jobgroups
        .findFirst({
          where: { groupid: Number(next.groupid), tenantid: Number(tenantid) },
          select: { name: true }
        })
        .then((row) => {
          next.groupName = row?.name ?? null;
        })
    );
  }
  if (next.serviceid != null) {
    lookups.push(
      prisma.jobcategories
        .findFirst({
          where: { categoryid: Number(next.serviceid), tenantid: Number(tenantid) },
          select: { name: true }
        })
        .then((row) => {
          next.categoryName = row?.name ?? null;
        })
    );
  }
  if (lookups.length) await Promise.all(lookups);

  return next;
}

class ErpProductBulkUploadService {
  buildTemplateBuffer() {
    return buildTemplateWorkbookBuffer(
      ERP_PRODUCT_BULK_COLUMNS,
      ERP_PRODUCT_BULK_TEMPLATE_ROW,
      "ERP Products"
    );
  }

  async handleUpload(auth, file, uploadId) {
    if (!file) clientError('No file uploaded; use multipart field name "file"');
    if (!uploadId) clientError("Upload session id missing");

    const parsed = parseUploadedFile(file.path, file.originalname);
    const meta = session.createSession(auth, uploadId, {
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
      dateFormatOptions: Object.keys(BULK_DATE_FORMATS),
      expiresAt: meta.expiresAt
    };
  }

  async preview(auth, body = {}) {
    const uploadId = String(body.uploadId || "").trim();
    if (!uploadId) clientError("uploadId is required");

    const meta = session.assertSessionAccess(auth, uploadId);
    if (meta.fileType === "pdf") {
      clientError("PDF bulk upload is not supported. Please use the Excel template.");
    }

    const columnMapping = normalizeColumnMapping(body.columnMapping || {}, meta.headers || []);
    validateRequiredMapping(columnMapping, getRequiredColumns);

    const dateFormat = body.dateFormat ? String(body.dateFormat).trim() : null;
    if (dateFormat && !BULK_DATE_FORMATS[dateFormat]) {
      clientError(`Unsupported dateFormat. Use one of: ${Object.keys(BULK_DATE_FORMATS).join(", ")}`);
    }

    const filePath = session.getSourceFilePath(meta, auth, uploadId);
    const parsed = parseUploadedFile(filePath, meta.originalName);
    const mappedRows = mapRows(parsed.headers, parsed.rows, columnMapping);
    const lookupMaps = await loadLookupMaps(auth.tenantid);
    const analysis = analyzeRows(mappedRows, { dateFormat, lookupMaps });

    session.updateSession(auth, uploadId, {
      columnMapping,
      dateFormat,
      lastPreviewAt: utcNow().toISOString()
    });

    const pendingCreates = collectPendingCreates(analysis.readyRows);

    return {
      uploadId,
      columnMapping,
      dateFormat: dateFormat || null,
      hasDateColumn: Boolean(columnMapping.createdat),
      totalRows: analysis.totalRows,
      readyCount: analysis.readyCount,
      problemCount: analysis.problemCount,
      problems: analysis.problems,
      unitsToCreate: pendingCreates.units,
      brandsToCreate: pendingCreates.brands,
      readySample: await Promise.all(
        analysis.readyRows.slice(0, 5).map(async (item) => ({
          row: item.row,
          data: await enrichPreviewPayload(item.payload, auth.tenantid)
        }))
      )
    };
  }

  async confirm(auth, body = {}) {
    const uploadId = String(body.uploadId || "").trim();
    if (!uploadId) clientError("uploadId is required");

    const meta = session.assertSessionAccess(auth, uploadId);
    const columnMapping = normalizeColumnMapping(
      body.columnMapping || meta.columnMapping || {},
      meta.headers || []
    );
    validateRequiredMapping(columnMapping, getRequiredColumns);

    const dateFormat =
      body.dateFormat !== undefined ? String(body.dateFormat || "").trim() || null : meta.dateFormat;

    const filePath = session.getSourceFilePath(meta, auth, uploadId);
    const parsed = parseUploadedFile(filePath, meta.originalName);
    const mappedRows = mapRows(parsed.headers, parsed.rows, columnMapping);
    const lookupMaps = await loadLookupMaps(auth.tenantid);
    const analysis = analyzeRows(mappedRows, { dateFormat, lookupMaps });

    if (!analysis.readyCount) {
      clientError("No valid rows to import. Fix mapping issues and run preview again.");
    }

    const erpModel = getPrismaDelegateName("erpproducts");
    if (!prisma[erpModel]?.create) {
      clientError(
        "erpproducts model is not available. Run: npx prisma migrate deploy && npx prisma generate",
        503
      );
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
        const data = await buildErpProductBulkInsertData(resolved, auth, now);
        const row = await prisma[erpModel].create({ data });
        imported.push({
          row: item.row,
          erpproductid: row.erpproductid,
          name: row.name,
          tenantid: row.tenantid ?? null,
          branchid: row.branchid ?? null
        });
      } catch (err) {
        insertErrors.push({
          row: item.row,
          issues: [err.message || "Failed to insert ERP product"]
        });
      }
    }

    if (!imported.length && analysis.readyCount > 0) {
      clientError(
        `ERP product import failed for all ${analysis.readyCount} row(s). See insertErrors for details.`
      );
    }

    session.removeSession(auth, uploadId);

    return {
      uploadId,
      targetTable: erpModel,
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
    session.assertSessionAccess(auth, id);
    session.removeSession(auth, id);
    return { message: "Upload session cancelled", uploadId: id };
  }
}

module.exports = new ErpProductBulkUploadService();
