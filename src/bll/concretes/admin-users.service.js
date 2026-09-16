const prisma = require("../../database/prisma");
const bcrypt = require("bcryptjs");
const { utcNow } = require("../../utils/date");
const { generateRandomPassword } = require("../../utils/password");
const {
  assertUserEmailAvailable
} = require("../../utils/user-email");
const { resolveUserTypeFromInput } = require("../../utils/user-type");
const { applyTechnicianAffiliationFields } = require("../../utils/technician-affiliation");
const { applyManagerFields, formatManagerFields, loadManagerNameLookup } = require("../../utils/user-manager");
const { assertPasswordStrength } = require("../../utils/password-policy");
const { buildNameContainsFilter } = require("../../utils/list-filter");
const screenRightsService = require("./screenrights.service");
const userAttendanceService = require("../../services/user-attendance.service");
const userActivityLogService = require("../../services/user-activity-log.service");

function safeUser(user) {
  if (!user) {
    return null;
  }
  const { password, signuptoken, resettoken, ...dto } = user;
  return dto;
}

function summarizeRights(screenRights = []) {
  return screenRights
    .filter((row) => row.view === true)
    .map((row) => ({
      screenid: row.screenid,
      screenname: row.screenname,
      controllername: row.controllername,
      view: row.view,
      add: row.add,
      update: row.update,
      delete: row.delete,
      others: row.others
    }));
}

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseBooleanInput(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw clientError("Boolean field must be true or false");
}

function hasOwn(input, ...keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function pickInputValue(input, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      return input[key];
    }
  }
  return undefined;
}

class AdminUsersService {
  constructor(authService) {
    this.authService = authService;
  }

  async assertNotLastActiveAdmin(userid, tenantid, branchid) {
    const isTargetAdmin = await screenRightsService.isDefaultAdmin(
      userid,
      tenantid,
      branchid
    );
    if (!isTargetAdmin) {
      return;
    }

    const adminPolicy = await prisma.policies.findFirst({
      where: { tenantid: Number(tenantid), isdefaultpolicy: true },
      select: { recno: true }
    });
    if (!adminPolicy) {
      return;
    }

    const adminAssignments = await prisma.userpolicies.findMany({
      where: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        policyid: adminPolicy.recno
      },
      select: { userid: true }
    });
    const adminUserIds = [...new Set(adminAssignments.map((row) => row.userid).filter(Boolean))];
    const activeAdminCount =
      adminUserIds.length === 0
        ? 0
        : await prisma.users.count({
            where: {
              userid: { in: adminUserIds },
              isactive: { not: false },
              isdeleted: { not: true }
            }
          });

