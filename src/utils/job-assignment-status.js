function normalizeStatusTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isUnassignedStatusTitle(title) {
  const normalized = normalizeStatusTitle(title);
  return normalized === "unassigned" || normalized === "unassign";
}

function isCompletedStatusTitle(title) {
  const normalized = normalizeStatusTitle(title);
  return normalized === "completed" || normalized === "complete";
}

async function findUnassignedJobStatus(tx, tenantid) {
  const rows = await tx.jobstatuses.findMany({
    where: { tenantid: Number(tenantid) },
    select: { recno: true, title: true },
    orderBy: [{ sort: "asc" }, { recno: "asc" }]
  });

  return rows.find((row) => isUnassignedStatusTitle(row.title)) || null;
}

async function findFirstJobStatus(tx, tenantid) {
  return tx.jobstatuses.findFirst({
    where: { tenantid: Number(tenantid), isfirststatus: true },
    orderBy: { recno: "asc" },
    select: { recno: true }
  });
}

async function findCompletedJobStatus(tx, tenantid) {
  const flagged = await tx.jobstatuses.findFirst({
    where: { tenantid: Number(tenantid), iscompletedstatus: true },
    orderBy: [{ sort: "asc" }, { recno: "asc" }],
    select: { recno: true, title: true }
  });
  if (flagged) {
    return flagged;
  }

  const rows = await tx.jobstatuses.findMany({
    where: { tenantid: Number(tenantid) },
    select: { recno: true, title: true },
    orderBy: [{ sort: "asc" }, { recno: "asc" }]
  });

  return rows.find((row) => isCompletedStatusTitle(row.title)) || null;
}

/**
 * Move job to the tenant's completed status and write a status log entry.
 */
async function applyCompletedJobStatus(tx, scope, job, auth, { changedAt, remarks } = {}) {
  const completed = await findCompletedJobStatus(tx, scope.tenantid);
  if (!completed) {
    return null;
  }

  const toStatus = completed.recno;
  const fromStatus = job.statusid ?? null;

  if (Number(fromStatus) === Number(toStatus)) {
    return null;
  }

  await tx.jobstatuslog.create({
    data: {
      jobid: Number(job.recno),
      ...scope,
      fromstatus: fromStatus,
      tostatus: Number(toStatus),
      remarks: remarks || "Job completed",
      changedby: Number(auth.userid),
      changedat: changedAt
    }
  });

  await tx.job.update({
    where: { recno: Number(job.recno) },
    data: { statusid: Number(toStatus) }
  });

  return { fromStatus, toStatus: Number(toStatus) };
}

/**
 * Pick status on job create: un-assigned when no technician, otherwise explicit/first status.
 */
async function resolveInitialJobStatusId(tx, tenantid, { assignedto, explicitStatusId } = {}) {
  const hasTechnician = assignedto != null && Number(assignedto) > 0;

  if (!hasTechnician) {
    const unassigned = await findUnassignedJobStatus(tx, tenantid);
    if (unassigned) {
      return unassigned.recno;
    }
  }

  if (explicitStatusId != null && explicitStatusId !== "") {
    return Number(explicitStatusId);
  }

  const firstStatus = await findFirstJobStatus(tx, tenantid);
  return firstStatus?.recno ?? null;
}

/**
 * Enforce: jobs without a technician use the Un-assigned status.
 */
async function syncJobStatusWithAssignment(tx, tenantid, jobId) {
  const job = await tx.job.findFirst({
    where: { recno: Number(jobId) },
    select: { assignedto: true, statusid: true }
  });

  if (!job || job.assignedto != null) {
    return job;
  }

  const unassigned = await findUnassignedJobStatus(tx, tenantid);
  if (!unassigned) {
    return job;
  }

  if (Number(job.statusid) === Number(unassigned.recno)) {
    return job;
  }

  await tx.job.update({
    where: { recno: Number(jobId) },
    data: { statusid: unassigned.recno }
  });

  return { ...job, statusid: unassigned.recno };
}

module.exports = {
  normalizeStatusTitle,
  isUnassignedStatusTitle,
  isCompletedStatusTitle,
  findUnassignedJobStatus,
  findCompletedJobStatus,
  resolveInitialJobStatusId,
  syncJobStatusWithAssignment,
  applyCompletedJobStatus
};
