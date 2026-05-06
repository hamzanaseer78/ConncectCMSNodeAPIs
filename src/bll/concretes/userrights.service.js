const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");

class UserRightsService {

  /**
   * MAIN CHECK FUNCTION
   */
 async checkRights(auth, path, method) {
  const rights = await this.getUserRights(
    auth.userid,
    auth.tenantid,
    auth.branchid,
    path
  );

  // ❌ SCREEN NOT FOUND OR NO RIGHTS = ALWAYS FORBIDDEN
  if (!rights) return false;

  // 🔥 ADMIN ALREADY SAFE HERE (NO EXTRA CHECKS ANYWHERE ELSE)
  if (rights.isAdmin) return true;

  const actionMap = {
    GET: "view",
    POST: "add",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete"
  };

  const action = actionMap[method?.toUpperCase()] || "other";

  return this.hasRight(rights, action);
}

  /**
   * GET USER RIGHTS
   */
 async getUserRights(userId, tenantId, branchId, screenControllerName) {
  try {

    // 🔥 STEP 1: SCREEN MUST EXIST (MANDATORY SECURITY CHECK)
    const screen = await prisma.screens.findFirst({
      where: { controllername: screenControllerName }
    });

    if (!screen) {
      return null; // ❌ NO SCREEN = ALWAYS FORBIDDEN
    }

    const userPolicy = await prisma.userpolicies.findFirst({
      where: {
        userid: userId,
        tenantid: tenantId,
        branchid: branchId
      }
    });

    if (!userPolicy) return null;

    const policy = await prisma.policies.findUnique({
      where: { recno: userPolicy.policyid }
    });

    // 🔥 STEP 2: ADMIN POLICY (ONLY AFTER SCREEN VALIDATION)
    if (policy?.isdefaultpolicy === true) {
      return {
        screenid: screen.screenid,
        viewscreen: true,
        addscreen: true,
        updatescreen: true,
        deletescreen: true,
        others: true,
        isAdmin: true
      };
    }

    // 🔥 STEP 3: NORMAL USERS
    const rights = await prisma.userrights.findFirst({
      where: {
        screenid: screen.screenid,
        policyid: userPolicy.policyid,
        tenantid: tenantId,
        branchid: branchId
      }
    });

    return rights || null;

  } catch (error) {
    console.error("[UserRights] error:", error);
    return null;
  }
}

  /**
   * MAP ACTIONS
   */
  hasRight(rights, action) {
    if (!rights) return false;

    const map = {
      view: "viewscreen",
      add: "addscreen",
      update: "updatescreen",
      delete: "deletescreen",
      other: "others"
    };

    const field = map[action];
    return field ? rights[field] === true : false;
  }

}

module.exports = UserRightsService;