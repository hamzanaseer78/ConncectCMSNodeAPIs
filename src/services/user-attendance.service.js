const prisma = require("../database/prisma");
const {
  utcNow,
  startOfUtcDay,
  endOfUtcDay,
  utcDayRange
} = require("../utils/date");
const {
  parseRequiredAttendanceLocation,
  toLocationDto,
  clientError
} = require("../utils/attendance-location");
const {
  parseAttendanceUsersFilters,
  buildMembershipUserWhere,
  matchesAttendanceUserRow,
  formatAppliedAttendanceUserFilters
} = require("../utils/attendance-users-filters");
const pushDispatch = require("./push-dispatch.service");
const faceApprovalService = require("./face-approval.service");

const SESSION_INCLUDE = {
  users: { select: { userid: true, name: true, email: true, usertype: true } }
};

const ACTIONS = {
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
  BREAK_IN: "break_in",
  BREAK_OUT: "break_out"
};

/** Public presence: active (checked in), idle (on break), out (not checked in). */
const PRESENCE = {
  ACTIVE: "active",
  IDLE: "idle",
  OUT: "out"
};

function presenceFromSession(session) {
  if (!session || !session.isopen) {
    return PRESENCE.OUT;
  }
  if (session.status === "on_break") {
    return PRESENCE.IDLE;
  }
  if (session.status === "checked_in") {
    return PRESENCE.ACTIVE;
  }
  return PRESENCE.OUT;
}

function formatSessionRow(row) {
  if (!row) return null;
  return {
    sessionId: row.recno,
    userid: row.userid,
    tenantid: row.tenantid,
    branchid: row.branchid,
    status: row.status,
    presence: presenceFromSession(row),
    isopen: row.isopen,
    checkinat: row.checkinat,
    checkoutat: row.checkoutat ?? null,
    lastLocation: toLocationDto(row.lastlatitude, row.lastlongitude, row.lastaddress),
    lastactionat: row.lastactionat,
    user: row.users
      ? {
          userid: row.users.userid,
          name: row.users.name,
          email: row.users.email,
          usertype: row.users.usertype
        }
      : null
  };
}

const VALID_STATUSES = new Set(["checked_in", "on_break", "checked_out"]);

function parseAttendanceMethod(body = {}) {
  const raw = body.method ?? body.attendanceMethod;
  if (raw == null || raw === "") {
    return "standard";
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "face") {
    return "face";
  }
  return "standard";
}

async function assertFaceAttendanceIfNeeded(body, userid) {
  if (parseAttendanceMethod(body) === "face") {
    await faceApprovalService.assertFaceAttendanceAllowed(userid);
  }
}

function parseOptionalUtcDate(value, label) {
  if (value == null || value === "") return undefined;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw clientError(`${label} must be a valid date (YYYY-MM-DD or ISO datetime)`);
  }
  return parsed;
}

function resolveAttendanceDateRange(query = {}) {
  if (query.date != null && query.date !== "") {
    const day = parseOptionalUtcDate(query.date, "date");
    return utcDayRange(day);
  }

  const fromRaw = query.dateFrom ?? query.from;
  const toRaw = query.dateTo ?? query.to;
  if (fromRaw == null && toRaw == null) {
    return null;
  }

  const start = fromRaw != null && fromRaw !== ""
    ? startOfUtcDay(parseOptionalUtcDate(fromRaw, "dateFrom"))
    : startOfUtcDay(new Date(0));
  const end = toRaw != null && toRaw !== ""
    ? endOfUtcDay(parseOptionalUtcDate(toRaw, "dateTo"))
    : endOfUtcDay(utcNow());

  if (start.getTime() >= end.getTime()) {
    throw clientError("dateFrom must be before dateTo");
  }

  return { start, end };
}

function sessionDurationMinutes(session) {
  if (!session?.checkinat) return null;
  const endMs = session.checkoutat
    ? new Date(session.checkoutat).getTime()
    : session.isopen
      ? utcNow().getTime()
      : new Date(session.lastactionat).getTime();
  const startMs = new Date(session.checkinat).getTime();
  if (!Number.isFinite(endMs) || !Number.isFinite(startMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 60000);
}

function formatSessionListRow(row) {
  const formatted = formatSessionRow(row);
  if (!formatted) return null;
  return {
    ...formatted,
    durationMinutes: sessionDurationMinutes(row)
  };
}

function formatLogRow(row) {
  return {
    recno: row.recno,
    sessionid: row.sessionid,
    userid: row.userid,
    action: row.action,
    location: toLocationDto(row.latitude, row.longitude, row.address),
    recordedat: row.recordedat,
    remarks: row.remarks ?? null
  };
}

async function assertBranchInTenant(branchid, tenantid) {
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

async function assertUserInBranch(userid, tenantid, branchid) {
  const m = await prisma.userorganizations.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      isblocked: false
    },
    select: { recno: true }
  });
  if (!m) {
    const err = new Error("User is not assigned to this branch");
    err.status = 403;
    throw err;
  }
}

