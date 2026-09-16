const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { resolveRecordedAtWindow } = require("../utils/date-range-query");
const {
  parseOptionalPositiveInt,
  resolveSummaryWindow,
  resolveDetailWindow,
  parseDetailPagination,
  formatWindowFilters
} = require("../utils/tracking-query");

const MAX_MINUTES = 24 * 60;
const DEFAULT_LIVE_MINUTES = 30;
const MAX_PINGS_PER_REQUEST = 100;

const PING_INCLUDE = {
  users: { select: { userid: true, name: true, email: true } },
  job: { select: { recno: true, code: true, manualjobno: true } }
};

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

async function assertJobInScope(jobid, tenantid, branchid) {
  const job = await prisma.job.findFirst({
    where: {
      recno: Number(jobid),
      tenantid: Number(tenantid),
      branchid: Number(branchid)
    },
    select: { recno: true, code: true }
  });
  if (!job) {
    throw clientError("jobid is not a valid job for your tenant and branch", 404);
  }
  return job;
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

function normalizePingList(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === "object") {
    if (Array.isArray(body.pings)) return body.pings;
    if (Array.isArray(body.data)) return body.data;
    if (Array.isArray(body.items)) return body.items;
  }
  throw clientError(
    'Request body must be a JSON array of ping objects, or an object with a "pings" array'
  );
}

function parseOptionalJobId(body, label) {
  const raw = body.jobid ?? body.jobId;
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const jobid = Number(raw);
  if (!Number.isFinite(jobid) || jobid <= 0) {
    throw clientError(`${label}jobid must be a positive integer when provided`);
  }
  return jobid;
}

class UserTrackingService {
  parsePingItem(body, index) {
    const label = index != null ? `Ping #${index + 1}: ` : "";

    const jobid = parseOptionalJobId(body, label);

    const latitude = parseCoord(body.latitude, -90, 90, `${label}latitude`);
    const longitude = parseCoord(body.longitude, -180, 180, `${label}longitude`);
    const accuracy = optionalFloat(body.accuracy);
    const altitude = optionalFloat(body.altitude);
    const heading = optionalFloat(body.heading);
    const speed = optionalFloat(body.speed);

    let recordedat = utcNow();
    if (body.recordedAt != null && body.recordedAt !== "") {
      const d = new Date(body.recordedAt);
      if (Number.isNaN(d.getTime())) {
        throw clientError(`${label}recordedAt must be a valid ISO date-time`);
      }
      recordedat = d;
    }

    const address =
      body.address != null && String(body.address).trim() !== ""
        ? String(body.address).trim()
        : null;

    return {
      jobid,
      latitude,
      longitude,
      address,
      accuracy,
      altitude,
      heading,
      speed,
      recordedat
    };
  }

  async recordPings(auth, body) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const userid = Number(auth.userid);

    await assertBranchInTenant(branchid, tenantid);
    await assertUserInBranch(userid, tenantid, branchid);

    const items = normalizePingList(body);
    if (!items.length) {
      throw clientError("At least one ping is required");
    }
    if (items.length > MAX_PINGS_PER_REQUEST) {
      throw clientError(`Maximum ${MAX_PINGS_PER_REQUEST} pings per request`);
    }

    const jobCache = new Map();
    const resolveJob = async (jobid) => {
      if (jobCache.has(jobid)) return jobCache.get(jobid);
      const job = await assertJobInScope(jobid, tenantid, branchid);
      jobCache.set(jobid, job);
      return job;
    };

