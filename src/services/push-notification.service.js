const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { getMessaging, isFirebaseConfigured } = require("../config/firebase");
const userNotificationService = require("./user-notification.service");

const BATCH_SIZE = 500;

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function removeInvalidTokens(tokens) {
  if (!tokens.length) {
    return;
  }
  await prisma.userdevicetokens.deleteMany({
    where: { token: { in: tokens } }
  });
}

async function getAdminPolicyId(tenantid) {
  const policy = await prisma.policies.findFirst({
    where: { tenantid: Number(tenantid), isdefaultpolicy: true },
    select: { recno: true }
  });
  return policy?.recno ?? null;
}

class PushNotificationService {
  isConfigured() {
    return isFirebaseConfigured();
  }

  async getAdminUserIds(tenantid, branchid) {
    const policyId = await getAdminPolicyId(tenantid);
    if (!policyId) {
      return [];
    }

    const rows = await prisma.userpolicies.findMany({
      where: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        policyid: policyId
      },
      select: { userid: true }
    });

    const adminIds = new Set(rows.map((r) => r.userid).filter(Boolean));

    const managers = await prisma.userorganizations.findMany({
      where: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        isblocked: false
      },
      include: {
        users_userorganizations_useridTousers: {
          select: { userid: true, usertype: true, isactive: true, isdeleted: true }
        }
      }
    });

    managers.forEach((m) => {
      const u = m.users_userorganizations_useridTousers;
      if (u && u.isactive !== false && u.isdeleted !== true && u.usertype === "admin") {
        adminIds.add(u.userid);
      }
    });

    return [...adminIds];
  }

  async getActiveMemberUserIds(tenantid, branchid = null) {
    const where = {
      tenantid: Number(tenantid),
      isblocked: false,
      userid: { not: null }
    };
    if (branchid != null) {
      where.branchid = Number(branchid);
    }

    const memberships = await prisma.userorganizations.findMany({
      where,
      include: {
        users_userorganizations_useridTousers: {
          select: { userid: true, isactive: true, isdeleted: true }
        }
      }
    });

    const ids = new Set();
    memberships.forEach((m) => {
      const u = m.users_userorganizations_useridTousers;
      if (u && u.isactive !== false && u.isdeleted !== true) {
        ids.add(u.userid);
      }
    });
    return [...ids];
  }

  async getTokensForUserIds(userIds) {
    const ids = [...new Set((userIds || []).map(Number).filter((id) => id > 0))];
    if (!ids.length) {
      return [];
    }

    const rows = await prisma.userdevicetokens.findMany({
      where: { userid: { in: ids } },
      select: { token: true }
    });

    return [...new Set(rows.map((r) => r.token).filter(Boolean))];
  }

  async notifyUsers(userIds, payload) {
    await userNotificationService.saveForUsers(userIds, payload).catch((err) => {
      console.warn("[PUSH] Firestore notification save failed:", err.message);
    });

    const tokens = await this.getTokensForUserIds(userIds);
    return this.sendToTokens(tokens, payload);
  }

  async notifyAdmins(tenantid, branchid, payload) {
    const adminIds = await this.getAdminUserIds(tenantid, branchid);
    return this.notifyUsers(adminIds, payload);
  }

  async notifyAllMembers(tenantid, branchid, payload) {
    const userIds = await this.getActiveMemberUserIds(tenantid, branchid);
    return this.notifyUsers(userIds, payload);
  }

  async registerDeviceToken(userid, body = {}) {
    const token = body.token ?? body.fcmToken ?? body.deviceToken;
    if (!token || !String(token).trim()) {
      throw clientError("token (FCM device token) is required");
    }

    const normalized = String(token).trim();
    const platform =
      body.platform != null && String(body.platform).trim() !== ""
        ? String(body.platform).trim().toLowerCase()
        : null;

    const now = utcNow();
    const existing = await prisma.userdevicetokens.findUnique({
      where: { token: normalized }
    });

    if (existing) {
      const row = await prisma.userdevicetokens.update({
        where: { token: normalized },
        data: {
          userid: Number(userid),
          platform: platform ?? existing.platform,
          updatedat: now
        }
      });
      return { message: "Device token updated", data: row };
    }

    const row = await prisma.userdevicetokens.create({
      data: {
        userid: Number(userid),
        token: normalized,
        platform,
        createdat: now
      }
    });
    return { message: "Device token registered", data: row };
  }

  async removeDeviceToken(userid, body = {}) {
    const token = body.token ?? body.fcmToken ?? body.deviceToken;
    if (!token || !String(token).trim()) {
      throw clientError("token is required");
    }

    const normalized = String(token).trim();
    const existing = await prisma.userdevicetokens.findFirst({
      where: { token: normalized, userid: Number(userid) }
    });

    if (!existing) {
      return { message: "Token not found for user", removed: false };
    }

    await prisma.userdevicetokens.delete({ where: { recno: existing.recno } });
    return { message: "Device token removed", removed: true };
  }

  async sendToTokens(tokens, { title, body, data = {} }) {
    if (!tokens.length) {
      return { sent: false, reason: "No device tokens", successCount: 0, failureCount: 0 };
    }

    const messaging = getMessaging();
    if (!messaging) {
      return { sent: false, reason: "Firebase not configured", successCount: 0, failureCount: 0 };
    }

    const stringData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        stringData[key] = String(value);
      }
    });

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: String(title || "Notification"),
          body: String(body || "")
        },
        data: stringData
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((res, idx) => {
        if (res.success) {
          return;
        }
        const code = res.error?.code;
        if (code && INVALID_TOKEN_CODES.has(code)) {
          invalidTokens.push(batch[idx]);
        }
      });
    }

    if (invalidTokens.length) {
      await removeInvalidTokens(invalidTokens);
    }

    return {
      sent: successCount > 0,
      successCount,
      failureCount,
      invalidTokensRemoved: invalidTokens.length
    };
  }

  /** Announcement push to every active member in scope (all branches or one branch). */
  async sendAnnouncementPushToAll(announcement) {
    if (!announcement?.isactive) {
      return { sent: false, reason: "Announcement inactive" };
    }

    const now = utcNow();
    if (announcement.publishat && announcement.publishat > now) {
      return { sent: false, reason: "Announcement not yet published" };
    }
    if (announcement.expireat && announcement.expireat < now) {
      return { sent: false, reason: "Announcement expired" };
    }

    const tenantid = Number(announcement.tenantid);
    const branchid = announcement.branchid != null ? Number(announcement.branchid) : null;

    return this.notifyAllMembers(tenantid, branchid, {
      title: announcement.title,
      body: announcement.message,
      data: {
        type: "announcement",
        event: "announcement",
        announcementId: announcement.recno,
        audience: announcement.audience,
        tenantid,
        branchid: branchid ?? ""
      }
    });
  }

  /** @deprecated use sendAnnouncementPushToAll */
  async sendAnnouncementPush(announcement) {
    return this.sendAnnouncementPushToAll(announcement);
  }

  async sendTestNotification(auth, body = {}) {
    const token = body.token ?? body.fcmToken;
    if (!token || !String(token).trim()) {
      throw clientError("token is required for test notification");
    }

    const payload = {
      title: body.title || "Test notification",
      body: body.body || body.message || "Firebase push is working.",
      data: {
        type: "test",
        event: "test",
        userid: auth.userid,
        tenantid: auth.tenantid,
        branchid: auth.branchid
      }
    };

    await userNotificationService.saveForUsers([Number(auth.userid)], payload).catch((err) => {
      console.warn("[PUSH] Firestore test notification save failed:", err.message);
    });

    return this.sendToTokens([String(token).trim()], payload);
  }
}

module.exports = new PushNotificationService();
