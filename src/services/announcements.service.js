const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");
const {
  normalizeAnnouncementAudience,
  audiencesForUserType,
  clientError
} = require("../utils/announcement-audience");
const pushDispatch = require("./push-dispatch.service");

const USER_SELECT = { select: { userid: true, name: true, email: true } };

const ROW_INCLUDE = {
  branches: { select: { branchid: true, name: true } },
  users_announcements_createdbyTousers: USER_SELECT,
  users_announcements_lastupdatedbyTousers: USER_SELECT
};

function toDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw clientError("Invalid date value");
  }
  return d;
}

function formatAnnouncementRow(row) {
  if (!row) return null;
  return {
    recno: row.recno,
    tenantid: row.tenantid,
    branchid: row.branchid ?? null,
    branchName: row.branches?.name ?? null,
    title: row.title,
    message: row.message,
    audience: row.audience,
    isactive: row.isactive,
    priority: row.priority,
    publishat: row.publishat ?? null,
    expireat: row.expireat ?? null,
    createdby: row.createdby ?? null,
    createdByName: row.users_announcements_createdbyTousers?.name ?? null,
    createdat: row.createdat ?? null,
    lastupdatedby: row.lastupdatedby ?? null,
    lastUpdatedByName: row.users_announcements_lastupdatedbyTousers?.name ?? null,
    lastupdatedat: row.lastupdatedat ?? null
  };
}

function buildVisibleWindow(now) {
  return {
    AND: [
      { OR: [{ publishat: null }, { publishat: { lte: now } }] },
      { OR: [{ expireat: null }, { expireat: { gte: now } }] }
    ]
  };
}

class AnnouncementsService {
  async ensureAdmin(auth) {
    const authService = serviceContainer.getAuthService();
    await authService.ensureAdmin(auth.userid, auth.tenantid, auth.branchid);
  }

  async isAdmin(auth) {
    try {
      await this.ensureAdmin(auth);
      return true;
    } catch {
      return false;
    }
  }

  async assertBranchInTenant(branchid, tenantid) {
    if (branchid == null) {
      return;
    }
    const branch = await prisma.branches.findFirst({
      where: { branchid: Number(branchid), tenantid: Number(tenantid) },
      select: { branchid: true }
    });
    if (!branch) {
      const err = new Error("Branch does not belong to your organization");
      err.status = 403;
      throw err;
    }
  }

  parseCreateUpdateBody(body = {}, isUpdate = false) {
    const data = {};

    if (!isUpdate || body.title !== undefined) {
      const title = body.title != null ? String(body.title).trim() : "";
      if (!title) {
        throw clientError("title is required");
      }
      data.title = title;
    }

    if (!isUpdate || body.message !== undefined) {
      const message = body.message != null ? String(body.message).trim() : "";
      if (!message) {
        throw clientError("message is required");
      }
      data.message = message;
    }

    if (body.audience !== undefined) {
      data.audience = normalizeAnnouncementAudience(body.audience);
    } else if (!isUpdate) {
      data.audience = normalizeAnnouncementAudience(body.audience, { defaultAudience: "technician" });
    }

    if (body.isactive !== undefined) {
      data.isactive = body.isactive === true || body.isactive === "true" || body.isactive === 1;
    }

    if (body.priority !== undefined) {
      const p = Number(body.priority);
      if (!Number.isFinite(p)) {
        throw clientError("priority must be a number");
      }
      data.priority = Math.trunc(p);
    }

    if (body.publishat !== undefined || body.publishAt !== undefined) {
      data.publishat = toDate(body.publishat ?? body.publishAt);
    }
    if (body.expireat !== undefined || body.expireAt !== undefined) {
      data.expireat = toDate(body.expireat ?? body.expireAt);
    }

    if (body.branchid !== undefined || body.branchId !== undefined) {
      const raw = body.branchid ?? body.branchId;
      if (raw === null || raw === "" || raw === "null") {
        data.branchid = null;
      } else {
        const branchid = Number(raw);
        if (!Number.isFinite(branchid) || branchid <= 0) {
          throw clientError("branchid must be a positive integer or null for all branches");
        }
        data.branchid = branchid;
      }
    }

    if (
      data.publishat &&
      data.expireat &&
      data.expireat.getTime() < data.publishat.getTime()
    ) {
      throw clientError("expireat must be after publishat");
    }

    return data;
  }

