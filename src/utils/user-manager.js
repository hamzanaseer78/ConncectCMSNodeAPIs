const prisma = require("../database/prisma");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function resolveManagerIdFromInput(input = {}) {
  if (input.managerId !== undefined) return input.managerId;
  if (input.managerid !== undefined) return input.managerid;
  if (input.manager !== undefined) return input.manager;
  return undefined;
}

function parseOptionalUserId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw clientError("managerId must be a positive integer or null");
  }
  return Math.trunc(id);
}

async function assertValidManagerAssignment({
  tenantid,
  technicianUserId,
  managerId
}) {
  if (managerId == null) {
    return null;
  }

  if (technicianUserId != null && Number(managerId) === Number(technicianUserId)) {
    throw clientError("A technician cannot be their own manager");
  }

  const membership = await prisma.userorganizations.findFirst({
    where: {
      userid: Number(managerId),
      tenantid: Number(tenantid)
    }
  });
  if (!membership) {
    throw clientError("Manager user not found in this organization", 404);
  }

  const manager = await prisma.users.findUnique({
    where: { userid: Number(managerId) },
    select: { userid: true, name: true, usertype: true, isactive: true, isdeleted: true }
  });

  if (!manager || manager.isdeleted === true || manager.isactive === false) {
    throw clientError("Manager user not found or inactive", 404);
  }

  if (manager.usertype === "technician") {
    throw clientError("Manager must be an admin or manager user, not a technician");
  }

  return Number(manager.userid);
}

/**
 * Build users.managerid from API body for technician users.
 */
async function applyManagerFields(input = {}, usertype, options = {}) {
  const { mode = "create", tenantid, technicianUserId } = options;
  const isTechnician = usertype === "technician";
  const managerRaw = resolveManagerIdFromInput(input);
  const hasManagerInput = managerRaw !== undefined;

  if (!isTechnician) {
    const usertypeExplicit =
      input.usertype !== undefined ||
      input.userType !== undefined ||
      input.type !== undefined;
    if (usertypeExplicit || hasManagerInput) {
      return { managerid: null };
    }
    return {};
  }

  if (!hasManagerInput && mode === "create") {
    return { managerid: null };
  }

  if (!hasManagerInput) {
    return {};
  }

  const managerId = parseOptionalUserId(managerRaw);
  const resolvedManagerId = await assertValidManagerAssignment({
    tenantid,
    technicianUserId,
    managerId
  });

  return { managerid: resolvedManagerId };
}

function formatManagerFields(user, managerLookup = null) {
  const managerId = user?.managerid ?? null;
  const managerFromLookup =
    managerId != null && managerLookup instanceof Map
      ? managerLookup.get(Number(managerId))
      : user?.users_users_manageridTousers ?? null;

  return {
    managerId,
    managerName: managerFromLookup?.name ?? null,
    managerUserType: managerFromLookup?.usertype ?? null
  };
}

async function loadManagerNameLookup(managerIds = []) {
  const ids = [...new Set(managerIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) {
    return new Map();
  }

  const rows = await prisma.users.findMany({
    where: { userid: { in: ids } },
    select: { userid: true, name: true, usertype: true }
  });

  return new Map(rows.map((row) => [Number(row.userid), row]));
}

async function loadTeamMemberIds(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);
  const managerId = Number(auth.userid);

  const orgUserIds = await prisma.userorganizations.findMany({
    where: { tenantid, branchid },
    select: { userid: true }
  });
  const branchUserIds = orgUserIds.map((row) => row.userid).filter(Boolean);
  if (!branchUserIds.length) {
    return [];
  }

  const technicians = await prisma.users.findMany({
    where: {
      userid: { in: branchUserIds },
      managerid: managerId,
      usertype: "technician",
      isdeleted: { not: true },
      isactive: { not: false }
    },
    select: { userid: true },
    orderBy: { userid: "asc" }
  });

  return technicians.map((row) => Number(row.userid));
}

async function loadTeamMembers(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);
  const managerId = Number(auth.userid);
  const memberIds = await loadTeamMemberIds(auth);

  if (!memberIds.length) {
    return [];
  }

  return prisma.users.findMany({
    where: { userid: { in: memberIds } },
    select: {
      userid: true,
      name: true,
      email: true,
      usertype: true,
      technicianaffiliation: true,
      companyname: true,
      isactive: true
    },
    orderBy: { name: "asc" }
  });
}

module.exports = {
  resolveManagerIdFromInput,
  applyManagerFields,
  formatManagerFields,
  loadManagerNameLookup,
  loadTeamMemberIds,
  loadTeamMembers,
  assertValidManagerAssignment
};
