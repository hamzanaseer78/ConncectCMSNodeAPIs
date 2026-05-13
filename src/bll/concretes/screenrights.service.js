const prisma = require("../../database/prisma");

/**
 * Aggregates effective screen rights for the current tenant/branch context.
 * Aligns with authorization.middleware (policy union + branch OR null; default-admin grants all).
 */
class ScreenRightsService {
  async isDefaultAdmin(userid, tenantid, branchid) {
    const adminPolicy = await prisma.policies.findFirst({
      where: {
        tenantid: Number(tenantid),
        isdefaultpolicy: true
      },
      select: { recno: true }
    });

    if (!adminPolicy) {
      return false;
    }

    const assignment = await prisma.userpolicies.findFirst({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        policyid: adminPolicy.recno
      }
    });

    return Boolean(assignment);
  }

  async getScreenRights(auth) {
    const userid = Number(auth.userid);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    const policyAssignments = await prisma.userpolicies.findMany({
      where: {
        userid,
        tenantid,
        branchid
      },
      select: { policyid: true }
    });

    const policyIds = policyAssignments.map((x) => x.policyid).filter((id) => id != null);
    const isAdmin = await this.isDefaultAdmin(userid, tenantid, branchid);

    const screens = await prisma.screens.findMany({
      where: { accessible: true },
      orderBy: { screenid: "asc" }
    });

    const mergedByScreen = new Map();

    if (!isAdmin && policyIds.length > 0) {
      const rows = await prisma.userrights.findMany({
        where: {
          tenantid,
          policyid: { in: policyIds },
          OR: [{ branchid }, { branchid: null }]
        },
        select: {
          screenid: true,
          viewscreen: true,
          addscreen: true,
          updatescreen: true,
          deletescreen: true,
          others: true
        }
      });

      for (const row of rows) {
        if (row.screenid == null) continue;
        const prev = mergedByScreen.get(row.screenid) || {
          viewscreen: false,
          addscreen: false,
          updatescreen: false,
          deletescreen: false,
          others: false
        };
        mergedByScreen.set(row.screenid, {
          viewscreen: prev.viewscreen || row.viewscreen === true,
          addscreen: prev.addscreen || row.addscreen === true,
          updatescreen: prev.updatescreen || row.updatescreen === true,
          deletescreen: prev.deletescreen || row.deletescreen === true,
          others: prev.others || row.others === true
        });
      }
    }

    const empty = {
      viewscreen: false,
      addscreen: false,
      updatescreen: false,
      deletescreen: false,
      others: false
    };

    const screenRights = screens.map((screen) => {
      const agg = isAdmin
        ? {
            viewscreen: true,
            addscreen: true,
            updatescreen: true,
            deletescreen: true,
            others: true
          }
        : mergedByScreen.get(screen.screenid) || empty;

      return {
        screenid: screen.screenid,
        screenname: screen.screenname,
        controllername: screen.controllername,
        screengroup: screen.screengroup,
        view: agg.viewscreen,
        add: agg.addscreen,
        update: agg.updatescreen,
        delete: agg.deletescreen,
        others: agg.others
      };
    });

    return { isAdmin, screenRights };
  }
}

module.exports = new ScreenRightsService();
