const { getJobsListService } = require("../../mcp/helpers/jobs-service");
const { canManageBranchJobs } = require("../utils/job-access");

const AI_TOOLS = Object.freeze([
  {
    name: "list_jobs",
    description:
      "List individual jobs. Do not use this to answer how many jobs. mode all = the Jobs List for the branch, my = only jobs assigned to the signed-in user, team = a manager's technicians.",
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
      "Job counts that match the Jobs List cards. Use this for how many / pending / total. pendingJobs = newJobs + assignedJobs. mode all matches the branch Jobs List. mode my is only jobs assigned to the signed-in user.",
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

async function resolveMode(auth, requested) {
  if (requested === "my" || requested === "all" || requested === "team") {
    return requested;
  }
  if (await canManageBranchJobs(auth)) {
    return "all";
  }
  return "my";
}

function countByKey(stats, key) {
  const item = (stats.statsKpis || []).find((row) => row.key === key);
  return Number(item?.count) || 0;
}

async function executeAiTool(auth, name, args = {}) {
  const mode = await resolveMode(auth, args.mode);
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
      jobs: (result.data || []).map(slimJob),
      note: "pagination.total is the full count. jobs is only the first page."
    };
  }

  if (name === "job_stats_kpis") {
    const stats = await service.statsKpis(auth, {});
    const newJobs = countByKey(stats, "newJobs");
    const assignedJobs = countByKey(stats, "assignedJobs");
    return {
      mode: stats.mode,
      totalJobs: stats.totalJobs,
      pendingJobs: newJobs + assignedJobs,
      newJobs,
      assignedJobs,
      resolvedJobs: countByKey(stats, "resolvedJobs"),
      completedJobs: countByKey(stats, "completedJobs"),
      cancelledJobs: countByKey(stats, "cancelledJobs"),
      followUpJobs: countByKey(stats, "followUpJobs"),
      note: "These match the Jobs List cards. pendingJobs = newJobs + assignedJobs."
    };
  }

  const err = new Error(`Unknown tool ${name}`);
  err.status = 400;
  throw err;
}

module.exports = {
  AI_TOOLS,
  executeAiTool
};
