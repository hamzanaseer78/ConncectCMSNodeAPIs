const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");

/**
 * For each default ("main") admin policy, grants full userrights on `screenid`
 * for every branch under that policy's tenant — mirrors org-wide admin coverage
 * when new screens are introduced after tenants already exist.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} screenid
 * @param {{ userid?: number|string }} auth
 */
async function assignNewScreenToDefaultAdminPolicies(tx, screenid, auth) {
  const adminPolicies = await tx.policies.findMany({
    where: { isdefaultpolicy: true },
    select: { recno: true, tenantid: true }
  });

  if (!adminPolicies.length) {
    return;
  }

  const now = utcNow();
  const createdby = auth?.userid != null ? Number(auth.userid) : null;

  const rowsToInsert = [];

  for (const policy of adminPolicies) {
    if (policy.tenantid == null) {
      continue;
    }

    const branches = await tx.branches.findMany({
      where: { tenantid: policy.tenantid },
      select: { branchid: true }
    });

    for (const b of branches) {
      if (b.branchid == null) {
        continue;
      }

      rowsToInsert.push({
        screenid,
        policyid: policy.recno,
        tenantid: policy.tenantid,
        branchid: b.branchid,
        viewscreen: true,
        addscreen: true,
        updatescreen: true,
        deletescreen: true,
        others: true,
        createdby,
        createdat: now
      });
    }
  }

  if (!rowsToInsert.length) {
    return;
  }

  const policyIds = [...new Set(adminPolicies.map((p) => p.recno))];

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

  const fullAccess = policy.isdefaultpolicy === true;
  const now = utcNow();
  const createdby = auth?.userid != null ? Number(auth.userid) : null;

  const rowsToInsert = [];
  for (const screen of screens) {
    for (const branch of branches) {
      if (branch.branchid == null) {
        continue;
      }
      rowsToInsert.push({
        screenid: screen.screenid,
        policyid: policy.recno,
        tenantid,
        branchid: branch.branchid,
        viewscreen: fullAccess,
        addscreen: fullAccess,
        updatescreen: fullAccess,
        deletescreen: fullAccess,
        others: fullAccess,
        createdby,
        createdat: now
      });
    }
  }

  if (!rowsToInsert.length) {
    return;
  }

  await syncPostgresSequence(tx, "userrights", "recno");
  await tx.userrights.createMany({ data: rowsToInsert });
}

module.exports = {
  assignNewScreenToDefaultAdminPolicies,
  assignAllScreensToNewPolicy
};
