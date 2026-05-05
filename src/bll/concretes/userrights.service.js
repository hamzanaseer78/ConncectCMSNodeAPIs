const prisma = require("../../database/prisma");

const { utcNow } = require("../../utils/date");

class UserRightsService {
  /**
   * Get user rights for a specific resource/screen in their current context
   */
  async getUserRights(userId, tenantId, branchId, screenControllerName) {
    try {
      const screen = await prisma.screens.findFirst({
        where: {
          controllername: screenControllerName
        }
      });

      if (!screen) {
        return null;
      }

      // Get user's policy for this branch/tenant
      const userPolicy = await prisma.userpolicies.findFirst({
        where: {
          userid: userId,
          tenantid: tenantId,
          branchid: branchId
        },
        include: {
          policies: true
        }
      });

      if (!userPolicy) {
        return null;
      }

      // Check if it's admin or default policy - if so, grant all rights
      const policy = await prisma.policies.findUnique({
        where: { recno: userPolicy.policyid }
      });

      if (policy?.isdefaultpolicy === true) {
        return {
          screenid: screen.screenid,
          policyid: userPolicy.policyid,
          viewscreen: true,
          addscreen: true,
          updatescreen: true,
          deletescreen: true,
          others: true
        };
      }

      // Get specific rights for this screen
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
      console.error("[UserRights] Error fetching rights:", error);
      return null;
    }
  }

  /**
   * Auto-assign rights for new screen to admin and default policies
   */
  async autoAssignScreenRights(screenId, screenControllerName, tenantId) {
    try {
      // Find all default policies in tenant
      const defaultPolicies = await prisma.policies.findMany({
        where: {
          tenantid: tenantId,
          isdefaultpolicy: true
        }
      });

      const now = utcNow();
      const systemUserId = 1; // System user

      // For each default policy and all branches, create rights
      for (const policy of defaultPolicies) {
        const branches = await prisma.branches.findMany({
          where: { tenantid: tenantId }
        });

        for (const branch of branches) {
          // Check if rights already exist
          const existingRights = await prisma.userrights.findFirst({
            where: {
              screenid: screenId,
              policyid: policy.recno,
              branchid: branch.branchid,
              tenantid: tenantId
            }
          });

          if (!existingRights) {
            await prisma.userrights.create({
              data: {
                screenid: screenId,
                policyid: policy.recno,
                tenantid: tenantId,
                branchid: branch.branchid,
                viewscreen: true,
                addscreen: true,
                updatescreen: true,
                deletescreen: true,
                others: true,
                createdby: systemUserId,
                createdat: now
              }
            });
          }
        }
      }

      console.log(`[UserRights] Auto-assigned rights for screen: ${screenControllerName}`);
    } catch (error) {
      console.error("[UserRights] Error auto-assigning rights:", error);
    }
  }

  /**
   * Check if user has specific right for an action
   */
  hasRight(rights, action) {
    if (!rights) return false;

    const actionMap = {
      view: "viewscreen",
      add: "addscreen",
      update: "updatescreen",
      delete: "deletescreen",
      other: "others"
    };

    const field = actionMap[action];
    return field && rights[field] === true;
  }

  /**
   * Get all screens for a resource
   */
  async getResourceScreens() {
    return prisma.screens.findMany({
      orderBy: { screenid: "asc" }
    });
  }

  /**
   * Sync screens from resources config to database
   */
  async syncScreensFromResources(resources) {
    try {
      const now = utcNow();
      const systemUserId = 1;

      for (const [resourceName, config] of Object.entries(resources)) {
        if (config.backendOnly) continue;

        // Check if screen already exists
        let screen = await prisma.screens.findFirst({
          where: { controllername: resourceName }
        });

        if (!screen) {
          screen = await prisma.screens.create({
            data: {
              screenname: config.screenNames?.[0] || resourceName,
              screengroup: config.tag || resourceName,
              controllername: resourceName,
              isvisible: true,
              accessible: true,
              createdby: systemUserId,
              createdat: now
            }
          });

          console.log(`[UserRights] Created screen: ${resourceName}`);
        }
      }
    } catch (error) {
      console.error("[UserRights] Error syncing screens:", error);
    }
  }
}

module.exports = UserRightsService;
