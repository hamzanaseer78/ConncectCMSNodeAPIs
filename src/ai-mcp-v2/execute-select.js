const { Prisma } = require("@prisma/client");
const { AiMcpError } = require("./errors");
const { wrapAuthorizedSelect } = require("./sql-guard");
const { inspectSchema } = require("./schema-catalog");
const { enrichRows } = require("./result-enrichment");

function serializeRows(rows, maxRows) {
  const list = Array.isArray(rows) ? rows.slice(0, maxRows) : [];
  return list.map((row) => {
    const out = {};
    Object.keys(row || {}).forEach((key) => {
      const value = row[key];
      if (value instanceof Date) out[key] = value.toISOString();
      else if (value && typeof value === "object" && typeof value.toNumber === "function") out[key] = value.toNumber();
      else if (typeof value === "bigint") out[key] = Number(value);
      else out[key] = value;
    });
    return out;
  });
}

async function runAuthorizedSelect(db, sql, scope, options = {}) {
  const maxRows = Math.min(Math.max(Number(options.maxRows) || 50, 1), 200);
  const timeoutMs = Number(options.queryTimeoutMs) || 8000;
  const wrapped = wrapAuthorizedSelect(sql, scope, maxRows);
  if (!db || typeof db.$queryRawUnsafe !== "function" && typeof db.$queryRaw !== "function") {
    throw new AiMcpError("Database access is not available.", 500, "query_failed");
  }
  const run = () => (typeof db.$queryRawUnsafe === "function"
    ? db.$queryRawUnsafe(wrapped)
    : db.$queryRaw(Prisma.raw(wrapped)));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AiMcpError("The database query timed out.", 504, "query_timeout"));
    }, timeoutMs);
  });
  try {
    const rows = await Promise.race([run(), timeout]);
    const data = serializeRows(rows, maxRows);
    let enriched = { rows: data, rawRows: data, columns: [], sourceTable: null };
    try {
      enriched = await enrichRows(db, data, scope, options);
    } catch {
      enriched = { rows: data, rawRows: data, columns: [], sourceTable: null };
    }
    return {
      rowCount: data.length,
      truncated: Array.isArray(rows) && rows.length > maxRows,
      rows: enriched.rows,
      columns: enriched.columns,
      sourceTable: enriched.sourceTable
    };
  } catch (err) {
    if (err instanceof AiMcpError) throw err;
    throw new AiMcpError("The query failed, so no total is available.", 500, "query_failed");
  } finally {
    clearTimeout(timer);
  }
}

function schemaForPrompt(scope) {
  return inspectSchema(scope);
}

module.exports = {
  runAuthorizedSelect,
  serializeRows,
  schemaForPrompt
};