  async listForUser(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const now = utcNow();
    const adminView = query.adminView === true || query.adminView === "true";
    const isAdmin = adminView ? await this.isAdmin(auth) : false;

    const user = await prisma.users.findUnique({
      where: { userid: Number(auth.userid) },
      select: { usertype: true }
    });
    const audienceFilter = audiencesForUserType(user?.usertype);

    const where = {
      tenantid,
      OR: [{ branchid: null }, { branchid }]
    };

    if (isAdmin && (query.includeInactive === true || query.includeInactive === "true")) {
      // admin sees all statuses
    } else {
      where.isactive = true;
      Object.assign(where, buildVisibleWindow(now));
      where.audience = { in: audienceFilter };
    }

    if (isAdmin && query.audience) {
      where.audience = normalizeAnnouncementAudience(query.audience);
    }

    const rows = await prisma.announcements.findMany({
      where,
      orderBy: { createdat: "desc" },
      include: ROW_INCLUDE
    });

    return {
      tenantid,
      branchid,
      total: rows.length,
      data: rows.map(formatAnnouncementRow)
    };
  }

  async getById(auth, id) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const row = await prisma.announcements.findFirst({
      where: {
        recno: Number(id),
        tenantid,
        OR: [{ branchid: null }, { branchid }]
      },
      include: ROW_INCLUDE
    });

    if (!row) {
      const err = new Error("Announcement not found");
      err.status = 404;
      throw err;
    }

    const isAdmin = await this.isAdmin(auth);
    if (!isAdmin) {
      if (!row.isactive) {
        const err = new Error("Announcement not found");
        err.status = 404;
        throw err;
      }
      const now = utcNow();
      if (row.publishat && row.publishat > now) {
        const err = new Error("Announcement not found");
        err.status = 404;
        throw err;
      }
      if (row.expireat && row.expireat < now) {
        const err = new Error("Announcement not found");
        err.status = 404;
        throw err;
      }
      const user = await prisma.users.findUnique({
        where: { userid: Number(auth.userid) },
        select: { usertype: true }
      });
      const allowed = audiencesForUserType(user?.usertype);
      if (!allowed.includes(row.audience)) {
        const err = new Error("Announcement not found");
        err.status = 404;
        throw err;
      }
    }

    return formatAnnouncementRow(row);
  }

  async create(auth, body) {
    await this.ensureAdmin(auth);
    const tenantid = Number(auth.tenantid);
    const parsed = this.parseCreateUpdateBody(body, false);

    if (parsed.branchid != null) {
      await this.assertBranchInTenant(parsed.branchid, tenantid);
    }

    const now = utcNow();
    const row = await prisma.announcements.create({
      data: {
        tenantid,
        branchid: parsed.branchid ?? null,
        title: parsed.title,
        message: parsed.message,
        audience: parsed.audience ?? "technician",
        isactive: parsed.isactive !== undefined ? parsed.isactive : true,
        priority: parsed.priority ?? 0,
        publishat: parsed.publishat ?? now,
        expireat: parsed.expireat ?? null,
        createdby: Number(auth.userid),
        createdat: now,
        lastupdatedby: Number(auth.userid),
        lastupdatedat: now
      },
      include: ROW_INCLUDE
    });

    const formatted = formatAnnouncementRow(row);
    pushDispatch.onAnnouncementCreated(row);

    return {
      message: "Announcement created",
      data: formatted
    };
  }

  async update(auth, id, body) {
    await this.ensureAdmin(auth);
    const tenantid = Number(auth.tenantid);
    const existing = await prisma.announcements.findFirst({
      where: { recno: Number(id), tenantid }
    });
    if (!existing) {
      const err = new Error("Announcement not found");
      err.status = 404;
      throw err;
    }

    const parsed = this.parseCreateUpdateBody(body, true);
    if (Object.keys(parsed).length === 0) {
      throw clientError("No fields to update");
    }

    if (parsed.branchid != null) {
      await this.assertBranchInTenant(parsed.branchid, tenantid);
    }

    const row = await prisma.announcements.update({
      where: { recno: existing.recno },
      data: {
        ...parsed,
        lastupdatedby: Number(auth.userid),
        lastupdatedat: utcNow()
      },
      include: ROW_INCLUDE
    });

    return {
      message: "Announcement updated",
      data: formatAnnouncementRow(row)
    };
  }

  async remove(auth, id) {
    await this.ensureAdmin(auth);
    const tenantid = Number(auth.tenantid);
    const existing = await prisma.announcements.findFirst({
      where: { recno: Number(id), tenantid }
    });
    if (!existing) {
      const err = new Error("Announcement not found");
      err.status = 404;
      throw err;
    }

    await prisma.announcements.delete({ where: { recno: existing.recno } });
    return { message: "Announcement deleted", recno: existing.recno };
  }

  async deactivate(auth, id) {
    return this.update(auth, id, { isactive: false });
  }
}

module.exports = new AnnouncementsService();
