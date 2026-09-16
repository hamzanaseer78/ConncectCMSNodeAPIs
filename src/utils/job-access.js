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

/**
 * Technicians may only access jobs assigned to them; admins and managers see all branch jobs.
 */
async function applyTechnicianJobScope(auth, where = {}) {
  if (!(await canManageBranchJobs(auth))) {
    where.assignedto = Number(auth.userid);
  }
  return where;
}

async function ensureAssignedTechnicianOrAdmin(auth, job) {
  if (await canManageBranchJobs(auth)) {
    return;
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
  canManageBranchJobs,
  assertManager,
  buildManagerJobScope,
  loadAuthUserType,
  applyTechnicianJobScope,
  ensureAssignedTechnicianOrAdmin
};