async function recordLocationPing(tx, scope, userid, location, jobid = null) {
  return tx.userlocations.create({
    data: {
      userid: Number(userid),
      ...scope,
      jobid: jobid != null ? Number(jobid) : null,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      recordedat: utcNow()
    }
  });
}

async function appendLog(tx, session, action, location, remarks = null) {
  return tx.userattendancelog.create({
    data: {
      sessionid: session.recno,
      userid: session.userid,
      tenantid: session.tenantid,
      branchid: session.branchid,
      action,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      recordedat: utcNow(),
      remarks: remarks != null && String(remarks).trim() !== "" ? String(remarks).trim() : null
    }
  });
}

async function getOpenSession(tx, userid, tenantid, branchid) {
  return tx.userattendancesession.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      isopen: true
    }
  });
}

async function fetchLatestLocationsByUser(tenantid, branchid, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const where = {
    tenantid: Number(tenantid),
    userid: { in: userIds }
  };
  if (branchid != null) {
    where.branchid = Number(branchid);
  }

  const rows = await prisma.userlocations.findMany({
    where,
    orderBy: { recordedat: "desc" },
    take: Math.min(userIds.length * 20, 5000)
  });

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.userid)) {
      map.set(row.userid, {
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address ?? null,
        recordedat: row.recordedat,
        jobid: row.jobid ?? null
      });
    }
  });
  return map;
}

class UserAttendanceService {
  buildScope(auth) {
    return {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    };
  }

  async getMyStatus(auth) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(auth.userid, scope.tenantid, scope.branchid);

    const [session, faceApproval] = await Promise.all([
      prisma.userattendancesession.findFirst({
        where: { ...scope, userid: Number(auth.userid), isopen: true },
        include: SESSION_INCLUDE
      }),
      faceApprovalService.getMyStatus(auth).catch(() => null)
    ]);

    const locMap = await fetchLatestLocationsByUser(
      scope.tenantid,
      scope.branchid,
      [Number(auth.userid)]
    );

