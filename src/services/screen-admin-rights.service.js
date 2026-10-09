const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");
const { resolveAttachedScreenRights } = require("../config/default-organization-policies");

const SCREEN_RIGHTS_SELECT = {
  screenid: true,
  screenname: true,
  controllername: true,
  screengroup: true
};

function buildOrganizationScreenRightsRow({
  screen,
  policy,
  tenantid,
  createdby,
  createdat
}) {
  return {
    screenid: screen.screenid,
    policyid: policy.recno,
    tenantid,
    branchid: null,
    ...resolveAttachedScreenRights(policy, screen),
    createdby,
    createdat
  };
}

/**
 * Attach a new screen to every policy (default admin, role templates, custom).
 * One organization-level userrights row per policy (branchid null).
 * Rights follow that policy's relative screens. Custom policies stay attached with rights off.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} screenid
 * @param {{ userid?: number|string }} auth
 */
async function assignNewScreenToAllPolicies(tx, screenid, auth) {
  const screen = await tx.screens.findFirst({
    where: { screenid: Number(screenid) },
    select: SCREEN_RIGHTS_SELECT
  });
  if (!screen) {
    return;
  }

  const policies = await tx.policies.findMany({
    select: { recno: true, tenantid: true, isdefaultpolicy: true, description: true }
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

    rowsToInsert.push(
      buildOrganizationScreenRightsRow({
        screen,
        policy,
        tenantid: policy.tenantid,
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
 * When a new policy is created for a tenant, attach every accessible screen once.
 * Rights belong to the organization, not to a branch.
 * Known roles enable only their relative screens. Custom policies attach every screen with rights off.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ recno: number, tenantid: number|null, isdefaultpolicy?: boolean|null, description?: string|null }} policy
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
    select: SCREEN_RIGHTS_SELECT,
    orderBy: { screenid: "asc" }
  });
  if (!screens.length) {
    return;
  }

  const now = utcNow();
  const createdby = auth?.userid != null ? Number(auth.userid) : null;

  const rowsToInsert = screens.map((screen) =>
    buildOrganizationScreenRightsRow({
      screen,
      policy,
      tenantid,
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