    if (activeAdminCount <= 1) {
      throw clientError("Cannot remove or deactivate the last active admin for this branch");
    }
  }

  async ensureUserIsNotAdmin(userid, tenantid, branchid) {
    const adminPolicy = await prisma.policies.findFirst({
      where: {
        tenantid: Number(tenantid),
        isdefaultpolicy: true
      },
      select: { recno: true }
    });

    if (!adminPolicy) {
      return;
    }

    const assignment = await prisma.userpolicies.findFirst({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        policyid: adminPolicy.recno
      }
    });

    if (assignment) {
      throw clientError("Admin user cannot be blocked", 400);
    }
  }

  async list(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const allBranches = query.allBranches === true || query.allBranches === "true";
    const branchid = allBranches
      ? null
      : Number(query.branchid != null ? query.branchid : auth.branchid);
    const includeRights =
      query.includeRights === true || query.includeRights === "true";

    const membershipWhere = { tenantid };
    if (branchid != null) {
      membershipWhere.branchid = branchid;
    }

    const nameFilter = buildNameContainsFilter(query.name);
    if (nameFilter) {
      membershipWhere.users_userorganizations_useridTousers = { name: nameFilter };
    }

    const memberships = await prisma.userorganizations.findMany({
      where: membershipWhere,
      include: {
        users_userorganizations_useridTousers: {
          select: {
            userid: true,
            name: true,
            email: true,
            contactno: true,
            isactive: true,
            isdeleted: true,
            usertype: true,
            technicianaffiliation: true,
            companyname: true,
            managerid: true,
            createdat: true,
            lastupdatedat: true
          }
        },
        branches: { select: { branchid: true, name: true } }
      },
      orderBy: { createdat: "desc" }
    });

    const userIds = [...new Set(memberships.map((row) => row.userid).filter(Boolean))];

    const policyRows =
      userIds.length === 0
        ? []
        : await prisma.userpolicies.findMany({
            where: {
              tenantid,
              userid: { in: userIds },
              ...(branchid != null ? { branchid } : {})
            },
            include: {
              policies: {
                select: { recno: true, description: true, isdefaultpolicy: true }
              },
              branches: { select: { branchid: true, name: true } }
            }
          });

    const policiesByUser = new Map();
    policyRows.forEach((row) => {
      if (!policiesByUser.has(row.userid)) {
        policiesByUser.set(row.userid, []);
      }
      policiesByUser.get(row.userid).push({
        recno: row.recno,
        policyid: row.policyid,
        policyname: row.policies?.description ?? "",
        isAdminPolicy: row.policies?.isdefaultpolicy === true,
        branchid: row.branchid,
        branchname: row.branches?.name ?? ""
      });
    });

    const adminPolicy = await prisma.policies.findFirst({
      where: { tenantid, isdefaultpolicy: true },
      select: { recno: true }
    });

    const byUser = new Map();

    memberships.forEach((membership) => {
      const user = membership.users_userorganizations_useridTousers;
      if (!user) {
        return;
      }

      if (!byUser.has(user.userid)) {
        const policies = policiesByUser.get(user.userid) || [];
        const isAdmin =
          Boolean(adminPolicy) && policies.some((p) => p.policyid === adminPolicy.recno);

        byUser.set(user.userid, {
          userid: user.userid,
          name: user.name,
          email: user.email,
          contactno: user.contactno,
          usertype: user.usertype,
          technicianAffiliation: user.technicianaffiliation ?? null,
          companyName: user.companyname ?? null,
          managerId: user.managerid ?? null,
          managerName: null,
          isactive: user.isactive !== false,
          isdeleted: user.isdeleted === true,
          createdat: user.createdat,
          lastupdatedat: user.lastupdatedat,
          isAdmin,
          policies,
          branches: []
        });
      }

      const entry = byUser.get(user.userid);
      entry.branches.push({
        branchid: membership.branchid,
        branchname: membership.branches?.name ?? "",
        isblocked: membership.isblocked === true,
        membershipRecno: membership.recno
      });
    });

    let data = Array.from(byUser.values());

    const managerLookup = await loadManagerNameLookup(
      data.map((row) => row.managerId).filter(Boolean)
    );
    data = data.map((row) => ({
      ...row,
      ...formatManagerFields({ managerid: row.managerId }, managerLookup)
    }));

    data = await userAttendanceService.enrichUsersWithPresenceAndLocation(
      tenantid,
      branchid,
      data
    );

    if (includeRights) {
      const contextBranchid = branchid != null ? branchid : Number(auth.branchid);
      await Promise.all(
        data.map(async (row) => {
          const rights = await screenRightsService.getScreenRights({
            userid: row.userid,
            tenantid,
            branchid: contextBranchid
          });
          row.isAdmin = rights.isAdmin;
          row.screenRights = rights.screenRights;
          row.allowedScreens = summarizeRights(rights.screenRights);
        })
      );
    }

    return {
      data,
      total: data.length,
      tenantid,
      branchid: branchid ?? null,
      allBranches
    };
  }

  async getById(auth, userid, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(query.branchid != null ? query.branchid : auth.branchid);
    const uid = Number(userid);

    const membership = await prisma.userorganizations.findFirst({
      where: { userid: uid, tenantid, branchid },
      include: {
        branches: { select: { branchid: true, name: true } }
      }
    });

    if (!membership) {
      const err = new Error("User is not a member of this organization branch");
      err.status = 404;
      throw err;
    }

    const user = await prisma.users.findUnique({ where: { userid: uid } });
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    const managerLookup = await loadManagerNameLookup(user.managerid ? [user.managerid] : []);

    const policies = await prisma.userpolicies.findMany({
      where: { userid: uid, tenantid, branchid },
      include: {
        policies: { select: { recno: true, description: true, isdefaultpolicy: true } },
        branches: { select: { branchid: true, name: true } }
      }
    });

    const rights = await screenRightsService.getScreenRights({
      userid: uid,
      tenantid,
      branchid
    });

    const allMemberships = await prisma.userorganizations.findMany({
      where: { userid: uid, tenantid },
      include: { branches: { select: { branchid: true, name: true } } }
    });

    return {
      user: {
        ...safeUser(user),
        ...formatManagerFields(user, managerLookup)
      },
      tenantid,
      branchid,
      isblocked: membership.isblocked === true,
      membershipRecno: membership.recno,
      branches: allMemberships.map((row) => ({
        branchid: row.branchid,
        branchname: row.branches?.name ?? "",
        isblocked: row.isblocked === true,
        membershipRecno: row.recno
      })),
      policies: policies.map((row) => ({
        recno: row.recno,
        policyid: row.policyid,
        policyname: row.policies?.description ?? "",
        isAdminPolicy: row.policies?.isdefaultpolicy === true,
        branchid: row.branchid,
        branchname: row.branches?.name ?? ""
      })),
      isAdmin: rights.isAdmin,
      screenRights: rights.screenRights,
      allowedScreens: summarizeRights(rights.screenRights)
    };
  }

  async setActive(auth, userid, isactive) {
    const uid = Number(userid);
    const active = isactive === true || isactive === "true" || isactive === 1;

    if (uid === Number(auth.userid) && !active) {
      const err = new Error("You cannot deactivate your own account");
      err.status = 400;
      throw err;
    }

    const membership = await prisma.userorganizations.findFirst({
      where: {
        userid: uid,
        tenantid: Number(auth.tenantid)
      }
    });

    if (!membership) {
      const err = new Error("User is not a member of this organization");
      err.status = 404;
      throw err;
    }

    if (!active) {
      await this.assertNotLastActiveAdmin(uid, auth.tenantid, auth.branchid);
    }

    const now = utcNow();
    const user = await prisma.users.update({
      where: { userid: uid },
      data: {
        isactive: active,
        lastupdatedby: Number(auth.userid),
        lastupdatedat: now
      },
      select: {
        userid: true,
        name: true,
        email: true,
        isactive: true,
        isdeleted: true,
        lastupdatedat: true
      }
    });

    await userActivityLogService.logSafe(auth, {
      module: "users",
      action: active ? "activate" : "deactivate",
      entityName: user.name ?? null,
      entityId: uid,
      entityCode: user.email ?? null,
      summary: active ? `Activated user ${user.name || uid}` : `Deactivated user ${user.name || uid}`
    });

    return {
      message: active ? "User activated" : "User deactivated",
      user
    };
  }

  async setBlocked(auth, userid, isblocked, branchid) {
    const uid = Number(userid);
    const blocked = isblocked === true || isblocked === "true" || isblocked === 1;
    const targetBranch = Number(branchid != null ? branchid : auth.branchid);

    if (uid === Number(auth.userid) && blocked) {
      const err = new Error("You cannot block your own account");
      err.status = 400;
      throw err;
    }

    const membership = await prisma.userorganizations.findFirst({
      where: {
        userid: uid,
        tenantid: Number(auth.tenantid),
        branchid: targetBranch
      }
    });

    if (!membership) {
      const err = new Error("User is not a member of this branch");
      err.status = 404;
      throw err;
    }

    if (blocked) {
      await this.ensureUserIsNotAdmin(uid, auth.tenantid, targetBranch);
    }

    const now = utcNow();
    const updated = await prisma.userorganizations.update({
      where: { recno: membership.recno },
      data: {
        isblocked: blocked,
        blockedby: blocked ? Number(auth.userid) : null,
        blockedat: blocked ? now : null,
        lastupdatedby: Number(auth.userid),
        lastupdatedat: now
      }
    });

    const targetUser = await prisma.users.findUnique({
      where: { userid: uid },
      select: { name: true, email: true }
    });

    await userActivityLogService.logSafe(auth, {
      module: "users",
      action: blocked ? "block" : "unblock",
      entityName: targetUser?.name ?? null,
      entityId: uid,
      entityCode: targetUser?.email ?? null,
      branchid: targetBranch,
      summary: blocked
        ? `Blocked user ${targetUser?.name || uid} for branch`
        : `Unblocked user ${targetUser?.name || uid} for branch`
    });

    return {
      message: blocked ? "User blocked for branch" : "User unblocked for branch",
      userid: uid,
      branchid: targetBranch,
      isblocked: updated.isblocked === true
    };
  }

  async update(auth, input = {}) {
    const uid = Number(input.userid ?? input.userId ?? input.id);
    if (!Number.isFinite(uid) || uid <= 0) {
      throw clientError("userid is required");
    }

    const tenantid = Number(auth.tenantid);
    const targetBranchId = Number(
      input.branchid ?? input.branchId ?? auth.branchid
    );
    const now = utcNow();
    const actorId = Number(auth.userid);

    const membership = await prisma.userorganizations.findFirst({
      where: { userid: uid, tenantid, branchid: targetBranchId }
    });
    if (!membership) {
      throw clientError("User is not a member of this organization branch", 404);
    }

    const existingUser = await prisma.users.findUnique({ where: { userid: uid } });
    if (!existingUser) {
      throw clientError("User not found", 404);
    }

    const userUpdate = {
      lastupdatedby: actorId,
      lastupdatedat: now
    };
    let hasUserUpdate = false;
    let generatedPassword = null;
    let passwordEmailSent = false;

    if (hasOwn(input, "name") && input.name != null) {
      const name = String(input.name).trim();
      if (!name) {
        throw clientError("name cannot be empty");
      }
      userUpdate.name = name;
      hasUserUpdate = true;
    }

    if (hasOwn(input, "email")) {
      userUpdate.email = await assertUserEmailAvailable(prisma, input.email, {
        excludeUserId: uid
      });
      hasUserUpdate = true;
    }

    if (hasOwn(input, "contactno")) {
      userUpdate.contactno =
        input.contactno == null || String(input.contactno).trim() === ""
          ? null
          : String(input.contactno).trim();
      hasUserUpdate = true;
    }

    if (hasOwn(input, "profileimage", "imageUrl")) {
      const imageUrl = pickInputValue(input, "profileimage", "imageUrl");
      userUpdate.profileimage =
        imageUrl == null || String(imageUrl).trim() === "" ? null : String(imageUrl).trim();
      hasUserUpdate = true;
    }

    if (hasOwn(input, "gender")) {
      userUpdate.gender =
        input.gender == null || String(input.gender).trim() === ""
          ? null
          : String(input.gender).trim();
      hasUserUpdate = true;
    }

    if (hasOwn(input, "country")) {
      if (input.country == null || input.country === "") {
        userUpdate.country = null;
      } else {
        const country = Number(input.country);
        if (!Number.isFinite(country)) {
          throw clientError("country must be a number");
        }
        userUpdate.country = country;
      }
      hasUserUpdate = true;
    }

    if (hasOwn(input, "city")) {
      if (input.city == null || input.city === "") {
        userUpdate.city = null;
      } else {
        const city = Number(input.city);
        if (!Number.isFinite(city)) {
          throw clientError("city must be a number");
        }
        userUpdate.city = Math.trunc(city);
      }
      hasUserUpdate = true;
    }

    if (
      hasOwn(input, "usertype", "userType", "type")
    ) {
      userUpdate.usertype = resolveUserTypeFromInput(input, { required: true });
      hasUserUpdate = true;
    }

    const effectiveType = userUpdate.usertype ?? existingUser.usertype;
    const technicianFields = applyTechnicianAffiliationFields(input, effectiveType, {
      mode: "update"
    });
    if (Object.keys(technicianFields).length) {
      Object.assign(userUpdate, technicianFields);
      hasUserUpdate = true;
    }

    const managerFields = await applyManagerFields(input, effectiveType, {
      mode: "update",
      tenantid,
      technicianUserId: uid
    });
    if (Object.keys(managerFields).length) {
      Object.assign(userUpdate, managerFields);
      hasUserUpdate = true;
    }

    if (hasOwn(input, "allowFaceApprovalRequest", "allowfaceapprovalrequest")) {
      userUpdate.allowfaceapprovalrequest = parseBooleanInput(
        pickInputValue(input, "allowFaceApprovalRequest", "allowfaceapprovalrequest")
      );
      if (userUpdate.allowfaceapprovalrequest === false && !hasOwn(input, "faceAttendanceEnabled", "faceattendanceenabled")) {
        userUpdate.faceattendanceenabled = false;
      }
      hasUserUpdate = true;
    }

    if (hasOwn(input, "faceAttendanceEnabled", "faceattendanceenabled")) {
      userUpdate.faceattendanceenabled = parseBooleanInput(
        pickInputValue(input, "faceAttendanceEnabled", "faceattendanceenabled")
      );
      hasUserUpdate = true;
    }

    if (hasOwn(input, "isactive")) {
      const active = parseBooleanInput(input.isactive);
      if (uid === actorId && active === false) {
        throw clientError("You cannot deactivate your own account");
      }
      if (active === false) {
        await this.assertNotLastActiveAdmin(uid, tenantid, targetBranchId);
      }
      userUpdate.isactive = active;
      hasUserUpdate = true;
    }

    const explicitPassword = hasOwn(input, "password") ? String(input.password || "").trim() : "";
    const resetPassword =
      input.resetPassword === true ||
      input.resetPassword === "true" ||
      input.resetPassword === 1;

    if (explicitPassword) {
      assertPasswordStrength(explicitPassword);
      userUpdate.password = await bcrypt.hash(explicitPassword, 10);
      generatedPassword = explicitPassword;
      hasUserUpdate = true;
    } else if (resetPassword) {
      generatedPassword = generateRandomPassword(
        Number(process.env.ADMIN_USER_PASSWORD_LENGTH || 12)
      );
      userUpdate.password = await bcrypt.hash(generatedPassword, 10);
      hasUserUpdate = true;
    }

    const policyProvided = hasOwn(input, "policyid", "policyId");
    let targetPolicyId = null;
    if (policyProvided) {
      targetPolicyId = await this.authService.resolveInvitePolicyId(tenantid, input.policyid ?? input.policyId);
      const adminPolicy = await prisma.policies.findFirst({
        where: { tenantid, isdefaultpolicy: true },
        select: { recno: true }
      });
      if (adminPolicy) {
        const currentAdminAssignment = await prisma.userpolicies.findFirst({
          where: {
            userid: uid,
            tenantid,
            branchid: targetBranchId,
            policyid: adminPolicy.recno
          }
        });
        if (currentAdminAssignment && targetPolicyId !== adminPolicy.recno) {
          await this.assertNotLastActiveAdmin(uid, tenantid, targetBranchId);
        }
      }
    }

    const membershipUpdate = {};
    let hasMembershipUpdate = false;
    if (hasOwn(input, "isblocked")) {
      const blocked = parseBooleanInput(input.isblocked);
      if (uid === actorId && blocked === true) {
        throw clientError("You cannot block your own account");
      }
      if (blocked) {
        await this.ensureUserIsNotAdmin(uid, tenantid, targetBranchId);
      }
      membershipUpdate.isblocked = blocked;
      membershipUpdate.blockedby = blocked ? actorId : null;
      membershipUpdate.blockedat = blocked ? now : null;
      membershipUpdate.lastupdatedby = actorId;
      membershipUpdate.lastupdatedat = now;
      hasMembershipUpdate = true;
    }

    if (!hasUserUpdate && !policyProvided && !hasMembershipUpdate) {
      throw clientError("Provide at least one field to update");
    }

    await prisma.$transaction(async (tx) => {
      if (hasUserUpdate) {
        await tx.users.update({
          where: { userid: uid },
          data: userUpdate
        });
      }

      if (hasMembershipUpdate) {
        await tx.userorganizations.update({
          where: { recno: membership.recno },
          data: membershipUpdate
        });
      }

      if (policyProvided) {
        await tx.userpolicies.deleteMany({
          where: { userid: uid, tenantid, branchid: targetBranchId }
        });
        await tx.userpolicies.create({
          data: {
            userid: uid,
            tenantid,
            branchid: targetBranchId,
            policyid: targetPolicyId,
            createdby: actorId,
            createdat: now,
            lastupdatedby: actorId,
            updatedat: now
          }
        });
      }
    });

    const sendEmail =
      input.sendEmail !== false &&
      input.sendemail !== false &&
      Boolean(generatedPassword);

    if (sendEmail && generatedPassword) {
      const [organization, targetUser] = await Promise.all([
        prisma.organizations.findUnique({
          where: { tenantid },
          select: { organizationname: true }
        }),
        prisma.users.findUnique({
          where: { userid: uid },
          select: { name: true, email: true }
        })
      ]);
      const loginUrl = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/login`;
      await mailService.sendInvitation(targetUser.email, {
        name: targetUser.name || "User",
        inviterName: auth.name || "Admin",
        organizationName:
          organization?.organizationname || process.env.APP_NAME || "ConnectCMS",
        generatedPassword,
        loginUrl
      });
      passwordEmailSent = true;
    }

    const detail = await this.getById(auth, uid, { branchid: targetBranchId });

    let action = "update";
    if (hasOwn(input, "isblocked")) {
      action = parseBooleanInput(input.isblocked) ? "block" : "unblock";
    } else if (hasOwn(input, "isactive")) {
      action = parseBooleanInput(input.isactive) === false ? "deactivate" : "activate";
    } else if (explicitPassword || resetPassword) {
      action = "password_changed";
    } else if (policyProvided) {
      action = "settings_updated";
    }

    await userActivityLogService.logSafe(
      auth,
      {
        module: "users",
        action,
        entityName: detail?.name ?? existingUser.name ?? null,
        entityId: uid,
        entityCode: detail?.email ?? existingUser.email ?? null,
        branchid: targetBranchId,
        summary: `Updated user ${detail?.name || detail?.email || uid}`,
        metadata: {
          policyUpdated: policyProvided,
          passwordReset: Boolean(explicitPassword || resetPassword)
        }
      }
    );

    return {
      message: "User updated successfully",
      passwordEmailSent,
      generatedPasswordSent: Boolean(generatedPassword && passwordEmailSent),
      ...detail
    };
  }
}

module.exports = AdminUsersService;
