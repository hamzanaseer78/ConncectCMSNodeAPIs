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

async function isDefaultAdmin(auth) {
  const adminPolicy = await prisma.policies.findFirst({
    where: {
      tenantid: Number(auth.tenantid),
      isdefaultpolicy: true,
    }
  });

  if (!adminPolicy) {
    return false;
  }

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

async function findScreen(resourceName) {
  const config = resources[resourceName];
  const names = new Set([resourceName, ...(config.screenNames || [])].map(normalize));
  const screens = await prisma.screens.findMany({
    where: {
      accessible: true
    }
  });

  return screens.find((screen) => (
    names.has(normalize(screen.screenname)) ||
    names.has(normalize(screen.controllername))
  ));
}

async function hasRight(auth, resourceName, action) {
  if (await isDefaultAdmin(auth)) {
    return true;
  }

  const rightField = rightFields[action];
  const screen = await findScreen(resourceName);

  if (!screen || !rightField) {
    return false;
  }

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
    .map((assignment) => assignment.policyid)
    .filter((policyid) => policyid !== null && policyid !== undefined);

  if (!policyIds.length) {
    return false;
  }

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

  return rights.some((right) => right[rightField] === true);
}

function authorizeResourceAction(resourceName, action) {
  return async (req, res, next) => {
    try {
      if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
        return res.status(401).json({ error: "JWT must include userid, tenantid and branchid" });
      }

      if (await hasRight(req.auth, resourceName, action)) {
        return next();
      }

      return res.status(403).json({ error: `Not authorized to ${action} ${resourceName}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

module.exports = {
  authorizeResourceAction,
  hasRight
};
