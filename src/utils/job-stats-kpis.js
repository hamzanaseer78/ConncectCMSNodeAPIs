const { isUnassignedStatusTitle, normalizeStatusTitle } = require("./job-assignment-status");
const { utcNow } = require("./date");

const JOB_STATS_KPI_KEYS = Object.freeze([
  "newJobs",
  "followUpJobs",
  "assignedJobs",
  "unAssignedJobs",
  "completedJobs"
]);

const JOB_STATS_KPI_LABELS = Object.freeze({
  newJobs: "New Jobs",
  followUpJobs: "Follow-up Jobs (In-Progress)",
  assignedJobs: "Assigned Jobs",
  unAssignedJobs: "Un-Assigned Jobs",
  completedJobs: "Completed Jobs"
});

function isNewStatusTitle(title) {
  const normalized = normalizeStatusTitle(title);
  return normalized === "new" || normalized === "newjob" || normalized === "open";
}

function buildJobStatusKpiContext(statusRows = []) {
  const statuses = Array.isArray(statusRows) ? statusRows : [];

  const firstStatus =
    statuses.find((row) => row.isfirststatus === true) ||
    statuses.find((row) => isNewStatusTitle(row.title)) ||
    null;

  const unassignedStatus = statuses.find((row) => isUnassignedStatusTitle(row.title)) || null;

  const completedStatusIds = statuses
    .filter((row) => row.iscompletedstatus === true)
    .map((row) => Number(row.recno));

  const firstStatusId = firstStatus ? Number(firstStatus.recno) : null;
  const unassignedStatusId = unassignedStatus ? Number(unassignedStatus.recno) : null;

  return {
    firstStatusId,
    unassignedStatusId,
    completedStatusIds
  };
}

function excludeCompletedStatuses(where, context) {
  const completedIds = (context.completedStatusIds || []).filter(Number.isFinite);
  if (!completedIds.length) {
    return where;
  }

  return {
    ...where,
    AND: [
      ...(where.AND || []),
      {
        OR: [{ statusid: null }, { statusid: { notIn: completedIds } }]
      }
    ]
  };
}

function buildOpenJobWhere(context) {
  const where = { iscompleted: { not: true } };
  return excludeCompletedStatuses(where, context);
}

function buildCompletedJobsWhere(context) {
  const completedIds = (context.completedStatusIds || []).filter(Number.isFinite);
  const clauses = [{ iscompleted: true }];
  if (completedIds.length) {
    clauses.push({ statusid: { in: completedIds } });
  }
  return { OR: clauses };
}

function buildUnAssignedJobsWhere(context) {
  const where = buildOpenJobWhere(context);
  const clauses = [{ assignedto: null }];
  if (context.unassignedStatusId != null) {
    clauses.push({ statusid: context.unassignedStatusId });
  }
  return {
    ...where,
    OR: clauses
  };
}

function buildAssignedJobsWhere(context) {
  const where = {
    ...buildOpenJobWhere(context),
    assignedto: { not: null }
  };

  if (context.unassignedStatusId != null) {
    where.statusid = { not: context.unassignedStatusId };
  }

  return where;
}

function buildNewJobsWhere(context) {
  const where = buildAssignedJobsWhere(context);

  if (context.firstStatusId != null) {
    where.statusid = context.firstStatusId;
  }

  return where;
}

function buildFollowUpJobsWhere(context) {
  const excluded = [
    context.firstStatusId,
    context.unassignedStatusId,
    ...(context.completedStatusIds || [])
  ].filter((id) => id != null);

  const where = buildAssignedJobsWhere(context);

  if (excluded.length) {
    where.AND = [...(where.AND || []), { OR: [{ statusid: null }, { statusid: { notIn: excluded } }] }];
  }

  return where;
}

function buildJobKpiWhere(kpiKey, context) {
  switch (String(kpiKey || "").trim()) {
    case "newJobs":
      return buildNewJobsWhere(context);
    case "followUpJobs":
      return buildFollowUpJobsWhere(context);
    case "assignedJobs":
      return buildAssignedJobsWhere(context);
    case "unAssignedJobs":
      return buildUnAssignedJobsWhere(context);
    case "completedJobs":
      return buildCompletedJobsWhere(context);
    default:
      return null;
  }
}

function parseJobStatsKpiKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  if (!JOB_STATS_KPI_KEYS.includes(key)) {
    const err = new Error(`kpi must be one of: ${JOB_STATS_KPI_KEYS.join(", ")}`);
    err.status = 400;
    throw err;
  }
  return key;
}

function mergeWhereClauses(baseWhere, extraWhere) {
  if (!extraWhere) return baseWhere;
  return {
    AND: [baseWhere, extraWhere]
  };
}

function formatStatsKpisResponse(mode, counts) {
  const statsKpis = JOB_STATS_KPI_KEYS.map((key) => ({
    key,
    label: JOB_STATS_KPI_LABELS[key],
    count: counts[key] ?? 0
  }));

  return {
    mode,
    asOf: utcNow().toISOString(),
    statsKpis,
    totalJobs: counts.totalJobs ?? 0
  };
}

module.exports = {
  JOB_STATS_KPI_KEYS,
  JOB_STATS_KPI_LABELS,
  buildJobStatusKpiContext,
  buildJobKpiWhere,
  buildNewJobsWhere,
  buildFollowUpJobsWhere,
  buildAssignedJobsWhere,
  buildUnAssignedJobsWhere,
  buildCompletedJobsWhere,
  parseJobStatsKpiKey,
  mergeWhereClauses,
  formatStatsKpisResponse
};
