const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");

const MAX_MINUTES = 24 * 60;
const DEFAULT_LIVE_MINUTES = 30;

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseCoord(value, min, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw clientError(`${label} must be a number between ${min} and ${max}`);
  }
  return n;
}

function optionalFloat(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw clientError("Optional numeric fields must be finite numbers");
  }
  return n;
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

class UserTrackingService {
  async recordPing(auth, body) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const userid = Number(auth.userid);

    await assertBranchInTenant(branchid, tenantid);
    await assertUserInBranch(userid, tenantid, branchid);

    const latitude = parseCoord(body.latitude, -90, 90, "latitude");
    const longitude = parseCoord(body.longitude, -180, 180, "longitude");
    const accuracy = optionalFloat(body.accuracy);
    const altitude = optionalFloat(body.altitude);
    const heading = optionalFloat(body.heading);
    const speed = optionalFloat(body.speed);

    let recordedat = utcNow();
    if (body.recordedAt != null && body.recordedAt !== "") {
      const d = new Date(body.recordedAt);
      if (Number.isNaN(d.getTime())) {
        throw clientError("recordedAt must be a valid ISO date-time");
      }
      recordedat = d;
    }

    const row = await prisma.userlocations.create({
      data: {
        userid,
        tenantid,
        branchid,
        latitude,
        longitude,
        accuracy,
        altitude,
        heading,
        speed,
        recordedat
      },
      include: {
        users: { select: { userid: true, name: true, email: true } }
      }
    });

    return this.toDto(row);
  }

  async getLiveLocations(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    await assertBranchInTenant(branchid, tenantid);

    let minutes = Number(query.minutes ?? DEFAULT_LIVE_MINUTES);
    if (!Number.isFinite(minutes) || minutes < 1) {
      minutes = DEFAULT_LIVE_MINUTES;
    }
    minutes = Math.min(minutes, MAX_MINUTES);

    const since = new Date(Date.now() - minutes * 60 * 1000);

    const memberIds = await prisma.userorganizations.findMany({
      where: {
        tenantid,
        branchid,
        isblocked: false,
        userid: { not: null }
      },
      select: { userid: true }
    });
    const allowedUserIds = memberIds.map((m) => m.userid).filter((id) => id != null);

    if (!allowedUserIds.length) {
      return { minutes, since: since.toISOString(), locations: [] };
    }

    const rows = await prisma.userlocations.findMany({
      where: {
        tenantid,
        branchid,
        userid: { in: allowedUserIds },
        recordedat: { gte: since }
      },
      orderBy: { recordedat: "desc" },
      include: {
        users: { select: { userid: true, name: true, email: true } }
      },
      take: 5000
    });

    const latestByUser = new Map();
    for (const row of rows) {
      if (!latestByUser.has(row.userid)) {
        latestByUser.set(row.userid, this.toDto(row));
      }
    }

    return {
      minutes,
      since: since.toISOString(),
      locations: Array.from(latestByUser.values())
    };
  }

  toDto(row) {
    return {
      recno: row.recno,
      userid: row.userid,
      tenantid: row.tenantid,
      branchid: row.branchid,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      altitude: row.altitude,
      heading: row.heading,
      speed: row.speed,
      recordedat: row.recordedat,
      createdat: row.createdat,
      user: row.users
        ? { userid: row.users.userid, name: row.users.name, email: row.users.email }
        : null
    };
  }
}

module.exports = new UserTrackingService();
