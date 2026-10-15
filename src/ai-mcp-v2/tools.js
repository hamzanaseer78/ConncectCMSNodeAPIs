const { z } = require("zod");
const logger = require("../utils/logger");
const { AiMcpError } = require("./errors");
const { sanitizeArgs, resolveAccess } = require("./scope");
const { PERIODS } = require("./range");
const queries = require("./queries");

const periodShape = {
  period: z.enum(PERIODS).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
};

const periodProperties = {
  period: { type: "string", enum: [...PERIODS] },
  from: { type: "string", description: "Inclusive start date YYYY-MM-DD for period=custom" },
  to: { type: "string", description: "Inclusive end date YYYY-MM-DD for period=custom" }
};

const TOOLS = Object.freeze([
  {
    name: "monthly_financial_summary",
    description: "Amount to collect, cash collected, and expenses for the authenticated branch in any period (this_year, previous_year, custom from/to, all_time, months, weeks). Amount to collect is job cost, not money received, and the figures are not profit.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.monthlyFinancialSummary
  },
  {
    name: "total_amount_to_collect",
    description: "Sum of job.totalcost for jobs dated in the period, including yearly and custom ranges. This is amount to collect, not cash collected.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.totalAmountToCollect
  },
  {
    name: "total_expenses",
    description: "Sum of jobexpenses.amount whose createdat falls in the period for the authenticated branch. Supports yearly and custom ranges.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.totalExpenses
  },
  {
    name: "collection_summary",
    description: "Sum of jobcollections.amount whose collectedat falls in the period. This is cash collected. Supports yearly and custom ranges.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.collectionSummary
  },
  {
    name: "branch_report",
    description: "Job count, amount to collect, cash collected, and expenses for the authenticated branch only, for any supported period.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.branchReport
  },
  {
    name: "attendance_summary",
    description: "Open attendance session counts for the authenticated branch. No open session is not an absence.",
    zod: {},
    parameters: { type: "object", additionalProperties: false, properties: {} },
    run: (scope, _args, db, options) => queries.attendanceSummary(scope, db, options)
  },
  {
    name: "search_jobs",
    description: "List authorized jobs for this token. Filter by period (this_year, all_time, custom from/to, and others), customer or job-code search, and status title. Returns totalMatched plus a page; use offset when hasMore is true. Never invent jobs outside the result.",
    zod: {
      ...periodShape,
      search: z.string().max(80).optional(),
      status: z.string().max(80).optional(),
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().min(0).max(1000000).optional()
    },
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...periodProperties,
        search: { type: "string", maxLength: 80 },
        status: { type: "string", maxLength: 80, description: "Status title fragment, for example completed" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      }
    },
    run: queries.searchJobs
  },
  {
    name: "job_status_counts",
    description: "Count authorized jobs grouped by status title for the period, including yearly and all_time.",
    zod: periodShape,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: periodProperties
    },
    run: queries.jobStatusCounts
  },
  {
    name: "job_details",
    description: "One job in the authenticated branch, including its cost, cash collected, and expenses. Missing or out-of-scope jobs are not returned.",
    zod: {
      jobId: z.number().int().positive()
    },
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["jobId"],
      properties: {
        jobId: { type: "integer", minimum: 1 }
      }
    },
    run: queries.jobDetails
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
  const clean = sanitizeArgs(args);
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
  executeTool
};
