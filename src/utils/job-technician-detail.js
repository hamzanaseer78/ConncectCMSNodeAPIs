function toIsoDateTime(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toIsoDateOnly(value) {
  const iso = toIsoDateTime(value);
  if (!iso) return null;
  return iso.slice(0, 10);
}

function pickUserName(user) {
  return user?.name ?? null;
}

/**
 * Latest assignment = newest jobassignmentlog row (assignedat desc).
 * Closed = admin acknowledge/close (acknowledgedat), else technician completion (completedat).
 */
function buildTechnicianJobDetail(job = {}, detail = null, assignmentLogs = []) {
  const latest =
    Array.isArray(assignmentLogs) && assignmentLogs.length ? assignmentLogs[0] : null;

  const latestAssignedAtRaw = latest?.assignedat ?? detail?.assignedat ?? null;
  const latestAssignedById = latest?.assignedby ?? detail?.assignedby ?? null;
  const latestAssignedByName =
    pickUserName(latest?.users_jobassignmentlog_assignedbyTousers) ?? null;

  let closedAtRaw = null;
  if (detail?.acknowledgedat) {
    closedAtRaw = detail.acknowledgedat;
  } else if (job?.iscompleted === true && detail?.completedat) {
    closedAtRaw = detail.completedat;
  }

  return {
    latestAssignedById,
    latestAssignedByName,
    latestAssignedDate: toIsoDateOnly(latestAssignedAtRaw),
    latestAssignedAt: toIsoDateTime(latestAssignedAtRaw),
    closedAt: toIsoDateTime(closedAtRaw)
  };
}

module.exports = {
  buildTechnicianJobDetail,
  toIsoDateTime,
  toIsoDateOnly
};
