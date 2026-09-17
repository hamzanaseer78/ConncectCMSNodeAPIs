const { isCancelledStatusTitle, isCompletedStatusTitle } = require("./job-assignment-status");
const { utcNow } = require("./date");

const JOB_STATS_KPI_KEYS = Object.freeze([
  "newJobs",
  "assignedJobs",
  "followUpJobs",
  "completedJobs",
  "cancelledJobs"
]);

const JOB_STATS_KPI_LABELS = Object.freeze({
  newJobs: "New Jobs",
  assignedJobs: "Assigned Jobs",
  followUpJobs: "Follow-up Jobs",
  completedJobs: "Completed Jobs",
  cancelledJobs: "Cancelled"
});

function buildJobStatusKpiContext(statusRows = []) {
  const statuses = Array.isArray(statusRows) ? statusRows : [];

  const completedStatusIds = statuses
    .filter((row) => row.iscompletedstatus === true || isCompletedStatusTitle(row.title))
    .map((row) => Number(row.recno));

  const cancelledStatusIds = statuses
    .filter((row) => isCancelledStatusTitle(row.title))
    .map((row) => Number(row.recno));

  return {
    completedStatusIds,
    cancelledStatusIds
  };
}

function buildStatusExclusionClauses(context, excludeCompleted = true, excludeCancelled = true) {
  const clauses = [];
  const completedIds = (context.completedStatusIds || []).filter(Number.isFinite);
  const cancelledIds = (context.cancelledStatusIds || []).filter(Number.isFinite);

  if (excludeCompleted && completedIds.length) {
    clauses.push({ OR: [{ statusid: null }, { statusid: { notIn: completedIds } }] });
  }

  if (excludeCancelled && cancelledIds.length) {
    clauses.push({ OR: [{ statusid: null }, { statusid: { notIn: cancelledIds } }] });
  }

  return clauses;
}

function buildNotCompletedWhere() {
  // Prisma/SQL: `{ not: true }` does not match NULL — many legacy jobs have iscompleted NULL.
  return {
    OR: [{ iscompleted: false }, { iscompleted: null }]
  };
}

function buildActiveJobWhere(context) {
  const exclusions = buildStatusExclusionClauses(context, true, true);
  const where = buildNotCompletedWhere();

  if (exclusions.length) {
    return {
      AND: [where, ...exclusions]
    };
  }

  return where;
}

function buildNewJobsWhere(context) {
  return {
    ...buildActiveJobWhere(context),
    assignedto: null
  };
}

function buildAssignedJobsWhere(context) {
  return {
    ...buildActiveJobWhere(context),
    assignedto: { not: null },
    followupby: null
  };
}

function buildFollowUpJobsWhere(context) {
  return {
    ...buildActiveJobWhere(context),
    followupby: { not: null }
  };
}

function buildCompletedJobsWhere(context) {
  const completedIds = (context.completedStatusIds || []).filter(Number.isFinite);
  const clauses = [{ iscompleted: true }];
  if (completedIds.length) {
    clauses.push({ statusid: { in: completedIds } });
  }
  return { OR: clauses };
}

function buildCancelledJobsWhere(context) {
  const cancelledIds = (context.cancelledStatusIds || []).filter(Number.isFinite);
  if (!cancelledIds.length) {
    return { statusid: { in: [-1] } };
  }
  return { statusid: { in: cancelledIds } };
}

function buildJobKpiWhere(kpiKey, context) {
  switch (String(kpiKey || "").trim()) {
    case "newJobs":
      return buildNewJobsWhere(context);
    case "assignedJobs":
      return buildAssignedJobsWhere(context);
    case "followUpJobs":
      return buildFollowUpJobsWhere(context);
    case "completedJobs":
      return buildCompletedJobsWhere(context);
    case "cancelledJobs":
      return buildCancelledJobsWhere(context);
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
  buildCancelledJobsWhere,
  buildCompletedJobsWhere,
  parseJobStatsKpiKey,
  mergeWhereClauses,
  formatStatsKpisResponse
};
