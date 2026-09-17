const prisma = require("../database/prisma");

async function isJobAdmin(auth) {
  const adminPolicy = await prisma.policies.findFirst({
    where: {
      tenantid: Number(auth.tenantid),
      isdefaultpolicy: true
    },
    select: { recno: true }
  });
  if (!adminPolicy) return false;

  const assignment = await prisma.userpolicies.findFirst({
    where: {
      userid: Number(auth.userid),
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid),
      policyid: adminPolicy.recno
    }
  });
  return Boolean(assignment);
}

async function loadAuthUserType(userid) {
  const user = await prisma.users.findUnique({
    where: { userid: Number(userid) },
    select: { usertype: true, isactive: true, isdeleted: true }
  });
  return user;
}

async function isManager(auth) {
  const user = await loadAuthUserType(auth?.userid);
  return (
    user &&
    user.isactive !== false &&
    user.isdeleted !== true &&
    user.usertype === "manager"
  );
}

async function isDistributor(auth) {
  const user = await loadAuthUserType(auth?.userid);
  return (
    user &&
    user.isactive !== false &&
    user.isdeleted !== true &&
    user.usertype === "distributor"
  );
}

/** Admins and managers can list, create, update, and assign any branch job. */
async function canManageBranchJobs(auth) {
  return (await isJobAdmin(auth)) || (await isManager(auth));
}

async function assertManager(auth) {
  if (!(await isManager(auth))) {
    const err = new Error("This endpoint is only available for managers");
    err.status = 403;
    throw err;
  }
}

/**
 * Jobs owned by a manager: sub-categories where defaultuser is the manager.
 */
async function buildManagerJobScope(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);
  const managerId = Number(auth.userid);

  const subcategories = await prisma.jobsubcategories.findMany({
    where: {
      tenantid,
      branchid,
      defaultuser: managerId
    },
    select: { subcategoryid: true }
  });

  const faultIds = subcategories.map((row) => row.subcategoryid);
  const scope = { tenantid, branchid };

  if (!faultIds.length) {
    scope.faultid = { in: [-1] };
  } else {
    scope.faultid = { in: faultIds };
  }

  return scope;
}

async function loadDistributorCreatorIds(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);

  const memberships = await prisma.userorganizations.findMany({
    where: {
      tenantid,
      branchid,
      isblocked: false
    },
    select: { userid: true }
  });

  const memberIds = memberships.map((row) => row.userid).filter((id) => id != null);
  if (!memberIds.length) {
    return [];
  }

  const distributors = await prisma.users.findMany({
    where: {
      userid: { in: memberIds },
      usertype: "distributor",
      isdeleted: { not: true },
      isactive: { not: false }
    },
    select: { userid: true }
  });

  return distributors.map((row) => Number(row.userid));
}

/**
 * Distributors only see jobs whose initial jobdetails row was created by a distributor user.
 */
async function applyDistributorJobScope(auth, where = {}) {
  const creatorIds = await loadDistributorCreatorIds(auth);
  where.jobdetails = {
    some: {
      createdby: creatorIds.length ? { in: creatorIds } : { in: [-1] }
    }
  };
  return where;
}

/**
 * Technicians may only access jobs assigned to them; admins and managers see all branch jobs.
 */
async function applyTechnicianJobScope(auth, where = {}) {
  if (!(await canManageBranchJobs(auth))) {
    where.assignedto = Number(auth.userid);
  }
  return where;
}

/**
 * Apply role-based job visibility for lists and single-job access.
 */
async function applyJobAccessScope(auth, where = {}) {
  if (await isDistributor(auth)) {
    return applyDistributorJobScope(auth, where);
  }
  return applyTechnicianJobScope(auth, where);
}

async function ensureAssignedTechnicianOrAdmin(auth, job) {
  if (await canManageBranchJobs(auth)) {
    return;
  }
  if (await isDistributor(auth)) {
    const creatorIds = await loadDistributorCreatorIds(auth);
    const detail = await prisma.jobdetails.findFirst({
      where: {
        jobid: Number(job?.recno),
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid),
        createdby: creatorIds.length ? { in: creatorIds } : { in: [-1] }
      },
      select: { recno: true }
    });
    if (detail) {
      return;
    }
    const err = new Error("Distributors can only access jobs created by distributor users");
    err.status = 403;
    throw err;
  }
  if (job?.assignedto && Number(job.assignedto) === Number(auth.userid)) {
    return;
  }
  const err = new Error(
    "Only the assigned technician, a manager, or an admin can perform this action"
  );
  err.status = 403;
  throw err;
}

module.exports = {
  isJobAdmin,
  isManager,
  isDistributor,
  canManageBranchJobs,
  assertManager,
  buildManagerJobScope,
  loadAuthUserType,
  loadDistributorCreatorIds,
  applyDistributorJobScope,
  applyTechnicianJobScope,
  applyJobAccessScope,
  ensureAssignedTechnicianOrAdmin
};
