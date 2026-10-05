const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");

function isDefaultAdminPolicy(policy) {
  return policy?.isdefaultpolicy === true;
}

function buildScreenRightsRow({
  screenid,
  policy,
  branchid,
  fullAccess,
  createdby,
  createdat
}) {
  return {
    screenid,
    policyid: policy.recno,
    tenantid: policy.tenantid,
    branchid,
    viewscreen: fullAccess,
    addscreen: fullAccess,
    updatescreen: fullAccess,
    deletescreen: fullAccess,
    others: fullAccess,
    createdby,
    createdat
  };
}

/**
 * Attach a new screen to every policy (default admin, role templates, custom).
 * Default admin policies get full rights; all others get the screen with rights disabled.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} screenid
 * @param {{ userid?: number|string }} auth
 */
async function assignNewScreenToAllPolicies(tx, screenid, auth) {
  const policies = await tx.policies.findMany({
    select: { recno: true, tenantid: true, isdefaultpolicy: true }
  });

  if (!policies.length) {
    return;
  }

  const now = utcNow();
  const createdby = auth?.userid != null ? Number(auth.userid) : null;
  const rowsToInsert = [];

  for (const policy of policies) {
    if (policy.tenantid == null) {
      continue;
    }

    const fullAccess = isDefaultAdminPolicy(policy);
    const branches = await tx.branches.findMany({
      where: { tenantid: policy.tenantid },
      select: { branchid: true }
    });

    for (const b of branches) {
      if (b.branchid == null) {
        continue;
      }

      rowsToInsert.push(
        buildScreenRightsRow({
          screenid,
          policy,
          branchid: b.branchid,
          fullAccess,
          createdby,
          createdat: now
        })
      );
    }
  }

  if (!rowsToInsert.length) {
    return;
  }

  const policyIds = [...new Set(policies.map((p) => p.recno))];

  const existing = await tx.userrights.findMany({
    where: {
      screenid,
      policyid: { in: policyIds }
    },
    select: {
      policyid: true,
      tenantid: true,
      branchid: true
    }
  });

  const existingSet = new Set(
    existing.map((r) => `${r.policyid}-${r.tenantid}-${r.branchid}`)
  );

  const deduped = rowsToInsert.filter(
    (r) => !existingSet.has(`${r.policyid}-${r.tenantid}-${r.branchid}`)
  );

  if (deduped.length) {
    await syncPostgresSequence(tx, "userrights", "recno");
    await tx.userrights.createMany({ data: deduped });
  }
}

/** @deprecated Use assignNewScreenToAllPolicies */
async function assignNewScreenToDefaultAdminPolicies(tx, screenid, auth) {
  return assignNewScreenToAllPolicies(tx, screenid, auth);
}

/**
 * When a new policy is created for a tenant, grant every accessible screen on each
 * branch under that tenant. Non-admin policies start with all actions disabled.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ recno: number, tenantid: number|null, isdefaultpolicy?: boolean|null }} policy
 * @param {{ userid?: number|string }} auth
 */
async function assignAllScreensToNewPolicy(tx, policy, auth) {
  const tenantid = policy.tenantid;
  if (tenantid == null) {
    return;
  }

  const branches = await tx.branches.findMany({
    where: { tenantid },
    select: { branchid: true }
  });
  if (!branches.length) {
    return;
  }

  const screens = await tx.screens.findMany({
    where: {
      OR: [{ accessible: true }, { accessible: null }]
    },
    select: { screenid: true },
    orderBy: { screenid: "asc" }
  });
  if (!screens.length) {
    return;
  }

  const fullAccess = isDefaultAdminPolicy(policy);
  const now = utcNow();
  const createdby = auth?.userid != null ? Number(auth.userid) : null;

  const rowsToInsert = [];
  for (const screen of screens) {
    for (const branch of branches) {
      if (branch.branchid == null) {
        continue;
      }
      rowsToInsert.push(
        buildScreenRightsRow({
          screenid: screen.screenid,
          policy,
          branchid: branch.branchid,
          fullAccess,
          createdby,
          createdat: now
        })
      );
    }
  }

  if (!rowsToInsert.length) {
    return;
  }

  await syncPostgresSequence(tx, "userrights", "recno");
  await tx.userrights.createMany({ data: rowsToInsert });
}

module.exports = {
  assignNewScreenToAllPolicies,
  assignNewScreenToDefaultAdminPolicies,
  assignAllScreensToNewPolicy
};
