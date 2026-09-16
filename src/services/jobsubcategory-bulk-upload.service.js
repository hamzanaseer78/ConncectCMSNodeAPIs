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
  JOB_SUBCATEGORY_BULK_COLUMNS,
  JOB_SUBCATEGORY_BULK_TEMPLATE_ROW,
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
} = require("../config/jobsubcategory-bulk-upload");

const session = createBulkSessionStore("jobsubcategories");

function sliceColor(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  return text.length <= 15 ? text : text.slice(0, 15);
}

async function loadLookupMaps(tenantid, branchid) {
  const [groups, categories] = await Promise.all([
    prisma.jobgroups.findMany({
      where: { tenantid: Number(tenantid), branchid: Number(branchid) },
      select: { groupid: true, name: true }
    }),
    prisma.jobcategories.findMany({
      where: { tenantid: Number(tenantid), branchid: Number(branchid) },
      select: { categoryid: true, name: true, groupid: true }
    })
  ]);

  const categoryByName = new Map();
  categories.forEach((row) => {
    if (row.name) {
      categoryByName.set(String(row.name).trim().toLowerCase(), {
        categoryid: row.categoryid,
        groupid: row.groupid
      });
    }
    categoryByName.set(String(row.categoryid), {
      categoryid: row.categoryid,
      groupid: row.groupid
    });
  });

  return {
    groupByName: buildNameLookupMap(groups, { idField: "groupid", nameField: "name" }),
    categoryByName
  };
}

function resolveCategoryLookup(value, lookupMap, label) {
  if (value === undefined || value === null || value === "") return {};
  const text = String(value).trim();
  if (!text) return {};

  if (/^\d+$/.test(text)) {
    const match = lookupMap.get(text);
    if (match) return { id: match };
    return { error: `${label} id ${text} was not found` };
  }

  const byName = lookupMap.get(text.toLowerCase());
  if (byName) return { id: byName };
  return { createName: text };
}

function validateMappedRow(mapped, { dateFormat, lookupMaps }) {
  const issues = [];
  const payload = {};

  const name = String(mapped.name ?? "").trim();
  if (!name) issues.push("name is required");
  else payload.name = name;

  const category = resolveCategoryLookup(mapped.category, lookupMaps.categoryByName, "Category");
  if (category.error) {
    issues.push(category.error);
  } else if (category.id != null) {
    payload.categoryid = category.id.categoryid;
  } else if (category.createName) {
    payload._categoryName = category.createName;

    const groupText =
      mapped.group !== undefined && mapped.group !== "" ? String(mapped.group).trim() : "";
    if (!groupText) {
      issues.push("group is required when category does not exist and will be created");
    } else {
      const group = resolveLookup(mapped.group, lookupMaps.groupByName, "Group");
      if (group.error) issues.push(group.error);
      else if (group.id != null) payload._groupId = group.id;
      else if (group.createName) payload._groupName = group.createName;
      else issues.push("group is required when category does not exist");
    }
  } else {
    issues.push("category is required");
  }

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
  const createdGroups = [];
  const createdCategories = [];

  const groupNames = new Set();
  readyRows.forEach(({ payload }) => {
    if (payload._groupName) groupNames.add(String(payload._groupName).trim());
  });

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

  for (const item of readyRows) {
    const payload = item.payload;
    if (!payload._categoryName) continue;

    const categoryKey = String(payload._categoryName).trim().toLowerCase();
    if (maps.categoryByName.has(categoryKey)) continue;

    let groupid = payload._groupId;
    if (groupid == null && payload._groupName) {
      groupid = maps.groupByName.get(String(payload._groupName).trim().toLowerCase());
    }
    if (groupid == null) continue;

    const row = await prisma.jobcategories.create({
      data: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        groupid,
        name: String(payload._categoryName).trim(),
        isactive: true,
        createdby: userid,
        createdat: now,
        lastupdatedby: userid,
        lastupdatedat: now
      }
    });

    maps.categoryByName.set(categoryKey, { categoryid: row.categoryid, groupid: row.groupid });
    createdCategories.push({ categoryid: row.categoryid, name: row.name, groupid: row.groupid });
  }

  return { maps, createdGroups, createdCategories };
}

function applyPendingLookups(payload, maps) {
  const next = { ...payload };

  if (next._categoryName) {
    const match = maps.categoryByName.get(String(next._categoryName).trim().toLowerCase());
    if (match?.categoryid != null) next.categoryid = match.categoryid;
    delete next._categoryName;
  }

  delete next._groupName;
  delete next._groupId;
  return next;
}

function collectPendingCreates(readyRows) {
  const groups = new Set();
  const categories = new Set();
  readyRows.forEach(({ payload }) => {
    if (payload._groupName) groups.add(String(payload._groupName).trim());
    if (payload._categoryName) categories.add(String(payload._categoryName).trim());
  });
  return { groups: [...groups], categories: [...categories] };
}

function sanitizePreviewPayload(payload) {
  if (!payload) return payload;
  const { _categoryName, _groupName, _groupId, ...rest } = payload;
  return {
    ...rest,
    categoryName: _categoryName ?? null,
    groupName: _groupName ?? null
  };
}

class JobSubcategoryBulkUploadService {
  buildTemplateBuffer() {
    return buildTemplateWorkbookBuffer(
      JOB_SUBCATEGORY_BULK_COLUMNS,
      JOB_SUBCATEGORY_BULK_TEMPLATE_ROW,
      "Subcategories"
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
          payload.categoryid || payload._categoryName
            ? `${String(payload.name).toLowerCase()}::${payload.categoryid || payload._categoryName}`
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
      categoriesToCreate: pendingCreates.categories,
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
    const { maps, createdGroups, createdCategories } = await ensureLookupEntities(
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
        const row = await prisma.jobsubcategories.create({
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
        imported.push({
          row: item.row,
          subcategoryid: row.subcategoryid,
          name: row.name
        });
      } catch (err) {
        insertErrors.push({
          row: item.row,
          issues: [err.message || "Failed to insert subcategory"]
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
      createdCategories,
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

module.exports = new JobSubcategoryBulkUploadService();
