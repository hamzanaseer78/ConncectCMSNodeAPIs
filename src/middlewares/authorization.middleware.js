const resources = require("../config/resources");
const prisma = require("../database/prisma");

const rightFields = {
  view: "viewscreen",
  add: "addscreen",
  update: "updatescreen",
  delete: "deletescreen"
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * CHECK IF USER IS DEFAULT ADMIN (AUTO POLICY USER)
 */
async function isDefaultAdmin(auth) {
  const adminPolicy = await prisma.policies.findFirst({
    where: {
      tenantid: Number(auth.tenantid),
      isdefaultpolicy: true,
    }
  });

  if (!adminPolicy) return false;

  const assignment = await prisma.userpolicies.findFirst({
    where: {
      userid: Number(auth.userid),
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid),
      policyid: adminPolicy.recno
    }
  });

  return Boolean(assignment);
}

/**
 * FIND SCREEN (OPTIMIZED)
 */
async function findScreen(resourceName) {
  const config = resources[resourceName] || {};
  const names = [resourceName, ...(config.screenNames || [])].map(normalize);

  return await prisma.screens.findFirst({
    where: {
      accessible: true,
      OR: [
        {
          screenname: {
            in: names,
            mode: "insensitive"
          }
        },
        {
          controllername: {
            in: names,
            mode: "insensitive"
          }
        }
      ]
    }
  });
}

/**
 * MAIN RIGHTS CHECK
 */
async function hasRight(auth, resourceName, action) {
  const isAdmin = await isDefaultAdmin(auth);
  const rightField = rightFields[action];

  // ❌ Invalid action
  if (!rightField) return false;

  // 🔍 Find screen
  const screen = await findScreen(resourceName);

  // ❌ If screen not found → block for ALL (including admin)
  if (!screen) return false;

  // 🔍 Get user policies
  const policyAssignments = await prisma.userpolicies.findMany({
    where: {
      userid: Number(auth.userid),
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    },
    select: {
      policyid: true
    }
  });

  const policyIds = policyAssignments
    .map(x => x.policyid)
    .filter(x => x !== null && x !== undefined);

  if (!policyIds.length) return false;

  // 🔍 Get rights
  const rights = await prisma.userrights.findMany({
    where: {
      tenantid: Number(auth.tenantid),
      screenid: screen.screenid,
      policyid: { in: policyIds },
      OR: [
        { branchid: Number(auth.branchid) },
        { branchid: null }
      ]
    }
  });

  /**
   * ✅ ADMIN LOGIC (AUTO INSERT RIGHTS)
   */
  if (isAdmin) {
    if (!rights.length) {
      const insertData = policyIds.map((policyid) => ({
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid),
        policyid,
        screenid: screen.screenid,
        viewscreen: true,
        addscreen: true,
        updatescreen: true,
        deletescreen: true,
        createdby: Number(auth.userid),
        createdat: new Date()
      }));

      await prisma.userrights.createMany({
        data: insertData,
        skipDuplicates: true
      });

      return true;
    }

    // Even if partial rights exist → allow admin
    return true;
  }

  /**
   * 👤 NORMAL USER CHECK
   */
  return rights.some(r => r[rightField] === true);
}

/**
 * EXPRESS MIDDLEWARE
 */
function authorizeResourceAction(resourceName, action) {
  return async (req, res, next) => {
    try {
      if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
        return res.status(401).json({
          message: "JWT must include userid, tenantid and branchid"
        });
      }

      const allowed = await hasRight(req.auth, resourceName, action);

      if (!allowed) {
        return res.status(403).json({
          message: `Not authorized to ${action} ${resourceName}`
        });
      }

      return next();
    } catch (err) {
      console.error("Authorization Error:", err);

      return res.status(err.status || 500).json({
        message: err.message || "Internal Server Error"
      });
    }
  };
}

module.exports = {
  authorizeResourceAction,
  hasRight
};