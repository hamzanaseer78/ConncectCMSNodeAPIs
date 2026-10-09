const { isCancelledStatusTitle, isCompletedStatusTitle } = require("./job-assignment-status");
const { utcNow } = require("./date");

/** Buckets that sum to `totalJobs` (follow-up is separate). */
const JOB_STATS_KPI_TOTAL_KEYS = Object.freeze([
  "newJobs",
  "assignedJobs",
  "resolvedJobs",
  "completedJobs",
  "cancelledJobs"
]);

const JOB_STATS_KPI_KEYS = Object.freeze([...JOB_STATS_KPI_TOTAL_KEYS, "followUpJobs"]);

const JOB_STATS_KPI_LABELS = Object.freeze({
  newJobs: "New Jobs",
  assignedJobs: "Assigned Jobs",
  resolvedJobs: "Resolved Jobs",
  followUpJobs: "Follow-up Jobs",
  completedJobs: "Completed Jobs",
  cancelledJobs: "Cancelled"
});

function buildJobStatusKpiContext(statusRows = []) {
  const statuses = Array.isArray(statusRows) ? statusRows : [];

  const cancelledStatusIds = statuses
    .filter((row) => row.iscancelledstatus === true || isCancelledStatusTitle(row.title))
    .map((row) => Number(row.recno))
    .filter(Number.isFinite);

  const cancelledSet = new Set(cancelledStatusIds);

  const completedStatusIds = statuses
    .filter(
      (row) =>
        (row.iscompletedstatus === true || isCompletedStatusTitle(row.title)) &&
        !cancelledSet.has(Number(row.recno))
    )
    .map((row) => Number(row.recno))
    .filter(Number.isFinite);

  const completedSet = new Set(completedStatusIds);

  const resolvedStatusIds = statuses
    .filter(
      (row) =>
        row.isresolvedstatus === true &&
        !cancelledSet.has(Number(row.recno)) &&
        !completedSet.has(Number(row.recno))
    )
    .map((row) => Number(row.recno))
    .filter(Number.isFinite);

  return {
    completedStatusIds,
    cancelledStatusIds,
    resolvedStatusIds
  };
}

function terminalStatusIds(context) {
  return [
    ...(context.cancelledStatusIds || []),
    ...(context.completedStatusIds || []),
    ...(context.resolvedStatusIds || [])
  ].filter(Number.isFinite);
}

function buildNotInTerminalStatusesWhere(context) {
  const ids = [...new Set(terminalStatusIds(context))];
  if (!ids.length) {
    return {};
  }
  return {
    OR: [{ statusid: null }, { statusid: { notIn: ids } }]
  };
}

function buildNotCompletedStatusWhere(context) {
  const ids = (context.completedStatusIds || []).filter(Number.isFinite);
  if (!ids.length) {
    return {};
  }
  return {
    OR: [{ statusid: null }, { statusid: { notIn: ids } }]
  };
}

function andClauses(...clauses) {
  const parts = clauses.filter(Boolean);
  if (!parts.length) {
    return {};
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return { AND: parts };
}

function buildStatusIdsWhere(ids) {
  const valid = (ids || []).filter(Number.isFinite);
  if (!valid.length) {
    return { statusid: { in: [-1] } };
  }
  return { statusid: { in: valid } };
}

function buildNewJobsWhere(context) {
  return andClauses(buildNotInTerminalStatusesWhere(context), { assignedto: null });
}

function buildAssignedJobsWhere(context) {
  return andClauses(buildNotInTerminalStatusesWhere(context), { assignedto: { not: null } });
}

function buildResolvedJobsWhere(context) {
  return buildStatusIdsWhere(context.resolvedStatusIds);
}

function buildFollowUpJobsWhere(context) {
  return andClauses(buildNotCompletedStatusWhere(context), { followupby: { not: null } });
}

function buildCompletedJobsWhere(context) {
  return buildStatusIdsWhere(context.completedStatusIds);
}

function buildCancelledJobsWhere(context) {
  return buildStatusIdsWhere(context.cancelledStatusIds);
}

function buildJobKpiWhere(kpiKey, context) {
  switch (String(kpiKey || "").trim()) {
    case "newJobs":
      return buildNewJobsWhere(context);
    case "assignedJobs":
      return buildAssignedJobsWhere(context);
    case "resolvedJobs":
      return buildResolvedJobsWhere(context);
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

function sumTotalJobKpiCounts(counts) {
  return JOB_STATS_KPI_TOTAL_KEYS.reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);
}

function formatStatsKpisResponse(mode, counts) {
  const statsKpis = JOB_STATS_KPI_KEYS.map((key) => ({
    key,
    label: JOB_STATS_KPI_LABELS[key],
    count: counts[key] ?? 0
  }));

  const totalFromBuckets = sumTotalJobKpiCounts(counts);
  const totalJobs =
    counts.totalJobs != null && Number.isFinite(Number(counts.totalJobs))
      ? Number(counts.totalJobs)
      : totalFromBuckets;

  return {
    mode,
    asOf: utcNow().toISOString(),
    statsKpis,
    totalJobs
  };
}

module.exports = {
  JOB_STATS_KPI_KEYS,
  JOB_STATS_KPI_TOTAL_KEYS,
  JOB_STATS_KPI_LABELS,
  buildJobStatusKpiContext,
  buildJobKpiWhere,
  buildNewJobsWhere,
  buildAssignedJobsWhere,
  buildResolvedJobsWhere,
  buildFollowUpJobsWhere,
  buildCancelledJobsWhere,
  buildCompletedJobsWhere,
  parseJobStatsKpiKey,
  mergeWhereClauses,
  sumTotalJobKpiCounts,
  formatStatsKpisResponse
};
