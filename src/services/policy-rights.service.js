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

/**
 * Bulk-update userrights rows for a policy (by recno or screenid+branchid).
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

  await prisma.$transaction(async (tx) => {
    for (const item of rights) {
      const flags = normalizeRightFlags(item);
      const recno = item.recno != null ? Number(item.recno) : null;
      const screenid = item.screenid != null ? Number(item.screenid) : null;
      const branchid =
        item.branchid != null ? Number(item.branchid) : Number(auth.branchid);

      if (recno && Number.isFinite(recno)) {
        const existing = await tx.userrights.findFirst({
          where: { recno, policyid: policyRecno, tenantid }
        });
        if (!existing) {
          throw clientError(`userRights row recno ${recno} not found for this policy`, 404);
        }
        await tx.userrights.update({
          where: { recno },
          data: {
            ...flags,
            lastupdatedby: userid,
            updatedat: now
          }
        });
        continue;
      }

      if (!screenid || !Number.isFinite(screenid)) {
        throw clientError("Each userRights item needs recno or screenid");
      }
      if (!branchid || !Number.isFinite(branchid)) {
        throw clientError("Each userRights item needs branchid when recno is omitted");
      }

      const branch = await tx.branches.findFirst({
        where: { branchid, tenantid },
        select: { branchid: true }
      });
      if (!branch) {
        throw clientError(`branchid ${branchid} is not valid for this organization`, 400);
      }

      const existing = await tx.userrights.findFirst({
        where: {
          policyid: policyRecno,
          tenantid,
          branchid,
          screenid
        }
      });

      if (existing) {
        await tx.userrights.update({
          where: { recno: existing.recno },
          data: {
            ...flags,
            lastupdatedby: userid,
            updatedat: now
          }
        });
      } else {
        await syncPostgresSequence(tx, "userrights", "recno");
        await tx.userrights.create({
          data: {
            policyid: policyRecno,
            tenantid,
            branchid,
            screenid,
            ...flags,
            createdby: userid,
            createdat: now,
            lastupdatedby: userid,
            updatedat: now
          }
        });
      }
    }
  });

  return { policyid: policyRecno, updated: rights.length };
}

module.exports = {
  normalizeRightFlags,
  extractRightsArray,
  updatePolicyRights
};
