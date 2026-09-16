const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeColumn(column, index, defaultsByName) {
  const def = defaultsByName.get(String(column.columnName)) || {};
  const merged = { ...def, ...column };
  return {
    columnName: String(merged.columnName),
    columnDescription: merged.columnDescription ?? merged.columnName,
    isShow: merged.isShow !== false,
    sortable: merged.sortable === true,
    sortNo: Number.isFinite(Number(merged.sortNo)) ? Number(merged.sortNo) : index + 1,
    minWidth: Number.isFinite(Number(merged.minWidth)) ? Number(merged.minWidth) : 120,
    columnFieldType: merged.columnFieldType ?? "string",
    clickable: merged.clickable === true,
    isRigtAligned: merged.isRigtAligned === true,
    color: merged.color ?? "",
    isMandatory: def.isMandatory === true
  };
}

function mergeReportColumns(defaultColumns, savedColumns = []) {
  const defaultsByName = new Map(defaultColumns.map((column) => [column.columnName, column]));
  const savedByName = new Map(
    (Array.isArray(savedColumns) ? savedColumns : [])
      .filter((column) => column && column.columnName)
      .map((column) => [String(column.columnName), column])
  );

  const merged = defaultColumns.map((def, index) => {
    const saved = savedByName.get(def.columnName);
    const row = normalizeColumn(saved ? { ...def, ...saved } : def, index, defaultsByName);
    if (row.isMandatory) row.isShow = true;
    return row;
  });

  return merged.sort((left, right) => left.sortNo - right.sortNo);
}

function parseSavedColumnsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildScope(auth, reportKey) {
  return {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid),
    userid: Number(auth.userid),
    reportkey: String(reportKey)
  };
}

class ReportColumnsService {
  async getColumns(auth, reportKey, defaultColumns) {
    const scope = buildScope(auth, reportKey);
    const row = await prisma.reportcolumnpreferences.findFirst({ where: scope });
    const saved = parseSavedColumnsJson(row?.columnsjson);
    return mergeReportColumns(defaultColumns, saved);
  }

  async updateColumns(auth, reportKey, defaultColumns, inputColumns = []) {
    if (!Array.isArray(inputColumns) || !inputColumns.length) {
      throw clientError("columns array is required");
    }

    const defaultsByName = new Map(defaultColumns.map((column) => [column.columnName, column]));
    const unknown = inputColumns
      .map((column) => String(column.columnName))
      .filter((name) => !defaultsByName.has(name));

    if (unknown.length) {
      throw clientError(`Unknown column(s): ${unknown.join(", ")}`);
    }

    const merged = mergeReportColumns(
      defaultColumns,
      inputColumns.map((column, index) => ({ ...column, sortNo: column.sortNo ?? index + 1 }))
    );

    merged.forEach((column) => {
      if (column.isMandatory && column.isShow !== true) {
        throw clientError(`Column "${column.columnName}" is mandatory and cannot be hidden`);
      }
    });

    const scope = buildScope(auth, reportKey);
    const now = utcNow();
    const columnsjson = JSON.stringify(merged);

    const existing = await prisma.reportcolumnpreferences.findFirst({ where: scope });
    if (existing) {
      await prisma.reportcolumnpreferences.update({
        where: { recno: existing.recno },
        data: { columnsjson, lastupdatedat: now }
      });
    } else {
      await prisma.reportcolumnpreferences.create({
        data: {
          ...scope,
          columnsjson,
          createdat: now,
          lastupdatedat: now
        }
      });
    }

    return merged;
  }
}

module.exports = new ReportColumnsService();
module.exports.mergeReportColumns = mergeReportColumns;
module.exports.normalizeColumn = normalizeColumn;
