const { AiMcpError } = require("./errors");
const { TABLE_BY_NAME, authorizedWithSql } = require("./schema-catalog");

let parseSql = null;
try {
  parseSql = require("pgsql-ast-parser").parse;
} catch {
  parseSql = null;
}

const WRITE_AST_TYPES = new Set([
  "insert", "update", "delete", "truncate", "create", "drop", "alter",
  "grant", "revoke", "merge", "copy"
]);

function walkAst(node, depth = 0) {
  if (!node || depth > 48) return;
  if (Array.isArray(node)) {
    node.forEach((item) => walkAst(item, depth + 1));
    return;
  }
  if (typeof node !== "object") return;
  const type = String(node.type || "").toLowerCase();
  if (WRITE_AST_TYPES.has(type)) {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  Object.values(node).forEach((value) => walkAst(value, depth + 1));
}

function assertParsedSelect(sql) {
  if (!parseSql) return;
  let ast;
  try {
    ast = parseSql(sql);
  } catch {
    throw new AiMcpError("The SQL could not be parsed.", 400, "invalid_sql");
  }
  if (!Array.isArray(ast) || ast.length !== 1) {
    throw new AiMcpError("Multiple SQL statements are not allowed.", 403, "read_only");
  }
  const stmt = ast[0];
  if (stmt?.type !== "select" && stmt?.type !== "with") {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  walkAst(stmt);
}

const FORBIDDEN = Object.freeze([
  "insert", "update", "delete", "merge", "upsert", "drop", "alter", "create", "truncate",
  "grant", "revoke", "copy", "execute", "call", "do", "into", "locking",
  "vacuum", "reindex", "cluster", "listen", "notify", "load",
  "begin", "commit", "rollback", "savepoint", "prepare",
  "deallocate", "discard", "lock", "comment"
]);

const FORBIDDEN_FUNCS = Object.freeze([
  "pg_read_file", "pg_ls_dir", "pg_read_binary_file", "dblink", "lo_import", "lo_export",
  "pg_sleep", "pg_terminate_backend", "pg_reload_conf", "current_setting", "set_config"
]);

function stripComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function tokenize(sql) {
  return stripComments(sql)
    .replace(/'/g, " ' ")
    .split(/\s+/)
    .map((token) => token.replace(/[(),]/g, " ").trim())
    .filter(Boolean);
}

function extractTables(sql) {
  const text = stripComments(sql);
  const names = new Set();
  const matcher = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi;
  let match;
  while ((match = matcher.exec(text))) {
    names.add(String(match[1]).replace(/"/g, "").toLowerCase());
  }
  return [...names];
}

function extractCteNames(sql) {
  const names = new Set();
  const text = stripComments(sql);
  if (!/^\s*with\b/i.test(text)) return names;
  const body = text.replace(/^\s*with\s+(recursive\s+)?/i, "");
  const matcher = /(?:^|,)\s*"?([a-zA-Z_][\w]*)"?\s+as\s*\(/gi;
  let match;
  while ((match = matcher.exec(body))) {
    names.add(String(match[1]).toLowerCase());
  }
  return names;
}

function assertSafeSelect(sql) {
  const raw = String(sql || "").trim();
  if (!raw) {
    throw new AiMcpError("A SELECT query is required.", 400, "invalid_sql");
  }
  if (raw.length > 8000) {
    throw new AiMcpError("The query is too long.", 400, "invalid_sql");
  }
  const stripped = stripComments(raw);
  if (stripped.includes(";")) {
    throw new AiMcpError("Multiple SQL statements are not allowed.", 403, "read_only");
  }
  if (!/^\s*(select|with)\b/i.test(stripped)) {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  const tokens = tokenize(stripped).map((token) => token.toLowerCase());
  tokens.forEach((token) => {
    if (FORBIDDEN.includes(token)) {
      throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
    }
  });
  const lower = stripped.toLowerCase();
  FORBIDDEN_FUNCS.forEach((fn) => {
    if (lower.includes(`${fn}(`)) {
      throw new AiMcpError("That function is not allowed.", 403, "read_only");
    }
  });
  if (/\binto\s+(temp|temporary|table|outfile|dumpfile)\b/i.test(stripped)) {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(stripped)) {
    throw new AiMcpError("Locking clauses are not allowed.", 403, "read_only");
  }
  assertParsedSelect(stripped);
  const cteNames = extractCteNames(stripped);
  extractTables(stripped).forEach((name) => {
    const plain = name.includes(".") ? name.split(".").pop() : name;
    if (name.includes(".")) {
      throw new AiMcpError("That table is not available.", 403, "unauthorized_table");
    }
    if (plain.startsWith("pg_") || plain === "information_schema") {
      throw new AiMcpError("That table is not available.", 403, "unauthorized_table");
    }
    if (!TABLE_BY_NAME.has(plain) && !cteNames.has(plain)) {
      throw new AiMcpError("That table is not available.", 403, "unauthorized_table");
    }
  });
  return stripped.replace(/;+\s*$/, "").trim();
}

function wrapAuthorizedSelect(sql, scope, maxRows) {
  const tenantid = Number(scope.tenantid);
  const branchid = Number(scope.branchid);
  const userid = Number(scope.userid);
  if (![tenantid, branchid, userid].every((value) => Number.isInteger(value) && value > 0)) {
    throw new AiMcpError("Authenticated tenant, branch, and user are required.", 403, "scope_required");
  }
  const safe = assertSafeSelect(sql);
  const ctes = authorizedWithSql({
    tenantid,
    branchid,
    userid,
    manageBranch: Boolean(scope.manageBranch)
  });
  const inner = /^with\b/i.test(safe)
    ? `WITH ${ctes},\n${safe.replace(/^with\s+/i, "")}`
    : `WITH ${ctes}\n${safe}`;
  const limit = Math.min(Math.max(Number(maxRows) || 50, 1), 200);
  return `SELECT * FROM (\n${inner}\n) AS __cms_q LIMIT ${limit}`;
}

module.exports = {
  stripComments,
  extractTables,
  assertSafeSelect,
  wrapAuthorizedSelect
};
