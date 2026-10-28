const { z } = require("zod");
const logger = require("../utils/logger");
const { AiMcpError } = require("./errors");
const { sanitizeArgs, resolveAccess } = require("./scope");
const { inspectSchema } = require("./schema-catalog");
const { runAuthorizedSelect } = require("./execute-select");

const TOOLS = Object.freeze([
  {
    name: "inspect_schema",
    description: "List authorized tables and columns for the signed-in tenant and branch. Use this before writing SQL.",
    zod: {},
    parameters: { type: "object", additionalProperties: false, properties: {} },
    run: async (scope) => inspectSchema(scope)
  },
  {
    name: "run_select",
    description: "Run one read-only SELECT against authorized tables. The server applies tenant, branch, and assignee restrictions. Do not put tenantid, branchid, or userid in the SQL. Return only SELECT/WITH queries.",
    zod: {
      sql: z.string().min(1).max(8000)
    },
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "A single PostgreSQL SELECT or WITH query." }
      }
    },
    run: (scope, args, db, options) => runAuthorizedSelect(db, args.sql, scope, options)
  }
]);

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function databaseFor(deps) {
  if (deps.db) return deps.db;
  if (process.env.AI_MCP_V2_DATABASE_URL) {
    const { PrismaClient } = require("@prisma/client");
    if (!databaseFor.client) {
      databaseFor.client = new PrismaClient({
        datasources: { db: { url: process.env.AI_MCP_V2_DATABASE_URL } }
      });
    }
    return databaseFor.client;
  }
  return require("../database/prisma");
}

async function executeTool(name, args, auth, deps = {}) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    throw new AiMcpError("That tool is not available.", 404, "unknown_tool");
  }
  const scope = await resolveAccess(auth, deps);
  const clean = name === "run_select" ? { sql: String(args?.sql || "") } : sanitizeArgs(args);
  const options = {
    now: deps.now || new Date(),
    queryTimeoutMs: deps.queryTimeoutMs || 8000,
    maxRows: deps.maxRows || 50
  };
  try {
    return await tool.run(scope, clean, databaseFor(deps), options);
  } catch (err) {
    if (err instanceof AiMcpError) throw err;
    logger.error("ai-mcp-v2.query_failed", { tool: name, code: err.code || "query_failed" });
    throw new AiMcpError("The query failed, so no total is available.", 500, "query_failed");
  }
}

module.exports = {
  TOOLS,
  executeTool,
  databaseFor
};