    return {
      presence: presenceFromSession(session),
      session: formatSessionRow(session),
      faceApproval: faceApproval
        ? {
            branchEnabled: faceApproval.branchSettings?.isEnabled === true,
            allowFaceApprovalRequest:
              faceApproval.user?.allowFaceApprovalRequest === true,
            faceAttendanceEnabled: faceApproval.user?.faceAttendanceEnabled === true,
            canSubmitRequest: faceApproval.canSubmitRequest === true,
            pendingRequest: faceApproval.pendingRequest
          }
        : null,
      lastLocation:
        locMap.get(Number(auth.userid)) ??
        (session
          ? toLocationDto(session.lastlatitude, session.lastlongitude, session.lastaddress)
          : null)
    };
  }

  async listMyAttendance(auth, query = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);

    const dateRange = resolveAttendanceDateRange(query);
    const statusFilter =
      query.status != null && String(query.status).trim() !== ""
        ? String(query.status).trim().toLowerCase()
        : null;

    if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
      throw clientError("status must be checked_in, on_break, or checked_out");
    }

    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.limit) || 25, 1), 100);

    const where = {
      userid,
      tenantid: scope.tenantid,
      branchid: scope.branchid
    };

    if (dateRange) {
      where.checkinat = { gte: dateRange.start, lt: dateRange.end };
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    const [total, rows] = await Promise.all([
      prisma.userattendancesession.count({ where }),
      prisma.userattendancesession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: { checkinat: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      userid,
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      filters: {
        date: query.date ?? null,
        dateFrom: query.dateFrom ?? query.from ?? null,
        dateTo: query.dateTo ?? query.to ?? null,
        status: statusFilter
      },
      data: rows.map(formatSessionListRow),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0
      }
    };
  }

  async checkIn(auth, body = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);
    await assertFaceAttendanceIfNeeded(body, userid);

    const location = parseRequiredAttendanceLocation(body);
    const remarks = body.remarks != null ? String(body.remarks).trim() : null;
    const now = utcNow();

    const session = await prisma.$transaction(async (tx) => {
      const open = await getOpenSession(tx, userid, scope.tenantid, scope.branchid);
      if (open) {
        throw clientError("Already checked in. Check out before starting a new session.");
      }

      const created = await tx.userattendancesession.create({
        data: {
          userid,
          ...scope,
          status: "checked_in",
          isopen: true,
          checkinat: now,
          lastlatitude: location.latitude,
          lastlongitude: location.longitude,
          lastaddress: location.address,
          lastactionat: now
        }
      });

      await appendLog(tx, created, ACTIONS.CHECK_IN, location, remarks);
      await recordLocationPing(tx, scope, userid, location);
      return created;
    });

    const full = await prisma.userattendancesession.findFirst({
      where: { recno: session.recno },
      include: SESSION_INCLUDE
    });

    pushDispatch.onAttendanceAction(auth, ACTIONS.CHECK_IN, location);

    return {
      message: "Checked in",
      presence: PRESENCE.ACTIVE,
      session: formatSessionRow(full)
    };
  }

  async checkOut(auth, body = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);
    await assertFaceAttendanceIfNeeded(body, userid);

    const location = parseRequiredAttendanceLocation(body);
    const remarks = body.remarks != null ? String(body.remarks).trim() : null;
    const now = utcNow();

    const session = await prisma.$transaction(async (tx) => {
      const open = await getOpenSession(tx, userid, scope.tenantid, scope.branchid);
      if (!open) {
        throw clientError("Not checked in");
      }
      if (open.status === "checked_out") {
        throw clientError("Session already closed");
      }

      const updated = await tx.userattendancesession.update({
        where: { recno: open.recno },
        data: {
          status: "checked_out",
          isopen: false,
          checkoutat: now,
          lastlatitude: location.latitude,
          lastlongitude: location.longitude,
          lastaddress: location.address,
          lastactionat: now
        }
      });

      await appendLog(tx, updated, ACTIONS.CHECK_OUT, location, remarks);
      await recordLocationPing(tx, scope, userid, location);
      return updated;
    });

    const full = await prisma.userattendancesession.findFirst({
      where: { recno: session.recno },
      include: SESSION_INCLUDE
    });

    pushDispatch.onAttendanceAction(auth, ACTIONS.CHECK_OUT, location);

    return {
      message: "Checked out",
      presence: PRESENCE.OUT,
      session: formatSessionRow(full)
    };
  }

  async breakIn(auth, body = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);

    const location = parseRequiredAttendanceLocation(body);
    const remarks = body.remarks != null ? String(body.remarks).trim() : null;
    const now = utcNow();

    const session = await prisma.$transaction(async (tx) => {
      const open = await getOpenSession(tx, userid, scope.tenantid, scope.branchid);
      if (!open) {
        throw clientError("Check in before starting a break");
      }
      if (open.status === "on_break") {
        throw clientError("Already on break");
      }
      if (open.status !== "checked_in") {
        throw clientError("Cannot start break in current state");
      }

      const updated = await tx.userattendancesession.update({
        where: { recno: open.recno },
        data: {
          status: "on_break",
          lastlatitude: location.latitude,
          lastlongitude: location.longitude,
          lastaddress: location.address,
          lastactionat: now
        }
      });

      await appendLog(tx, updated, ACTIONS.BREAK_IN, location, remarks);
      await recordLocationPing(tx, scope, userid, location);
      return updated;
    });

    const full = await prisma.userattendancesession.findFirst({
      where: { recno: session.recno },
      include: SESSION_INCLUDE
    });

    pushDispatch.onAttendanceAction(auth, ACTIONS.BREAK_IN, location);

    return {
      message: "Break started",
      presence: PRESENCE.IDLE,
      session: formatSessionRow(full)
    };
  }

  async breakOut(auth, body = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);

    const location = parseRequiredAttendanceLocation(body);
    const remarks = body.remarks != null ? String(body.remarks).trim() : null;
    const now = utcNow();

    const session = await prisma.$transaction(async (tx) => {
      const open = await getOpenSession(tx, userid, scope.tenantid, scope.branchid);
      if (!open) {
        throw clientError("Check in before ending a break");
      }
      if (open.status !== "on_break") {
        throw clientError("Not currently on break");
      }

      const updated = await tx.userattendancesession.update({
        where: { recno: open.recno },
        data: {
          status: "checked_in",
          lastlatitude: location.latitude,
          lastlongitude: location.longitude,
          lastaddress: location.address,
          lastactionat: now
        }
      });

      await appendLog(tx, updated, ACTIONS.BREAK_OUT, location, remarks);
      await recordLocationPing(tx, scope, userid, location);
      return updated;
    });

    const full = await prisma.userattendancesession.findFirst({
      where: { recno: session.recno },
      include: SESSION_INCLUDE
    });

    pushDispatch.onAttendanceAction(auth, ACTIONS.BREAK_OUT, location);

    return {
      message: "Break ended",
      presence: PRESENCE.ACTIVE,
      session: formatSessionRow(full)
    };
  }

  async listBranchUsers(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid =
      query.branchid != null && query.branchid !== ""
        ? Number(query.branchid)
        : Number(auth.branchid);

    if (!Number.isFinite(branchid) || branchid <= 0) {
      throw clientError("branchid must be a positive integer");
    }

    await assertBranchInTenant(branchid, tenantid);

    const filters = parseAttendanceUsersFilters(query);
    const userWhere = buildMembershipUserWhere(filters);

    const memberships = await prisma.userorganizations.findMany({
      where: {
        tenantid,
        branchid,
        isblocked: false,
        userid: { not: null },
        ...(userWhere
          ? { users_userorganizations_useridTousers: userWhere }
          : {})
      },
      include: {
        users_userorganizations_useridTousers: {
          select: {
            userid: true,
            name: true,
            email: true,
            usertype: true,
            isactive: true
          }
        }
      },
      orderBy: { userid: "asc" }
    });

    const userIds = memberships
      .map((m) => m.userid)
      .filter((id) => id != null);

    const [openSessions, lastLocations] = await Promise.all([
      prisma.userattendancesession.findMany({
        where: { tenantid, branchid, isopen: true, userid: { in: userIds } },
        include: SESSION_INCLUDE
      }),
      fetchLatestLocationsByUser(tenantid, branchid, userIds)
    ]);

    const sessionByUser = new Map(openSessions.map((s) => [s.userid, s]));

    const users = memberships
      .map((m) => {
        const u = m.users_userorganizations_useridTousers;
        if (!u) return null;

        const session = sessionByUser.get(u.userid) ?? null;
        const presence = presenceFromSession(session);
        const pingLoc = lastLocations.get(u.userid) ?? null;
        const sessionLoc = session
          ? toLocationDto(session.lastlatitude, session.lastlongitude, session.lastaddress)
          : null;

        return {
          userid: u.userid,
          name: u.name,
          email: u.email,
          usertype: u.usertype,
          isactive: u.isactive !== false,
          presence,
          attendanceStatus: session?.status ?? null,
          session: formatSessionRow(session),
          lastLocation: pingLoc ?? sessionLoc
        };
      })
      .filter(Boolean)
      .filter((row) => matchesAttendanceUserRow(row, filters));

    const summary = {
      total: users.length,
      active: users.filter((u) => u.presence === PRESENCE.ACTIVE).length,
      idle: users.filter((u) => u.presence === PRESENCE.IDLE).length,
      out: users.filter((u) => u.presence === PRESENCE.OUT).length
    };

    return {
      tenantid,
      branchid,
      filters: formatAppliedAttendanceUserFilters(filters),
      summary,
      users
    };
  }

  async getSessionLogs(auth, query = {}) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);

    const sessionId = query.sessionId != null ? Number(query.sessionId) : null;
    const targetUserid =
      query.userid != null ? Number(query.userid) : Number(auth.userid);

    const where = {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      userid: targetUserid
    };
    if (sessionId) {
      where.sessionid = sessionId;
    }

    const rows = await prisma.userattendancelog.findMany({
      where,
      orderBy: { recordedat: "desc" },
      take: Math.min(Number(query.limit) || 50, 200)
    });

    return {
      userid: targetUserid,
      total: rows.length,
      data: rows.map(formatLogRow)
    };
  }

  /** Batch enrichment for admin user list. */
  async enrichUsersWithPresenceAndLocation(tenantid, branchid, userRows) {
    if (!userRows?.length) {
      return userRows;
    }

    const userIds = userRows.map((r) => r.userid).filter(Boolean);
    const locBranch = branchid != null ? Number(branchid) : null;

    const sessionWhere = {
      tenantid: Number(tenantid),
      isopen: true,
      userid: { in: userIds }
    };
    if (locBranch != null) {
      sessionWhere.branchid = locBranch;
    }

    const [openSessions, lastLocations] = await Promise.all([
      prisma.userattendancesession.findMany({
        where: sessionWhere,
        select: {
          userid: true,
          branchid: true,
          status: true,
          isopen: true,
          lastlatitude: true,
          lastlongitude: true,
          lastaddress: true,
          lastactionat: true,
          checkinat: true
        }
      }),
      fetchLatestLocationsByUser(Number(tenantid), locBranch, userIds)
    ]);

    const sessionByUser = new Map();
    openSessions.forEach((s) => {
      if (!sessionByUser.has(s.userid)) {
        sessionByUser.set(s.userid, s);
      }
    });

    return userRows.map((row) => {
      const session = sessionByUser.get(row.userid) ?? null;
      const pingLoc = lastLocations.get(row.userid) ?? null;
      const sessionLoc = session
        ? toLocationDto(session.lastlatitude, session.lastlongitude, session.lastaddress)
        : null;

      return {
        ...row,
        presence: presenceFromSession(session),
        attendanceStatus: session?.status ?? null,
        lastLocation: pingLoc ?? sessionLoc
      };
    });
  }
}

module.exports = new UserAttendanceService();
module.exports.PRESENCE = PRESENCE;