    const prepared = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw clientError(`Ping #${i + 1}: must be an object`);
      }
      const parsed = this.parsePingItem(item, i);
      let jobRecno = null;
      if (parsed.jobid != null) {
        const job = await resolveJob(parsed.jobid);
        jobRecno = job.recno;
      }
      prepared.push({
        userid,
        tenantid,
        branchid,
        jobid: jobRecno,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        address: parsed.address,
        accuracy: parsed.accuracy,
        altitude: parsed.altitude,
        heading: parsed.heading,
        speed: parsed.speed,
        recordedat: parsed.recordedat
      });
    }

    const rows = await prisma.$transaction(
      prepared.map((data) =>
        prisma.userlocations.create({
          data,
          include: PING_INCLUDE
        })
      )
    );

    const data = rows.map((row) => this.toDto(row));
    return {
      total: data.length,
      created: data.length,
      data
    };
  }

  async getLiveLocations(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    await assertBranchInTenant(branchid, tenantid);

    const window = resolveRecordedAtWindow(query, {
      defaultMinutes: DEFAULT_LIVE_MINUTES,
      maxMinutes: MAX_MINUTES
    });

    const filterJobid =
      query.jobid != null && query.jobid !== "" ? Number(query.jobid) : null;
    if (filterJobid != null && (!Number.isFinite(filterJobid) || filterJobid <= 0)) {
      throw clientError("jobid must be a positive integer when provided");
    }
    if (filterJobid != null) {
      await assertJobInScope(filterJobid, tenantid, branchid);
    }

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
      return {
        minutes: window.minutes,
        since: window.start.toISOString(),
        until: window.end.toISOString(),
        date: window.date,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        jobid: filterJobid,
        locations: []
      };
    }

    const where = {
      tenantid,
      branchid,
      userid: { in: allowedUserIds },
      recordedat: { gte: window.start, lt: window.end }
    };
    if (filterJobid != null) {
      where.jobid = filterJobid;
    }

    const rows = await prisma.userlocations.findMany({
      where,
      orderBy: { recordedat: "desc" },
      include: PING_INCLUDE,
      take: 5000
    });

    const latestByUser = new Map();
    rows.forEach((row) => {
      if (!latestByUser.has(row.userid)) {
        latestByUser.set(row.userid, row);
      }
    });

    return {
      minutes: window.minutes,
      since: window.start.toISOString(),
      until: window.end.toISOString(),
      date: window.date,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      jobid: filterJobid,
      locations: Array.from(latestByUser.values()).map((row) => this.toDto(row))
    };
  }

  async loadBranchTechnicians(tenantid, branchid) {
    const memberships = await prisma.userorganizations.findMany({
      where: {
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        isblocked: false,
        userid: { not: null }
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

    return memberships
      .map((m) => m.users_userorganizations_useridTousers)
      .filter((user) => user && user.usertype === "technician" && user.isactive !== false);
  }

  buildLocationWhere(scope, window, filterJobid) {
    const where = {
      tenantid: scope.tenantid,
      branchid: scope.branchid
    };

    if (!window.allTime) {
      where.recordedat = { gte: window.start, lt: window.end };
    }

    if (filterJobid != null) {
      where.jobid = filterJobid;
    }

    return where;
  }

  groupLatestByUser(rows) {
    const latestByUser = new Map();
    const countsByUser = new Map();

    rows.forEach((row) => {
      countsByUser.set(row.userid, (countsByUser.get(row.userid) || 0) + 1);
      if (!latestByUser.has(row.userid)) {
        latestByUser.set(row.userid, row);
      }
    });

    return { latestByUser, countsByUser };
  }

  async getTechniciansSummary(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    await assertBranchInTenant(branchid, tenantid);

    const filterJobid = parseOptionalPositiveInt(query.jobid ?? query.jobId, "jobid");
    if (filterJobid != null) {
      await assertJobInScope(filterJobid, tenantid, branchid);
    }

    const window = resolveSummaryWindow(query);
    const scope = { tenantid, branchid };
    const technicians = await this.loadBranchTechnicians(tenantid, branchid);
    const technicianIds = technicians.map((t) => t.userid);

    if (!technicianIds.length) {
      return {
        asOf: utcNow().toISOString(),
        tenantid,
        branchid,
        jobid: filterJobid,
        filters: formatWindowFilters(window),
        summary: {
          totalTechnicians: 0,
          withLocation: 0,
          withoutLocation: 0,
          totalPings: 0
        },
        technicians: []
      };
    }

    const where = {
      ...this.buildLocationWhere(scope, window, filterJobid),
      userid: { in: technicianIds }
    };

    const rows = await prisma.userlocations.findMany({
      where,
      orderBy: { recordedat: "desc" },
      include: PING_INCLUDE,
      take: 10000
    });

    const { latestByUser, countsByUser } = this.groupLatestByUser(rows);
    let withLocation = 0;
    let withoutLocation = 0;

    const technicianRows = technicians.map((tech) => {
      const latest = latestByUser.get(tech.userid) ?? null;
      const pingCount = countsByUser.get(tech.userid) || 0;
      if (latest) {
        withLocation += 1;
      } else {
        withoutLocation += 1;
      }

      return {
        userid: tech.userid,
        name: tech.name ?? null,
        email: tech.email ?? null,
        pingCount,
        lastLocation: latest ? this.toDto(latest) : null
      };
    });

    return {
      asOf: utcNow().toISOString(),
      tenantid,
      branchid,
      jobid: filterJobid,
      filters: formatWindowFilters(window),
      summary: {
        totalTechnicians: technicians.length,
        withLocation,
        withoutLocation,
        totalPings: rows.length
      },
      technicians: technicianRows
    };
  }

  async getTechnicianDetail(auth, userid, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const technicianId = parseOptionalPositiveInt(userid, "userid");

    await assertBranchInTenant(branchid, tenantid);
    await assertUserInBranch(technicianId, tenantid, branchid);

    const technician = await prisma.users.findFirst({
      where: { userid: technicianId },
      select: { userid: true, name: true, email: true, usertype: true, isactive: true }
    });
    if (!technician || technician.usertype !== "technician") {
      throw clientError("User is not an active technician in this branch", 404);
    }

    const filterJobid = parseOptionalPositiveInt(query.jobid ?? query.jobId, "jobid");
    if (filterJobid != null) {
      await assertJobInScope(filterJobid, tenantid, branchid);
    }

    const window = resolveDetailWindow(query);
    const paging = parseDetailPagination(query);
    const scope = { tenantid, branchid };

    const where = {
      ...this.buildLocationWhere(scope, { allTime: false, ...window }, filterJobid),
      userid: technicianId
    };

    const [total, rows, aggregate] = await Promise.all([
      prisma.userlocations.count({ where }),
      prisma.userlocations.findMany({
        where,
        orderBy: { recordedat: "asc" },
        include: PING_INCLUDE,
        skip: paging.skip,
        take: paging.take
      }),
      prisma.userlocations.aggregate({
        where,
        _min: { recordedat: true },
        _max: { recordedat: true }
      })
    ]);

    const totalPages = total ? Math.ceil(total / paging.pageSize) : 0;

    return {
      asOf: utcNow().toISOString(),
      tenantid,
      branchid,
      jobid: filterJobid,
      filters: {
        ...formatWindowFilters({ allTime: false, ...window }),
        userid: technicianId
      },
      technician: {
        userid: technician.userid,
        name: technician.name ?? null,
        email: technician.email ?? null
      },
      summary: {
        totalPings: total,
        firstRecordedAt: aggregate._min.recordedat ?? null,
        lastRecordedAt: aggregate._max.recordedat ?? null
      },
      pagination: {
        page: paging.page,
        pageSize: paging.pageSize,
        total,
        totalPages,
        returned: rows.length
      },
      pings: rows.map((row) => this.toDto(row))
    };
  }

  toDto(row) {
    return {
      recno: row.recno,
      userid: row.userid,
      tenantid: row.tenantid,
      branchid: row.branchid,
      jobid: row.jobid ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address ?? null,
      accuracy: row.accuracy,
      altitude: row.altitude,
      heading: row.heading,
      speed: row.speed,
      recordedat: row.recordedat,
      createdat: row.createdat,
      user: row.users
        ? { userid: row.users.userid, name: row.users.name, email: row.users.email }
        : null,
      job: row.job
        ? { recno: row.job.recno, code: row.job.code, manualjobno: row.job.manualjobno }
        : null
    };
  }
}

module.exports = new UserTrackingService();
module.exports.parseOptionalJobId = parseOptionalJobId;
