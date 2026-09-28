const prisma = require("../database/prisma");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function uniquePositiveIntegers(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * branchIds: [1, 2] | branches: [{ branchid: 1 }] | branchid: single (legacy)
 */
function parseBranchIdsFromInput(input = {}, fallbackBranchId) {
  if (Array.isArray(input.branchIds) && input.branchIds.length) {
    return uniquePositiveIntegers(input.branchIds);
  }
  if (Array.isArray(input.branches) && input.branches.length) {
    return uniquePositiveIntegers(
      input.branches.map((row) => row?.branchid ?? row?.branchId ?? row?.id)
    );
  }
  if (input.branchid != null && input.branchid !== "") {
    return uniquePositiveIntegers([input.branchid]);
  }
  if (input.branchId != null && input.branchId !== "") {
    return uniquePositiveIntegers([input.branchId]);
  }
  if (fallbackBranchId != null) {
    return uniquePositiveIntegers([fallbackBranchId]);
  }
  return [];
}

async function assertBranchesBelongToTenant(tenantid, branchIds) {
  if (!branchIds.length) {
    throw clientError("At least one branch is required (branchIds or branchid)");
  }
  const rows = await prisma.branches.findMany({
    where: {
      tenantid: Number(tenantid),
      branchid: { in: branchIds }
    },
    select: { branchid: true, name: true }
  });
  if (rows.length !== branchIds.length) {
    throw clientError("One or more branchIds are invalid for this organization");
  }
  return rows;
}

async function ensureUserPolicyOnBranch(tx, {
  userid,
  tenantid,
  branchid,
  policyid,
  createdby,
  now
}) {
  const existing = await tx.userpolicies.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      policyid: Number(policyid)
    }
  });
  if (existing) {
    return existing;
  }
  return tx.userpolicies.create({
    data: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      policyid: Number(policyid),
      createdby: Number(createdby),
      createdat: now
    }
  });
}

/**
 * Create/update org memberships + policies for the given branches; remove access to other branches in the tenant.
 */
async function syncUserBranchAccess(tx, options) {
  const {
    userid,
    tenantid,
    branchIds,
    createdby,
    now,
    resolvePolicyIdForBranch,
    beforeRemoveBranch
  } = options;

  const targetIds = uniquePositiveIntegers(branchIds);
  if (!targetIds.length) {
    throw clientError("At least one branch is required (branchIds or branchid)");
  }

  const existing = await tx.userorganizations.findMany({
    where: { userid: Number(userid), tenantid: Number(tenantid) },
    select: { recno: true, branchid: true }
  });

  for (const branchid of targetIds) {
    const policyid = await resolvePolicyIdForBranch(branchid);
    const membership = await tx.userorganizations.findFirst({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid)
      }
    });
    if (!membership) {
      await tx.userorganizations.create({
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

    const policiesOnBranch = await tx.userpolicies.findMany({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid)
      },
      select: { recno: true, policyid: true }
    });
    const hasTarget = policiesOnBranch.some((row) => row.policyid === policyid);
    if (!hasTarget) {
      if (policiesOnBranch.length) {
        await tx.userpolicies.deleteMany({
          where: {
            userid: Number(userid),
            tenantid: Number(tenantid),
            branchid: Number(branchid)
          }
        });
      }
      await ensureUserPolicyOnBranch(tx, {
        userid,
        tenantid,
        branchid,
        policyid,
        createdby,
        now
      });
    }
  }

  for (const row of existing) {
    if (row.branchid == null || targetIds.includes(Number(row.branchid))) {
      continue;
    }
    if (typeof beforeRemoveBranch === "function") {
      await beforeRemoveBranch(Number(row.branchid));
    }
    await tx.userpolicies.deleteMany({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(row.branchid)
      }
    });
    await tx.userorganizations.delete({ where: { recno: row.recno } });
  }

  return targetIds;
}

async function loadUserBranchIds(userid, tenantid) {
  const rows = await prisma.userorganizations.findMany({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      isblocked: false,
      branchid: { not: null }
    },
    select: { branchid: true },
    orderBy: { branchid: "asc" }
  });
  return rows.map((row) => Number(row.branchid)).filter((id) => id > 0);
}

module.exports = {
  parseBranchIdsFromInput,
  assertBranchesBelongToTenant,
  syncUserBranchAccess,
  loadUserBranchIds
};
