const bcrypt = require("bcryptjs");
const prisma = require("../database/prisma");
const { utcNow } = require("./date");
const { normalizeUserEmail, assertUserEmailAvailable } = require("./user-email");
const { resolveUserTypeFromInput } = require("./user-type");
const { syncPostgresSequence } = require("./postgres-sequence");
const { applyTechnicianAffiliationFields } = require("./technician-affiliation");
const { applyManagerFields } = require("./user-manager");
const { generateRandomPassword } = require("./password");

function resolveOrganizationBranchScope(auth, query = {}) {
  const tenantid = Number(auth.tenantid);
  const allBranches = query.allBranches === true || query.allBranches === "true";
  const branchid = allBranches
    ? null
    : Number(query.branchid != null ? query.branchid : auth.branchid);

  return { tenantid, branchid, allBranches };
}

async function fetchOrganizationUserIds(tenantid, branchid = null) {
  const where = { tenantid: Number(tenantid) };
  if (branchid != null) {
    where.branchid = Number(branchid);
  }

  const rows = await prisma.userorganizations.findMany({
    where,
    select: { userid: true }
  });

  return [...new Set(rows.map((row) => row.userid).filter(Boolean))];
}

async function assertUserBelongsToOrganization(userid, tenantid) {
  const membership = await prisma.userorganizations.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid)
    }
  });

  if (!membership) {
    const err = new Error("User not found in this organization");
    err.status = 404;
    throw err;
  }

  return membership;
}

async function ensureOrganizationMembership(tx, { userid, tenantid, branchid, createdby }) {
  const now = utcNow();
  const existing = await tx.userorganizations.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid)
    }
  });

  if (existing) {
    return existing;
  }

  return tx.userorganizations.create({
    data: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      isblocked: false,
      createdby: Number(createdby),
      createdat: now
    }
  });
}

async function createOrganizationUser(data, auth) {
  if (!auth?.tenantid || !auth?.branchid || !auth?.userid) {
    const err = new Error("JWT must include userid, tenantid and branchid");
    err.status = 401;
    throw err;
  }

  const name = String(data?.name || "").trim();
  if (!name) {
    const err = new Error("Name required");
    err.status = 400;
    throw err;
  }

  const email = normalizeUserEmail(data.email);
  if (!email) {
    const err = new Error("Email required");
    err.status = 400;
    throw err;
  }

  const tenantid = Number(auth.tenantid);
  const branchid = Number(data.branchid != null ? data.branchid : auth.branchid);
  const usertype = resolveUserTypeFromInput(data, { defaultType: "technician" });
  const technicianFields = applyTechnicianAffiliationFields(data, usertype, { mode: "create" });
  const managerFields = await applyManagerFields(data, usertype, {
    mode: "create",
    tenantid
  });
  const now = utcNow();

  const plainPassword =
    data.password != null && String(data.password).trim() !== ""
      ? String(data.password)
      : generateRandomPassword(Number(process.env.ADMIN_USER_PASSWORD_LENGTH || 12));
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.$transaction(async (tx) => {
    await assertUserEmailAvailable(tx, email);
    await syncPostgresSequence(tx, "users", "userid");

    const created = await tx.users.create({
      data: {
        name,
        email,
        contactno: data.contactno != null ? String(data.contactno).trim() : null,
        usertype,
        ...technicianFields,
        ...managerFields,
        password: passwordHash,
        isactive: data.isactive !== false,
        isdeleted: false,
        createdtenantid: tenantid,
        createdby: Number(auth.userid),
        createdat: now
      }
    });

    await ensureOrganizationMembership(tx, {
      userid: created.userid,
      tenantid,
      branchid,
      createdby: auth.userid
    });

    return created;
  });

  const { password, signuptoken, resettoken, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  resolveOrganizationBranchScope,
  fetchOrganizationUserIds,
  assertUserBelongsToOrganization,
  ensureOrganizationMembership,
  createOrganizationUser
};
