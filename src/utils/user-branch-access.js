const prisma = require("../database/prisma");
const { ensureOrganizationMembership } = require("./user-organization");

/** Legacy rows often have isblocked = null; treat as active unless explicitly true. */
function activeMembershipWhere(extra = {}) {
  return {
    ...extra,
    OR: [{ isblocked: false }, { isblocked: null }]
  };
}

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
 * branchids: [1, 2] | branchIds (alias) | branches: [{ branchid: 1 }] | branchid (legacy)
 */
function parseBranchIdsFromInput(input = {}, fallbackBranchId) {
  if (Array.isArray(input.branchids) && input.branchids.length) {
    return uniquePositiveIntegers(input.branchids);
  }
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
    throw clientError("At least one branch is required (branchids or branchid)");
  }
  const rows = await prisma.branches.findMany({
    where: {
      tenantid: Number(tenantid),
      branchid: { in: branchIds }
    },
    select: { branchid: true, name: true }
  });
  if (rows.length !== branchIds.length) {
    throw clientError("One or more branchids are invalid for this organization");
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
    throw clientError("At least one branch is required (branchids or branchid)");
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

/**
 * Old users may only have userpolicies or createdtenantid without userorganizations rows.
 * Creates missing memberships from policies or the org's first branch.
 */
/**
 * Create userorganizations rows for any tenant+branch that has userpolicies but no membership row.
 */
async function syncMissingBranchMembershipsFromPolicies(userid) {
  const uid = Number(userid);
  if (!Number.isFinite(uid) || uid <= 0) {
    return { synced: 0 };
  }

  const policyRows = await prisma.userpolicies.findMany({
    where: {
      userid: uid,
      tenantid: { not: null },
      branchid: { not: null }
    },
    select: { tenantid: true, branchid: true, createdby: true }
  });
  if (!policyRows.length) {
    return { synced: 0 };
  }

  const existingRows = await prisma.userorganizations.findMany({
    where: {
      userid: uid,
      branchid: { not: null }
    },
    select: { tenantid: true, branchid: true }
  });
  const existingKeys = new Set(
    existingRows.map((row) => `${row.tenantid}:${row.branchid}`)
  );

  const toCreate = [];
  const seen = new Set();
  for (const row of policyRows) {
    const key = `${row.tenantid}:${row.branchid}`;
    if (seen.has(key) || existingKeys.has(key)) {
      continue;
    }
    seen.add(key);
    toCreate.push(row);
  }

  if (!toCreate.length) {
    return { synced: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const row of toCreate) {
      await ensureOrganizationMembership(tx, {
        userid: uid,
        tenantid: row.tenantid,
        branchid: row.branchid,
        createdby: row.createdby ?? uid
      });
    }
  });

  return { synced: toCreate.length };
}

async function repairLegacyUserBranchAccess(userid) {
  const uid = Number(userid);
  if (!Number.isFinite(uid) || uid <= 0) {
    return { repaired: false, reason: "invalid_userid" };
  }

  const partialSync = await syncMissingBranchMembershipsFromPolicies(uid);
  if (partialSync.synced > 0) {
    return { repaired: true, source: "userpolicies_partial", branches: partialSync.synced };
  }

  const existing = await prisma.userorganizations.findFirst({
    where: activeMembershipWhere({ userid: uid, branchid: { not: null } })
  });
  if (existing) {
    return { repaired: false, reason: "already_has_membership" };
  }

  const policyRows = await prisma.userpolicies.findMany({
    where: {
      userid: uid,
      tenantid: { not: null },
      branchid: { not: null }
    },
    select: { tenantid: true, branchid: true, createdby: true }
  });

  const pairs = new Map();
  policyRows.forEach((row) => {
    const key = `${row.tenantid}:${row.branchid}`;
    if (!pairs.has(key)) {
      pairs.set(key, row);
    }
  });

  if (pairs.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const row of pairs.values()) {
        await ensureOrganizationMembership(tx, {
          userid: uid,
          tenantid: row.tenantid,
          branchid: row.branchid,
          createdby: row.createdby ?? uid
        });
      }
    });
    return { repaired: true, source: "userpolicies", branches: pairs.size };
  }

  const user = await prisma.users.findUnique({
    where: { userid: uid },
    select: { createdtenantid: true, createdby: true }
  });
  const tenantid = user?.createdtenantid;
  if (!tenantid) {
    return { repaired: false, reason: "no_policies_or_tenant" };
  }

  const branch = await prisma.branches.findFirst({
    where: { tenantid: Number(tenantid) },
    orderBy: { branchid: "asc" },
    select: { branchid: true }
  });
  if (!branch?.branchid) {
    return { repaired: false, reason: "no_branch_in_tenant" };
  }

  await prisma.$transaction(async (tx) => {
    await ensureOrganizationMembership(tx, {
      userid: uid,
      tenantid: Number(tenantid),
      branchid: Number(branch.branchid),
      createdby: user.createdby ?? uid
    });
  });

  return {
    repaired: true,
    source: "createdtenantid_default_branch",
    branchid: branch.branchid
  };
}

async function loadUserBranchIds(userid, tenantid) {
  const rows = await prisma.userorganizations.findMany({
    where: activeMembershipWhere({
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: { not: null }
    }),
    select: { branchid: true },
    orderBy: { branchid: "asc" }
  });
  return rows.map((row) => Number(row.branchid)).filter((id) => id > 0);
}

function mapAccessibleBranchRow(row) {
  return {
    branchid: Number(row.branchid),
    name: row.name ?? null,
    branchname: row.name ?? null,
    isactive: row.isactive ?? null
  };
}

/**
 * organizations[].branches = only branches the user may access (membership), with names from branches table.
 * branchids = same IDs for the JWT tenant (flat list for switcher).
 */
async function enrichOrganizationsWithAccessibleBranches(contexts, sessionTenantid, userid) {
  const list = Array.isArray(contexts) ? [...contexts] : [];
  const uid = Number(userid);
  const sessionTid = Number(sessionTenantid);

  const enriched = [];
  for (const org of list) {
    const tid = Number(org.tenantid);
    if (!Number.isFinite(tid)) {
      enriched.push(org);
      continue;
    }

    const assignedIds = await loadUserBranchIds(uid, tid);
    const rows = assignedIds.length
      ? await prisma.branches.findMany({
          where: { tenantid: tid, branchid: { in: assignedIds } },
          orderBy: { branchid: "asc" }
        })
      : [];

    enriched.push({
      ...org,
      branches: rows.map(mapAccessibleBranchRow)
    });
  }

  const sessionBranchids = sessionTid ? await loadUserBranchIds(uid, sessionTid) : [];

  return {
    contexts: enriched,
    branchids: sessionBranchids
  };
}

module.exports = {
  parseBranchIdsFromInput,
  assertBranchesBelongToTenant,
  syncUserBranchAccess,
  loadUserBranchIds,
  activeMembershipWhere,
  repairLegacyUserBranchAccess,
  syncMissingBranchMembershipsFromPolicies,
  enrichOrganizationsWithAccessibleBranches
};
