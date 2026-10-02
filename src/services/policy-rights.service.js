const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeRightFlags(item = {}) {
  return {
    viewscreen: item.viewscreen === true || item.view === true,
    addscreen: item.addscreen === true || item.add === true,
    updatescreen: item.updatescreen === true || item.update === true,
    deletescreen: item.deletescreen === true || item.delete === true,
    others: item.others === true
  };
}

function extractRightsArray(body = {}) {
  const rights = body.userRights ?? body.userrights ?? body.rights;
  if (!Array.isArray(rights)) {
    return null;
  }
  return rights;
}

function rightIsOn(value) {
  return value === true;
}

/**
 * One screen per policy. Older rows were copied once per branch; collapse those
 * into a single organization-level entry. A flag stays on if any copy had it on.
 */
function collapsePolicyUserRights(rows) {
  const byScreen = new Map();

  for (const row of rows || []) {
    if (row.screenid == null) {
      continue;
    }

    const prev = byScreen.get(row.screenid);
    if (!prev) {
      byScreen.set(row.screenid, { ...row });
      continue;
    }

    const preferIncoming = prev.branchid != null && row.branchid == null;
    const base = preferIncoming ? row : prev;
    const other = preferIncoming ? prev : row;

    byScreen.set(row.screenid, {
      ...base,
      viewscreen: rightIsOn(base.viewscreen) || rightIsOn(other.viewscreen),
      addscreen: rightIsOn(base.addscreen) || rightIsOn(other.addscreen),
      updatescreen: rightIsOn(base.updatescreen) || rightIsOn(other.updatescreen),
      deletescreen: rightIsOn(base.deletescreen) || rightIsOn(other.deletescreen),
      others: rightIsOn(base.others) || rightIsOn(other.others)
    });
  }

  return [...byScreen.values()]
    .map((row) => ({ ...row, branchid: null, branches: null }))
    .sort((a, b) => a.screenid - b.screenid);
}

async function saveOrganizationScreenRights(tx, {
  policyRecno,
  tenantid,
  screenid,
  flags,
  userid,
  now
}) {
  const existing = await tx.userrights.findMany({
    where: {
      policyid: policyRecno,
      tenantid,
      screenid
    },
    orderBy: { recno: "asc" }
  });

  if (!existing.length) {
    await syncPostgresSequence(tx, "userrights", "recno");
    await tx.userrights.create({
      data: {
        policyid: policyRecno,
        tenantid,
        branchid: null,
        screenid,
        ...flags,
        createdby: userid,
        createdat: now,
        lastupdatedby: userid,
        updatedat: now
      }
    });
    return;
  }

  const keeper = existing.find((row) => row.branchid == null) || existing[0];
  await tx.userrights.update({
    where: { recno: keeper.recno },
    data: {
      ...flags,
      branchid: null,
      lastupdatedby: userid,
      updatedat: now
    }
  });

  const extraIds = existing
    .filter((row) => row.recno !== keeper.recno)
    .map((row) => row.recno);
  if (extraIds.length) {
    await tx.userrights.deleteMany({
      where: { recno: { in: extraIds } }
    });
  }
}

/**
 * Bulk-update organization-level userrights for a policy (by recno or screenid).
 */
async function updatePolicyRights(policyId, auth, body) {
  const policyRecno = Number(policyId);
  const tenantid = Number(auth.tenantid);
  const rights = extractRightsArray(body);

  if (!rights?.length) {
    throw clientError("userRights must be a non-empty array");
  }

  const policy = await prisma.policies.findFirst({
    where: { recno: policyRecno, tenantid },
    select: { recno: true, isdefaultpolicy: true }
  });

  if (!policy) {
    throw clientError("Policy not found", 404);
  }

  if (policy.isdefaultpolicy === true) {
    throw clientError("Default admin policy rights cannot be changed", 403);
  }

  const now = utcNow();
  const userid = Number(auth.userid);

  const pending = new Map();

  for (const item of rights) {
    const flags = normalizeRightFlags(item);
    const recno = item.recno != null ? Number(item.recno) : null;
    let screenid = item.screenid != null ? Number(item.screenid) : null;

    if (recno && Number.isFinite(recno)) {
      const existing = await prisma.userrights.findFirst({
        where: { recno, policyid: policyRecno, tenantid },
        select: { screenid: true }
      });
      if (!existing?.screenid) {
        throw clientError(`userRights row recno ${recno} not found for this policy`, 404);
      }
      screenid = existing.screenid;
    }

    if (!screenid || !Number.isFinite(screenid)) {
      throw clientError("Each userRights item needs recno or screenid");
    }

    pending.set(screenid, flags);
  }

  await prisma.$transaction(async (tx) => {
    for (const [screenid, flags] of pending) {
      await saveOrganizationScreenRights(tx, {
        policyRecno,
        tenantid,
        screenid,
        flags,
        userid,
        now
      });
    }
  });

  return { policyid: policyRecno, updated: rights.length };
}

module.exports = {
  normalizeRightFlags,
  extractRightsArray,
  collapsePolicyUserRights,
  updatePolicyRights
};
