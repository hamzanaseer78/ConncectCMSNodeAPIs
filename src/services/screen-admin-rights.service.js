const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");

function isDefaultAdminPolicy(policy) {
  return policy?.isdefaultpolicy === true;
}

function buildOrganizationScreenRightsRow({
  screenid,
  policy,
  tenantid,
  fullAccess,
  createdby,
  createdat
}) {
  return {
    screenid,
    policyid: policy.recno,
    tenantid,
    branchid: null,
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
 * One organization-level userrights row per policy (branchid null).
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
    rowsToInsert.push(
      buildOrganizationScreenRightsRow({
        screenid,
        policy,
        tenantid: policy.tenantid,
        fullAccess,
        createdby,
        createdat: now
      })
    );
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
      tenantid: true
    }
  });

  const existingSet = new Set(existing.map((r) => `${r.policyid}-${r.tenantid}`));

  const deduped = rowsToInsert.filter(
    (r) => !existingSet.has(`${r.policyid}-${r.tenantid}`)
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
 * When a new policy is created for a tenant, grant every accessible screen once.
 * Rights belong to the organization, not to a branch. Non-admin policies start
 * with all actions disabled.
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

  const rowsToInsert = screens.map((screen) =>
    buildOrganizationScreenRightsRow({
      screenid: screen.screenid,
      policy,
      tenantid,
      fullAccess,
      createdby,
      createdat: now
    })
  );

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
