const { wrapAuthorizedSelect } = require("./sql-guard");
const { CATALOG, relationsForColumn, inferSourceTable } = require("./prisma-relations");
const { headingFor, visibleColumns } = require("./column-labels");
const { TABLE_BY_NAME } = require("./schema-catalog");

function integerIds(values) {
  const ids = [];
  const seen = new Set();
  values.forEach((value) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0 || seen.has(number)) return;
    seen.add(number);
    ids.push(number);
  });
  return ids;
}

function displayFromRow(row, fields) {
  if (!row) return null;
  for (let index = 0; index < fields.length; index += 1) {
    const value = row[fields[index]];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

async function loadRelatedMap(db, relation, ids, scope, options) {
  const target = relation.target || CATALOG.byName.get(relation.targetTable);
  if (!target || !TABLE_BY_NAME.has(target.name) || !ids.length) return new Map();
  const pk = relation.targetColumns[0] || target.idField;
  const fields = target.displayFields.length ? target.displayFields : ["name", "title"];
  const quoted = fields.filter((field, index) => fields.indexOf(field) === index && field !== pk);
  const sql = `SELECT ${[pk, ...quoted].join(", ")} FROM ${target.name} WHERE ${pk} IN (${ids.join(",")})`;
  const wrapped = wrapAuthorizedSelect(sql, scope, Math.min(ids.length, 200));
  const run = typeof db.$queryRawUnsafe === "function"
    ? db.$queryRawUnsafe(wrapped)
    : db.$queryRaw(wrapped);
  const rows = await Promise.race([
    run,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("lookup_timeout")), Number(options.queryTimeoutMs) || 8000);
    })
  ]);
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = Number(row[pk]);
    const label = displayFromRow(row, fields);
    if (Number.isInteger(key) && label) map.set(key, label);
  });
  return map;
}

function pickRelation(column, sourceTable) {
  const matches = relationsForColumn(column, sourceTable);
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const withTable = matches.find((item) => TABLE_BY_NAME.has(item.targetTable));
  return withTable || matches[0];
}

async function enrichRows(db, rows, scope, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return { rows: [], rawRows: [], columns: [], sourceTable: null };
  }
  const keys = Object.keys(list[0] || {});
  const sourceTable = options.sourceTable || inferSourceTable(keys);
  const visible = visibleColumns(keys, { sourceTable });
  const lookups = {};
  for (let index = 0; index < visible.length; index += 1) {
    const column = visible[index];
    const relation = pickRelation(column, sourceTable);
    if (!relation || !TABLE_BY_NAME.has(relation.targetTable)) continue;
    const ids = integerIds(list.map((row) => row[column]));
    if (!ids.length) continue;
    try {
      lookups[column] = await loadRelatedMap(db, relation, ids, scope, options);
    } catch {
      lookups[column] = new Map();
    }
  }
  const columns = visible.map((key) => ({
    key,
    label: headingFor(key, { sourceTable }),
    resolved: Boolean(lookups[key])
  }));
  const enriched = list.map((row) => {
    const next = {};
    columns.forEach((column) => {
      const raw = row[column.key];
      if (lookups[column.key]) {
        if (raw == null) {
          next[column.key] = null;
          return;
        }
        const mapped = lookups[column.key].get(Number(raw));
        next[column.key] = mapped == null ? null : mapped;
        return;
      }
      next[column.key] = raw;
    });
    return next;
  });
  return {
    rows: enriched,
    rawRows: list,
    columns,
    sourceTable
  };
}

module.exports = {
  integerIds,
  enrichRows,
  pickRelation
};
