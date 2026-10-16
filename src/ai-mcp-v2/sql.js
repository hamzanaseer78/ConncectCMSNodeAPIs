const { AiMcpError } = require("./errors");

function statementText(statement) {
  if (Array.isArray(statement?.strings)) return statement.strings.join(" ");
  return String(statement?.sql || statement?.text || "");
}

function assertReadOnly(statement) {
  const text = statementText(statement);
  if (!/^\s*(select|with)\b/i.test(text)) {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|execute|call|do)\b/i.test(text)) {
    throw new AiMcpError("Only read queries are allowed.", 403, "read_only");
  }
  if (text.includes(";")) {
    throw new AiMcpError("Multiple SQL statements are not allowed.", 403, "read_only");
  }
  return text;
}

function money(value) {
  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    value = value.toNumber();
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

async function runReadQuery(db, statement, timeoutMs) {
  assertReadOnly(statement);
  if (!db || typeof db.$queryRaw !== "function") {
    throw new AiMcpError("Database access is not available.", 500, "query_failed");
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AiMcpError("The database query timed out.", 504, "query_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([db.$queryRaw(statement), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  statementText,
  assertReadOnly,
  money,
  whole,
  runReadQuery
};
