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
  analyzeValidatedRows,
  buildNameLookupMap,
  clientError,
  normalizeColumnMapping,
  parseBoolean,
  parseDateValue,
  resolveLookup,
  validateRequiredMapping
} = require("../utils/bulk-upload-helpers");
const {
  JOB_CATEGORY_BULK_COLUMNS,
  JOB_CATEGORY_BULK_TEMPLATE_ROW,
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
} = require("../config/jobcategory-bulk-upload");

const session = createBulkSessionStore("jobcategories");

function sliceColor(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  return text.length <= 15 ? text : text.slice(0, 15);
}

async function loadLookupMaps(tenantid, branchid) {
  const groups = await prisma.jobgroups.findMany({
    where: { tenantid: Number(tenantid), branchid: Number(branchid) },
    select: { groupid: true, name: true }
  });
  return { groupByName: buildNameLookupMap(groups, { idField: "groupid", nameField: "name" }) };
}

function validateMappedRow(mapped, { dateFormat, lookupMaps }) {
  const issues = [];
  const payload = {};

  const name = String(mapped.name ?? "").trim();
  if (!name) issues.push("name is required");
  else payload.name = name;

  const group = resolveLookup(mapped.group, lookupMaps.groupByName, "Group");
  if (group.error) issues.push(group.error);
  else if (group.id != null) payload.groupid = group.id;
  else if (group.createName) payload._groupName = group.createName;
  else issues.push("group is required");

  if (mapped.color !== undefined && mapped.color !== "") {
    payload.color = sliceColor(mapped.color);
  }

  if (mapped.isactive !== undefined && mapped.isactive !== "") {
    const b = parseBoolean(mapped.isactive);
    if (b === null) issues.push("isactive must be yes/no or true/false");
    else payload.isactive = b;
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

  if (issues.length) return { valid: false, issues, payload: null };
  if (payload.isactive === undefined) payload.isactive = true;
  return { valid: true, issues: [], payload };
}

async function ensureLookupEntities(readyRows, tenantid, branchid, userid) {
  const maps = await loadLookupMaps(tenantid, branchid);
  const now = utcNow();
  const groupNames = new Set();
  readyRows.forEach(({ payload }) => {
    if (payload._groupName) groupNames.add(String(payload._groupName).trim());
  });

  const createdGroups = [];
  for (const name of groupNames) {
    const key = name.toLowerCase();
    if (!name || maps.groupByName.has(key)) continue;

    const row = await prisma.jobgroups.create({
      data: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        name,
        isactive: true,
        createdby: userid,
        createdat: now,
        lastupdatedby: userid,
        lastupdatedat: now
      }
    });
    maps.groupByName.set(key, row.groupid);
    createdGroups.push({ groupid: row.groupid, name: row.name });
  }

  return { maps, createdGroups };
}

function applyPendingLookups(payload, maps) {
  const next = { ...payload };
  if (next._groupName) {
    const id = maps.groupByName.get(String(next._groupName).trim().toLowerCase());
    if (id != null) next.groupid = id;
    delete next._groupName;
  }
  return next;
}

function collectPendingCreates(readyRows) {
  const groups = new Set();
  readyRows.forEach(({ payload }) => {
    if (payload._groupName) groups.add(String(payload._groupName).trim());
  });
  return { groups: [...groups] };
}

function sanitizePreviewPayload(payload) {
  if (!payload) return payload;
  const { _groupName, ...rest } = payload;
  return { ...rest, groupName: _groupName ?? null };
}

class JobCategoryBulkUploadService {
  buildTemplateBuffer() {
    return buildTemplateWorkbookBuffer(
      JOB_CATEGORY_BULK_COLUMNS,
      JOB_CATEGORY_BULK_TEMPLATE_ROW,
      "Categories"
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
    const lookupMaps = await loadLookupMaps(auth.tenantid, auth.branchid);
    const analysis = analyzeValidatedRows(
      mappedRows,
      (mapped) => validateMappedRow(mapped, { dateFormat, lookupMaps }),
      {
        duplicateKeyFn: (payload) =>
          payload.groupid || payload._groupName
            ? `${String(payload.name).toLowerCase()}::${payload.groupid || payload._groupName}`
            : null
      }
    );

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
      groupsToCreate: pendingCreates.groups,
      readySample: analysis.readyRows.slice(0, 5).map((item) => ({
        row: item.row,
        data: sanitizePreviewPayload(item.payload)
      }))
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
    const lookupMaps = await loadLookupMaps(auth.tenantid, auth.branchid);
    const analysis = analyzeValidatedRows(mappedRows, (mapped) =>
      validateMappedRow(mapped, { dateFormat, lookupMaps })
    );

    if (!analysis.readyCount) {
      clientError("No valid rows to import. Fix mapping issues and run preview again.");
    }

    const now = utcNow();
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const userid = Number(auth.userid);
    const { maps, createdGroups } = await ensureLookupEntities(
      analysis.readyRows,
      tenantid,
      branchid,
      userid
    );

    const imported = [];
    const insertErrors = [];

    for (const item of analysis.readyRows) {
      try {
        const resolved = applyPendingLookups(item.payload, maps);
        const row = await prisma.jobcategories.create({
          data: {
            ...resolved,
            tenantid,
            branchid,
            createdby: userid,
            lastupdatedby: userid,
            createdat: resolved.createdat || now,
            lastupdatedat: now
          }
        });
        imported.push({ row: item.row, categoryid: row.categoryid, name: row.name });
      } catch (err) {
        insertErrors.push({
          row: item.row,
          issues: [err.message || "Failed to insert category"]
        });
      }
    }

    session.removeSession(auth, uploadId);

    return {
      uploadId,
      importedCount: imported.length,
      skippedCount: analysis.problemCount + insertErrors.length,
      validationProblemCount: analysis.problemCount,
      insertErrorCount: insertErrors.length,
      createdGroups,
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

module.exports = new JobCategoryBulkUploadService();
