const { getJobsListService } = require("../../mcp/helpers/jobs-service");

const AI_TOOLS = Object.freeze([
  {
    name: "list_jobs",
    description:
      "List jobs visible to the signed-in user. mode my = assigned to the user, all = branch jobs for admins/managers, team = a manager's technicians.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["my", "all", "team"] },
        search: { type: "string" },
        pageSize: { type: "integer" }
      }
    }
  },
  {
    name: "job_stats_kpis",
    description:
      "Job KPI counts: new, assigned, resolved, completed, cancelled, follow-up, and total.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["my", "all", "team"] }
      }
    }
  }
]);

function slimJob(row) {
  return {
    recno: row.recno ?? null,
    code: row.code ?? row.jobNo ?? null,
    status: row.statusName ?? row.status ?? null,
    customer: row.customerName ?? row.customername ?? null,
    assignedTo: row.assignedToName ?? row.assignedtoname ?? null
  };
}

async function executeAiTool(auth, name, args = {}) {
  const mode = ["my", "all", "team"].includes(args.mode) ? args.mode : "my";
  const service = getJobsListService(mode);

  if (name === "list_jobs") {
    const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 20);
    const result = await service.list(auth, {
      search: args.search,
      page: 1,
      pageSize
    });
    return {
      mode: result.mode,
      pagination: result.pagination,
      jobs: (result.data || []).map(slimJob)
    };
  }

  if (name === "job_stats_kpis") {
    return service.statsKpis(auth, {});
  }

  const err = new Error(`Unknown tool ${name}`);
  err.status = 400;
  throw err;
}

module.exports = {
  AI_TOOLS,
  executeAiTool
};
