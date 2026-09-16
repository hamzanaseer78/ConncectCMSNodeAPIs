const prisma = require("../database/prisma");
const jobApprovalService = require("./job-approval.service");
const { isJobAdmin } = require("../utils/job-access");
const {
  resolveDashboardAccess,
  buildDashboardManagerScope
} = require("../utils/dashboard-access");
const { formatTechnicianAffiliationFields } = require("../utils/technician-affiliation");
const {
  QUOTATION_STATUS,
  quotationStatusLabel,
  formatQuotationStatusFields
} = require("../utils/quotation-status");
const { buildJobHierarchyFields } = require("../utils/job-response-labels");
const { resolvePriorityColor } = require("../utils/job-priority");
const {
  utcNow,
  utcDayRange,
  formatUtcDateKey,
  compareDayTrend,
  startOfUtcDay,
  addUtcDays,
  startOfUtcWeek,
  median,
  buildLastUtcMonthRanges,
  isTimestampInRange
} = require("../utils/date");
const {
  buildJobSummaryPeriods,
  buildJobSummaryPeriodsResponse
} = require("../utils/dashboard-job-summary");

const WEEKLY_JOB_VOLUME_WEEKS = 8;
const TICKET_REOPENING_MONTHS = 12;

const TECHNICIAN_STATUS = Object.freeze({
  OFFLINE: "offline",
  ON_SITE: "on_site",
  TRAVELING: "traveling"
});

const TECHNICIAN_STATUS_FILTERS = Object.freeze([
  "all",
  TECHNICIAN_STATUS.OFFLINE,
  TECHNICIAN_STATUS.ON_SITE,
  TECHNICIAN_STATUS.TRAVELING
]);

const LIVE_TECH_STATUS = Object.freeze({
  ON_SITE: "on_site",
  TRAVELLING: "travelling",
  WAITING: "waiting",
  OFF_DUTY: "off_duty"
});

const TECHNICIAN_STATS_STATUS = Object.freeze({
  ON_SITE: "on_site",
  TRAVELING: "traveling",
  BREAK: "break",
  IDLE: "idle",
  ABSENT: "absent"
});

const TECHNICIAN_STATS_STATUS_LABELS = Object.freeze({
  [TECHNICIAN_STATS_STATUS.ON_SITE]: "On Site",
  [TECHNICIAN_STATS_STATUS.TRAVELING]: "Traveling",
  [TECHNICIAN_STATS_STATUS.BREAK]: "Break",
  [TECHNICIAN_STATS_STATUS.IDLE]: "Present",
  [TECHNICIAN_STATS_STATUS.ABSENT]: "Absent"
});

const TECHNICIAN_STATS_FILTERS = Object.freeze([
  "all",
  TECHNICIAN_STATS_STATUS.ON_SITE,
  TECHNICIAN_STATS_STATUS.TRAVELING,
  TECHNICIAN_STATS_STATUS.BREAK,
  TECHNICIAN_STATS_STATUS.IDLE,
  TECHNICIAN_STATS_STATUS.ABSENT
]);

const LIVE_TECH_STATUS_LABELS = Object.freeze({
  [LIVE_TECH_STATUS.ON_SITE]: "On Site",
  [LIVE_TECH_STATUS.TRAVELLING]: "Travelling",
  [LIVE_TECH_STATUS.WAITING]: "Waiting",
  [LIVE_TECH_STATUS.OFF_DUTY]: "Off Duty"
});

const LIVE_TECH_STATUS_FILTERS = Object.freeze([
  "all",
  LIVE_TECH_STATUS.ON_SITE,
  LIVE_TECH_STATUS.TRAVELLING,
  LIVE_TECH_STATUS.WAITING,
  LIVE_TECH_STATUS.OFF_DUTY
]);

const LIVE_JOB_SELECT = {
  recno: true,
  code: true,
  manualjobno: true,
  customers: { select: { name: true } },
  jobcategories: { select: { name: true } },
  jobsubcategories: { select: { name: true } }
};

const LIVE_SESSION_JOB_INCLUDE = {
  job: { select: LIVE_JOB_SELECT }
};

const JOB_REF_SELECT = {
  recno: true,
  code: true,
  manualjobno: true
};

const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
const MAX_ACTIVITY_PAGE_SIZE = 100;

const ACTIVITY_TYPE = Object.freeze({
  TRAVEL_STARTED: "travel_started",
  TRAVEL_STOPPED: "travel_stopped",
  WORK_STARTED: "work_started",
  WORK_STOPPED: "work_stopped",
  JOB_COMPLETED: "job_completed",
  JOB_RESOLVED: "job_resolved",
  JOB_ACKNOWLEDGED: "job_acknowledged",
  QUOTATION_STATUS_CHANGED: "quotation_status_changed"
});

const ACTIVITY_USER_SELECT = { userid: true, name: true };

const MANAGER_JOB_INCLUDE = {
  users: { select: { userid: true, name: true } },
  customers: { select: { name: true } },
  jobsubcategories: { select: { name: true } },
  jobdetails: {
    take: 1,
    orderBy: { recno: "desc" },
    select: { assignedat: true, firstresponseat: true }
  }
};

const MANAGER_LIST_KEYS = Object.freeze([
  "awaitingResponse",
  "overdue",
  "noFirstResponse"
]);

const MANAGER_TECH_STATUS = Object.freeze({
  ON_SITE: "on_site",
  TRAVELLING: "travelling",
  IDLE: "idle",
  OFFLINE: "offline"
});

const DEFAULT_MANAGER_LIST_LIMIT = 50;
const MAX_MANAGER_LIST_LIMIT = 100;

const DEFAULT_ACTIVE_JOBS_PAGE_SIZE = 25;
const MAX_ACTIVE_JOBS_PAGE_SIZE = 100;

const TODAY_JOBS_FILTER = Object.freeze({
  ALL: "all",
  PENDING: "pending",
  APPROVED_QUOTATION: "approved_quotation",
  REJECTED_QUOTATION: "rejected_quotation",
  PENDING_QUOTATIONS: "pending_quotations"
});

const TODAY_JOBS_FILTERS = Object.freeze(Object.values(TODAY_JOBS_FILTER));

const TODAY_JOBS_FILTER_LABELS = Object.freeze({
  [TODAY_JOBS_FILTER.ALL]: "All",
  [TODAY_JOBS_FILTER.PENDING]: "Pending",
  [TODAY_JOBS_FILTER.APPROVED_QUOTATION]: "Approved (Quotation)",
  [TODAY_JOBS_FILTER.REJECTED_QUOTATION]: "Rejected (Quotation)",
  [TODAY_JOBS_FILTER.PENDING_QUOTATIONS]: "Pending Quotations"
});

const TODAY_JOBS_SUMMARY_KEYS = Object.freeze({
  [TODAY_JOBS_FILTER.ALL]: "all",
  [TODAY_JOBS_FILTER.PENDING]: "pending",
  [TODAY_JOBS_FILTER.APPROVED_QUOTATION]: "approvedQuotation",
  [TODAY_JOBS_FILTER.REJECTED_QUOTATION]: "rejectedQuotation",
  [TODAY_JOBS_FILTER.PENDING_QUOTATIONS]: "pendingQuotations"
});

const TODAY_JOBS_FILTER_ALIASES = Object.freeze({
  all: TODAY_JOBS_FILTER.ALL,
  pending: TODAY_JOBS_FILTER.PENDING,
  open: TODAY_JOBS_FILTER.PENDING,
  incomplete: TODAY_JOBS_FILTER.PENDING,
  approved: TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  approvedquotation: TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  "approved(quotation)": TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  "approved (quotation)": TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  quotationapproved: TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  "quotation approved": TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  qoutationapproved: TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  "qoutation approved": TODAY_JOBS_FILTER.APPROVED_QUOTATION,
  rejected: TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  rejectedquotation: TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  "rejected(quotation)": TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  "rejected (quotation)": TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  quotationrejected: TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  "quotation rejected": TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  qoutationrejected: TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  "qoutation rejected": TODAY_JOBS_FILTER.REJECTED_QUOTATION,
  pendingquotations: TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  "pending quotations": TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  pendingquotation: TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  "pending quotation": TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  pendingqoutations: TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  "pending qoutations": TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  pendingqoutation: TODAY_JOBS_FILTER.PENDING_QUOTATIONS,
  "pending qoutation": TODAY_JOBS_FILTER.PENDING_QUOTATIONS
});

const ACTIVE_JOB_INCLUDE = {
  customers: { select: { customerid: true, name: true } },
  users: { select: { userid: true, name: true } },
  jobstatuses: { select: { recno: true, title: true, color: true } },
  jobgroups: { select: { groupid: true, name: true } },
  jobcategories: {
    select: {
      categoryid: true,
      name: true,
      groupid: true,
      jobgroups: { select: { groupid: true, name: true } }
    }
  },
  jobsubcategories: {
    select: {
      subcategoryid: true,
      name: true,
      categoryid: true,
      jobcategories: {
        select: {
          categoryid: true,
          name: true,
          groupid: true,
          jobgroups: { select: { groupid: true, name: true } }
        }
      }
    }
  }
};

function dateInRange(range) {
  return { gte: range.start, lt: range.end };
}

function formatWeekLabel(weekStart, weekEnd) {
  const startMonth = weekStart.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = weekEnd.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const startDay = weekStart.getUTCDate();
  const endDay = weekEnd.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

function buildLastUtcWeekRanges(weekCount, weekStartsOn = 1) {
  const currentWeekStart = startOfUtcWeek(utcNow(), weekStartsOn);
  const ranges = [];

  for (let offset = weekCount - 1; offset >= 0; offset -= 1) {
    const start = addUtcDays(currentWeekStart, -7 * offset);
    const end = addUtcDays(start, 7);
    const weekEndDay = addUtcDays(end, -1);
    ranges.push({
      start,
      end,
      weekStart: formatUtcDateKey(start),
      weekEnd: formatUtcDateKey(weekEndDay),
      label: formatWeekLabel(start, weekEndDay)
    });
  }

  return ranges;
}

function buildDailyJobCounts(jobs) {
  const counts = new Map();
  jobs.forEach((job) => {
    if (!job.date) return;
    const key = formatUtcDateKey(job.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function buildWeekVolumeStats(weekRange, dailyCounts) {
  const dailyVolumes = [];
  const dayBreakdown = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = addUtcDays(weekRange.start, dayOffset);
    const dateKey = formatUtcDateKey(day);
    const count = dailyCounts.get(dateKey) ?? 0;
    dailyVolumes.push(count);
    dayBreakdown.push({ date: dateKey, count });
  }

  const highestValue = Math.max(...dailyVolumes);
  const lowestValue = Math.min(...dailyVolumes);
  const mediumValue = median(dailyVolumes);
  const highestDay = dayBreakdown.find((row) => row.count === highestValue) ?? null;
  const lowestDay = dayBreakdown.find((row) => row.count === lowestValue) ?? null;
  const totalJobs = dailyVolumes.reduce((sum, count) => sum + count, 0);

  return {
    weekStart: weekRange.weekStart,
    weekEnd: weekRange.weekEnd,
    label: weekRange.label,
    totalJobs,
    volume: {
      highest: {
        label: "Highest Volume",
        value: highestValue,
        date: highestDay?.date ?? null
      },
      lowest: {
        label: "Lowest Volume",
        value: lowestValue,
        date: lowestDay?.date ?? null
      },
      medium: {
        label: "Medium Volume",
        value: mediumValue
      }
    },
    dailyBreakdown: dayBreakdown
  };
}

function branchScope(tenantid, branchid) {
  return {
    tenantid: Number(tenantid),
    branchid: Number(branchid)
  };
}

function formatJobRef(job) {
  if (!job) return null;
  return {
    jobid: job.recno,
    code: job.code ?? null,
    manualjobno: job.manualjobno ?? null
  };
}

function formatLocation(row) {
  if (!row) return null;
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address ?? null,
    recordedat: row.recordedat ?? null,
    jobid: row.jobid ?? null
  };
}

async function fetchLatestLocationsByUser(tenantid, branchid, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await prisma.userlocations.findMany({
    where: {
      ...branchScope(tenantid, branchid),
      userid: { in: userIds }
    },
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

function latestOpenSessionByUser(rows, userField) {
  const map = new Map();
  rows.forEach((row) => {
    const userid = row[userField];
    if (userid == null || map.has(userid)) return;
    map.set(userid, row);
  });
  return map;
}

async function loadTechnicianActivity(tenantid, branchid) {
  const scope = branchScope(tenantid, branchid);

  const [travelRows, workRows] = await Promise.all([
    prisma.jobtravelhistory.findMany({
      where: { ...scope, stopedat: null, traveledby: { not: null } },
      include: { job: { select: JOB_REF_SELECT } },
      orderBy: { startedat: "desc" }
    }),
    prisma.jobworklhistory.findMany({
      where: { ...scope, stopedat: null, workedby: { not: null } },
      include: { job: { select: JOB_REF_SELECT } },
      orderBy: { startedat: "desc" }
    })
  ]);

  return {
    onSiteByUser: latestOpenSessionByUser(workRows, "workedby"),
    travelingByUser: latestOpenSessionByUser(travelRows, "traveledby")
  };
}

async function loadLiveTechnicianActivity(tenantid, branchid) {
  const scope = branchScope(tenantid, branchid);

  const [travelRows, workRows] = await Promise.all([
    prisma.jobtravelhistory.findMany({
      where: { ...scope, stopedat: null, traveledby: { not: null } },
      include: LIVE_SESSION_JOB_INCLUDE,
      orderBy: { startedat: "desc" }
    }),
    prisma.jobworklhistory.findMany({
      where: { ...scope, stopedat: null, workedby: { not: null } },
      include: LIVE_SESSION_JOB_INCLUDE,
      orderBy: { startedat: "desc" }
    })
  ]);

  return {
    onSiteByUser: latestOpenSessionByUser(workRows, "workedby"),
    travelingByUser: latestOpenSessionByUser(travelRows, "traveledby")
  };
}

async function fetchOpenAttendanceByUser(tenantid, branchid, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await prisma.userattendancesession.findMany({
    where: {
      ...branchScope(tenantid, branchid),
      userid: { in: userIds },
      isopen: true
    },
    select: {
      userid: true,
      status: true,
      isopen: true,
      checkinat: true,
      lastactionat: true,
      lastlatitude: true,
      lastlongitude: true,
      lastaddress: true
    }
  });

  return new Map(rows.map((row) => [row.userid, row]));
}

async function fetchLatestAttendanceByUser(tenantid, branchid, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await prisma.userattendancesession.findMany({
    where: {
      ...branchScope(tenantid, branchid),
      userid: { in: userIds }
    },
    orderBy: { lastactionat: "desc" },
    take: Math.min(userIds.length * 5, 5000),
    select: {
      userid: true,
      status: true,
      isopen: true,
      checkinat: true,
      checkoutat: true,
      lastactionat: true,
      lastlatitude: true,
      lastlongitude: true,
      lastaddress: true
    }
  });

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.userid)) {
      map.set(row.userid, row);
    }
  });
  return map;
}

async function fetchLastCompletedJobsByUser(tenantid, branchid, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await prisma.jobdetails.findMany({
    where: {
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      completedby: { in: userIds },
      completedat: { not: null }
    },
    orderBy: { completedat: "desc" },
    take: Math.min(userIds.length * 10, 5000),
    select: {
      completedby: true,
      completedat: true,
      job: { select: LIVE_JOB_SELECT }
    }
  });

  const map = new Map();
  rows.forEach((row) => {
    if (!row.completedby || map.has(row.completedby)) return;
    map.set(row.completedby, row);
  });
  return map;
}

function formatLiveJobSummary(job) {
  if (!job) return null;
  return {
    jobId: job.recno,
    jobCode: job.code ?? null,
    manualJobNo: job.manualjobno ?? null,
    customerName: job.customers?.name ?? null,
    categoryName: job.jobcategories?.name ?? null,
    faultName: job.jobsubcategories?.name ?? null
  };
}

function formatSessionStartLocation(session) {
  if (!session) return null;
  const latitude = session.startlatitude != null ? Number(session.startlatitude) : null;
  const longitude = session.startlongitude != null ? Number(session.startlongitude) : null;
  if (latitude == null && longitude == null && !session.startaddress) {
    return null;
  }
  return {
    latitude,
    longitude,
    address: session.startaddress ?? null
  };
}

function formatAttendanceLocation(attendance) {
  if (!attendance) return null;
  return {
    latitude: attendance.lastlatitude ?? null,
    longitude: attendance.lastlongitude ?? null,
    address: attendance.lastaddress ?? null
  };
}

function formatLastCompletedJob(row) {
  if (!row?.job) return null;
  return {
    ...formatLiveJobSummary(row.job),
    completedAt: row.completedat ?? null
  };
}

function resolveLiveTechnicianStatus(userid, activity, openAttendanceByUser) {
  if (activity.onSiteByUser.has(userid)) {
    return LIVE_TECH_STATUS.ON_SITE;
  }
  if (activity.travelingByUser.has(userid)) {
    return LIVE_TECH_STATUS.TRAVELLING;
  }

  const attendance = openAttendanceByUser.get(userid);
  if (
    attendance?.isopen &&
    (attendance.status === "checked_in" || attendance.status === "on_break")
  ) {
    return LIVE_TECH_STATUS.WAITING;
  }

  return LIVE_TECH_STATUS.OFF_DUTY;
}

function buildLiveJobPayload(status, activity, userid) {
  if (status === LIVE_TECH_STATUS.ON_SITE) {
    const session = activity.onSiteByUser.get(userid);
    const jobSummary = formatLiveJobSummary(session?.job ?? null);
    if (!jobSummary) return null;
    return {
      ...jobSummary,
      sessionType: "work",
      startedAt: session?.startedat ?? null,
      location: formatSessionStartLocation(session)
    };
  }

  if (status === LIVE_TECH_STATUS.TRAVELLING) {
    const session = activity.travelingByUser.get(userid);
    const jobSummary = formatLiveJobSummary(session?.job ?? null);
    if (!jobSummary) return null;
    return {
      ...jobSummary,
      sessionType: "travel",
      startedAt: session?.startedat ?? null,
      location: formatSessionStartLocation(session)
    };
  }

  return null;
}

function buildLastActivePayload(status, openAttendance, latestAttendance, lastLocation) {
  if (status !== LIVE_TECH_STATUS.OFF_DUTY) {
    return null;
  }

  const attendance = latestAttendance ?? null;
  const at =
    attendance?.checkoutat ??
    attendance?.lastactionat ??
    lastLocation?.recordedat ??
    null;

  const location =
    formatAttendanceLocation(attendance) ?? formatLocation(lastLocation);

  if (!at && !location) {
    return null;
  }

  return { at, location };
}

function buildLiveTechnicianRow(
  user,
  activity,
  openAttendanceByUser,
  latestAttendanceByUser,
  lastCompletedByUser,
  lastLocations
) {
  const userid = user.userid;
  const status = resolveLiveTechnicianStatus(userid, activity, openAttendanceByUser);
  const openAttendance = openAttendanceByUser.get(userid) ?? null;
  const latestAttendance = latestAttendanceByUser.get(userid) ?? null;
  const lastLocation = lastLocations.get(userid) ?? null;
  const lastCompleted = lastCompletedByUser.get(userid) ?? null;
  const liveJob = buildLiveJobPayload(status, activity, userid);
  const lastCompletedJob = formatLastCompletedJob(lastCompleted);
  const lastActive = buildLastActivePayload(
    status,
    openAttendance,
    latestAttendance,
    lastLocation
  );

  return {
    technicianId: userid,
    technicianName: user.name ?? null,
    email: user.email ?? null,
    ...formatTechnicianAffiliationFields(user),
    status,
    statusLabel: LIVE_TECH_STATUS_LABELS[status] ?? status,
    liveJob,
    lastCompletedJob:
      status === LIVE_TECH_STATUS.WAITING || status === LIVE_TECH_STATUS.OFF_DUTY
        ? lastCompletedJob
        : null,
    lastActive,
    onDutySince:
      status === LIVE_TECH_STATUS.WAITING ? openAttendance?.checkinat ?? null : null,
    currentLocation:
      formatLocation(lastLocation) ??
      formatAttendanceLocation(openAttendance) ??
      formatAttendanceLocation(latestAttendance)
  };
}

function buildLiveTechnicianSummary(rows) {
  return {
    all: rows.length,
    onSite: rows.filter((row) => row.status === LIVE_TECH_STATUS.ON_SITE).length,
    travelling: rows.filter((row) => row.status === LIVE_TECH_STATUS.TRAVELLING).length,
    waiting: rows.filter((row) => row.status === LIVE_TECH_STATUS.WAITING).length,
    offDuty: rows.filter((row) => row.status === LIVE_TECH_STATUS.OFF_DUTY).length
  };
}

function resolveTechnicianStatsStatus(userid, activity, openAttendanceByUser) {
  if (activity.onSiteByUser.has(userid)) {
    return TECHNICIAN_STATS_STATUS.ON_SITE;
  }
  if (activity.travelingByUser.has(userid)) {
    return TECHNICIAN_STATS_STATUS.TRAVELING;
  }

  const attendance = openAttendanceByUser.get(userid);
  if (attendance?.isopen && attendance.status === "on_break") {
    return TECHNICIAN_STATS_STATUS.BREAK;
  }
  if (attendance?.isopen && attendance.status === "checked_in") {
    return TECHNICIAN_STATS_STATUS.IDLE;
  }

  return TECHNICIAN_STATS_STATUS.ABSENT;
}

async function fetchCheckedInTodayUserIds(tenantid, branchid, userIds, todayRange) {
  if (!userIds.length) {
    return new Set();
  }

  const rows = await prisma.userattendancesession.findMany({
    where: {
      ...branchScope(tenantid, branchid),
      userid: { in: userIds },
      checkinat: { gte: todayRange.start, lt: todayRange.end }
    },
    select: { userid: true },
    distinct: ["userid"]
  });

  return new Set(rows.map((row) => row.userid));
}

function buildTechnicianStatsRow(user, activity, openAttendanceByUser, checkedInTodayUserIds) {
  const userid = user.userid;
  const status = resolveTechnicianStatsStatus(userid, activity, openAttendanceByUser);
  const openAttendance = openAttendanceByUser.get(userid) ?? null;
  const onSiteSession = activity.onSiteByUser.get(userid) ?? null;
  const travelSession = activity.travelingByUser.get(userid) ?? null;

  return {
    technicianId: userid,
    technicianName: user.name ?? null,
    email: user.email ?? null,
    ...formatTechnicianAffiliationFields(user),
    status,
    statusLabel: TECHNICIAN_STATS_STATUS_LABELS[status] ?? status,
    attendanceStatus: openAttendance?.status ?? null,
    checkedInToday: checkedInTodayUserIds.has(userid),
    onDutySince: openAttendance?.checkinat ?? null,
    liveJob: formatJobRef(onSiteSession?.job ?? travelSession?.job ?? null)
  };
}

function buildTechnicianStatsSummary(rows, checkedInTodayUserIds) {
  const total = rows.length;
  const onSite = rows.filter((row) => row.status === TECHNICIAN_STATS_STATUS.ON_SITE).length;
  const traveling = rows.filter((row) => row.status === TECHNICIAN_STATS_STATUS.TRAVELING).length;
  const breakCount = rows.filter((row) => row.status === TECHNICIAN_STATS_STATUS.BREAK).length;
  const idle = rows.filter((row) => row.status === TECHNICIAN_STATS_STATUS.IDLE).length;
  const absent = rows.filter((row) => row.status === TECHNICIAN_STATS_STATUS.ABSENT).length;
  const presentNow = onSite + traveling + breakCount + idle;
  const presentToday = rows.filter((row) => row.checkedInToday).length;
  const absentToday = total - presentToday;

  return {
    total,
    onSite,
    working: onSite,
    traveling,
    break: breakCount,
    present: idle,
    idle,
    absent,
    presentNow,
    presentToday,
    absentToday
  };
}

function sortTechnicianStatsRows(rows) {
  const statusOrder = {
    [TECHNICIAN_STATS_STATUS.ON_SITE]: 0,
    [TECHNICIAN_STATS_STATUS.TRAVELING]: 1,
    [TECHNICIAN_STATS_STATUS.BREAK]: 2,
    [TECHNICIAN_STATS_STATUS.IDLE]: 3,
    [TECHNICIAN_STATS_STATUS.ABSENT]: 4
  };

  return [...rows].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return String(a.technicianName || "").localeCompare(
      String(b.technicianName || ""),
      undefined,
      { sensitivity: "base" }
    );
  });
}

function parseTechnicianStatsStatusFilter(query = {}) {
  const raw = query.status != null ? String(query.status).trim().toLowerCase() : "all";
  if (!TECHNICIAN_STATS_FILTERS.includes(raw)) {
    const err = new Error(`status must be one of: ${TECHNICIAN_STATS_FILTERS.join(", ")}`);
    err.status = 400;
    throw err;
  }
  return raw;
}

function parseIncludeTechnicians(query = {}) {
  const raw = query.includeTechnicians;
  if (raw === undefined || raw === null || raw === "") {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sortLiveTechnicians(rows) {
  const statusOrder = {
    [LIVE_TECH_STATUS.ON_SITE]: 0,
    [LIVE_TECH_STATUS.TRAVELLING]: 1,
    [LIVE_TECH_STATUS.WAITING]: 2,
    [LIVE_TECH_STATUS.OFF_DUTY]: 3
  };

  return [...rows].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return String(a.technicianName || "").localeCompare(
      String(b.technicianName || ""),
      undefined,
      { sensitivity: "base" }
    );
  });
}

function parseLiveTechnicianStatusFilter(query = {}) {
  const raw = query.status != null ? String(query.status).trim().toLowerCase() : "all";
  if (!LIVE_TECH_STATUS_FILTERS.includes(raw)) {
    const err = new Error(
      `status must be one of: ${LIVE_TECH_STATUS_FILTERS.join(", ")}`
    );
    err.status = 400;
    throw err;
  }
  return raw;
}

async function loadBranchTechnicians(tenantid, branchid) {
  const memberships = await prisma.userorganizations.findMany({
    where: {
      ...branchScope(tenantid, branchid),
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
          isactive: true,
          technicianaffiliation: true,
          companyname: true
        }
      }
    },
    orderBy: { userid: "asc" }
  });

  return memberships
    .map((membership) => membership.users_userorganizations_useridTousers)
    .filter((user) => user && user.usertype === "technician" && user.isactive !== false);
}

function resolveTechnicianStatus(userid, activity) {
  if (activity.onSiteByUser.has(userid)) {
    return TECHNICIAN_STATUS.ON_SITE;
  }
  if (activity.travelingByUser.has(userid)) {
    return TECHNICIAN_STATUS.TRAVELING;
  }
  return TECHNICIAN_STATUS.OFFLINE;
}

function buildTechnicianRow(user, activity, lastLocations) {
  const status = resolveTechnicianStatus(user.userid, activity);
  const onSiteSession = activity.onSiteByUser.get(user.userid) ?? null;
  const travelSession = activity.travelingByUser.get(user.userid) ?? null;
  const activeSession = onSiteSession || travelSession;

  return {
    userid: user.userid,
    name: user.name,
    email: user.email,
    ...formatTechnicianAffiliationFields(user),
    status,
    currentJob: formatJobRef(activeSession?.job ?? null),
    sessionStartedAt: activeSession?.startedat ?? null,
    lastLocation: formatLocation(lastLocations.get(user.userid))
  };
}

function buildTechnicianSummary(rows) {
  return {
    all: rows.length,
    offline: rows.filter((row) => row.status === TECHNICIAN_STATUS.OFFLINE).length,
    onSite: rows.filter((row) => row.status === TECHNICIAN_STATUS.ON_SITE).length,
    traveling: rows.filter((row) => row.status === TECHNICIAN_STATUS.TRAVELING).length
  };
}

function sortTechnicians(rows) {
  const statusOrder = {
    [TECHNICIAN_STATUS.ON_SITE]: 0,
    [TECHNICIAN_STATUS.TRAVELING]: 1,
    [TECHNICIAN_STATUS.OFFLINE]: 2
  };

  return [...rows].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base"
    });
  });
}

function parseTechnicianStatusFilter(query = {}) {
  const raw = query.status != null ? String(query.status).trim().toLowerCase() : "all";
  if (!TECHNICIAN_STATUS_FILTERS.includes(raw)) {
    const err = new Error(
      `status must be one of: ${TECHNICIAN_STATUS_FILTERS.join(", ")}`
    );
    err.status = 400;
    throw err;
  }
  return raw;
}

function parseManagerListLimit(query = {}) {
  return Math.min(
    Math.max(Number(query.limit || DEFAULT_MANAGER_LIST_LIMIT), 1),
    MAX_MANAGER_LIST_LIMIT
  );
}

function parseManagerListFilter(query = {}) {
  const raw = query.list != null ? String(query.list).trim() : "all";
  if (raw === "all") return "all";
  if (MANAGER_LIST_KEYS.includes(raw)) return raw;
  const err = new Error(`list must be one of: all, ${MANAGER_LIST_KEYS.join(", ")}`);
  err.status = 400;
  throw err;
}

function isManagerJobOverdue(job, detail, now) {
  if (job.iscompleted === true) return false;

  const todayStart = startOfUtcDay(now);
  if (job.date) {
    const jobDate = new Date(job.date);
    if (jobDate < todayStart) return true;
  }

  if (detail?.assignedat && job.estimatedcompletedtime != null) {
    const deadline = new Date(detail.assignedat);
    deadline.setMinutes(deadline.getMinutes() + Number(job.estimatedcompletedtime));
    if (now > deadline) return true;
  }

  return false;
}

function isAwaitingResponse(job) {
  return (
    job.iscompleted !== true &&
    job.isfirstresponse === true &&
    job.isacknowledged !== true
  );
}

function isNoFirstResponse(job) {
  return job.iscompleted !== true && job.isfirstresponse !== true;
}

function mapManagerJobRow(job, now, flags = {}) {
  const detail = job.jobdetails?.[0] ?? null;
  return {
    jobId: job.recno,
    jobCode: job.code ?? null,
    jobManualCode: job.manualjobno ?? null,
    jobDate: job.date ?? null,
    customerName: job.customers?.name ?? null,
    technicianId: job.users?.userid ?? job.assignedto ?? null,
    technicianName: job.users?.name ?? null,
    faultName: job.jobsubcategories?.name ?? null,
    assignedAt: detail?.assignedat ?? null,
    firstResponseAt: detail?.firstresponseat ?? null,
    estimatedCompletedMinutes: job.estimatedcompletedtime ?? null,
    isOverdue: flags.isOverdue === true,
    isAcknowledged: job.isacknowledged === true,
    hasFirstResponse: job.isfirstresponse === true
  };
}

function sortManagerJobs(rows) {
  return [...rows].sort((a, b) => {
    const dateA = a.jobDate ? new Date(a.jobDate).getTime() : 0;
    const dateB = b.jobDate ? new Date(b.jobDate).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;
    return Number(a.jobId) - Number(b.jobId);
  });
}

async function loadManagerTechnicianActivity(tenantid, branchid, managerScope) {
  const scope = branchScope(tenantid, branchid);

  const [travelRows, workRows] = await Promise.all([
    prisma.jobtravelhistory.findMany({
      where: {
        ...scope,
        stopedat: null,
        traveledby: { not: null },
        job: { is: managerScope }
      },
      include: { job: { select: JOB_REF_SELECT } },
      orderBy: { startedat: "desc" }
    }),
    prisma.jobworklhistory.findMany({
      where: {
        ...scope,
        stopedat: null,
        workedby: { not: null },
        job: { is: managerScope }
      },
      include: { job: { select: JOB_REF_SELECT } },
      orderBy: { startedat: "desc" }
    })
  ]);

  return {
    onSiteByUser: latestOpenSessionByUser(workRows, "workedby"),
    travelingByUser: latestOpenSessionByUser(travelRows, "traveledby")
  };
}

async function loadManagerTechnicianIds(managerScope, todayRange) {
  const [assignedJobs, completionsToday, workToday] = await Promise.all([
    prisma.job.findMany({
      where: { ...managerScope, assignedto: { not: null } },
      select: { assignedto: true }
    }),
    prisma.jobdetails.findMany({
      where: {
        tenantid: managerScope.tenantid,
        branchid: managerScope.branchid,
        completedat: dateInRange(todayRange),
        completedby: { not: null },
        job: { is: managerScope }
      },
      select: { completedby: true }
    }),
    prisma.jobworklhistory.findMany({
      where: {
        tenantid: managerScope.tenantid,
        branchid: managerScope.branchid,
        workedby: { not: null },
        job: { is: managerScope },
        OR: [
          { startedat: dateInRange(todayRange) },
          { stopedat: dateInRange(todayRange) }
        ]
      },
      select: { workedby: true }
    })
  ]);

  const ids = new Set();
  assignedJobs.forEach((job) => ids.add(job.assignedto));
  completionsToday.forEach((row) => ids.add(row.completedby));
  workToday.forEach((row) => ids.add(row.workedby));
  return [...ids].filter(Boolean);
}

async function resolveManagerTechnicianIds(managerScope, todayRange, tenantid, branchid) {
  if (Object.prototype.hasOwnProperty.call(managerScope, "faultid")) {
    return loadManagerTechnicianIds(managerScope, todayRange);
  }

  const technicians = await loadBranchTechnicians(tenantid, branchid);
  return technicians.map((tech) => tech.userid).filter(Boolean);
}

function resolveManagerTechnicianStatus(userid, activity, attendanceByUser) {
  if (activity.onSiteByUser.has(userid)) {
    return MANAGER_TECH_STATUS.ON_SITE;
  }
  if (activity.travelingByUser.has(userid)) {
    return MANAGER_TECH_STATUS.TRAVELLING;
  }

  const session = attendanceByUser.get(userid);
  if (session?.isopen && (session.status === "checked_in" || session.status === "on_break")) {
    return MANAGER_TECH_STATUS.IDLE;
  }

  return MANAGER_TECH_STATUS.OFFLINE;
}

function activeJobCodeForTechnician(userid, activity) {
  const onSite = activity.onSiteByUser.get(userid);
  const travel = activity.travelingByUser.get(userid);
  const job = onSite?.job || travel?.job || null;
  return job?.code ?? null;
}

function minutesOverlappingToday(startAt, endAt, todayRange, now) {
  if (!startAt) return 0;
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : now;
  const windowStart = todayRange.start.getTime();
  const windowEnd = todayRange.end.getTime();
  const overlapStart = Math.max(start.getTime(), windowStart);
  const overlapEnd = Math.min(end.getTime(), windowEnd);
  return Math.max(0, (overlapEnd - overlapStart) / 60000);
}

function roundHoursFromMinutes(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

function pluralWord(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function formatManagerSummaryText(teamMembers, metrics) {
  const names =
    teamMembers.length > 0
      ? teamMembers.map((member) => member.name).join(", ")
      : "No technicians assigned";
  const techniciansLabel = pluralWord(metrics.technicians, "technician", "technicians");
  const openJobsLabel = pluralWord(metrics.openJobs, "open job", "open jobs");
  const approvalsLabel =
    metrics.pendingApprovals === 1
      ? "approval awaiting your action"
      : "approvals awaiting your action";

  return `My Team: ${names} · ${metrics.technicians} ${techniciansLabel} · ${metrics.openJobs} ${openJobsLabel} · ${metrics.completedToday} completed today · ${metrics.pendingApprovals} ${approvalsLabel}`;
}

async function loadManagerTeamMembers(userIds) {
  if (!userIds.length) {
    return [];
  }

  const users = await prisma.users.findMany({
    where: {
      userid: { in: userIds },
      isactive: { not: false },
      isdeleted: { not: true }
    },
    select: { userid: true, name: true },
    orderBy: { name: "asc" }
  });

  return users.map((user) => ({
    userId: user.userid,
    name: user.name?.trim() || "Unnamed User"
  }));
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalText(value) {
  if (value == null || String(value).trim() === "") return undefined;
  return String(value).trim();
}

function buildActiveJobsPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(
    Math.max(Number(query.pageSize || query.limit || DEFAULT_ACTIVE_JOBS_PAGE_SIZE), 1),
    MAX_ACTIVE_JOBS_PAGE_SIZE
  );
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

async function buildActiveJobsWhere(auth, query = {}) {
  const scope = await buildJobScope(auth, query);
  const where = {
    ...jobScopeWhere(scope),
    iscompleted: { not: true }
  };

  const customerName = parseOptionalText(query.customerName ?? query.customername);
  if (customerName) {
    where.customers = {
      name: { contains: customerName, mode: "insensitive" }
    };
  }

  const statusId = parseOptionalInt(query.statusId ?? query.statusid);
  if (statusId !== undefined) {
    where.statusid = statusId;
  }

  const statusName = parseOptionalText(query.status ?? query.statusName ?? query.statusname);
  if (statusName && statusId === undefined) {
    where.jobstatuses = {
      title: { contains: statusName, mode: "insensitive" }
    };
  }

  const faultId = parseOptionalInt(query.faultId ?? query.faultid);
  if (faultId !== undefined) {
    where.faultid = faultId;
  }

  const faultName = parseOptionalText(query.faultName ?? query.faultname ?? query.fault);
  if (faultName && faultId === undefined) {
    where.jobsubcategories = {
      name: { contains: faultName, mode: "insensitive" }
    };
  }

  return { where, scope };
}

function mapActiveJobRow(job) {
  const hierarchy = buildJobHierarchyFields(job);
  return {
    jobId: job.recno,
    jobNo: job.code ?? null,
    customerId: job.customers?.customerid ?? job.customerid ?? null,
    customerName: job.customers?.name ?? null,
    groupName: hierarchy.serviceName,
    categoryName: hierarchy.categoryName,
    faultName: hierarchy.faultName,
    technicianAssignedName: job.users?.name ?? null,
    priority: job.priority ?? null,
    priorityColor: resolvePriorityColor(job.priority),
    status: job.jobstatuses?.title ?? null,
    statusColor: job.jobstatuses?.color ?? null
  };
}

function parseTodayJobsFilter(query = {}) {
  const raw = String(query.filter ?? query.status ?? TODAY_JOBS_FILTER.ALL)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const compact = raw.replace(/\s+/g, "");
  const mapped =
    TODAY_JOBS_FILTER_ALIASES[raw] ||
    TODAY_JOBS_FILTER_ALIASES[compact] ||
    (TODAY_JOBS_FILTERS.includes(raw) ? raw : null);

  if (!mapped) {
    const err = new Error(`filter must be one of: ${TODAY_JOBS_FILTERS.join(", ")}`);
    err.status = 400;
    throw err;
  }
  return mapped;
}

function buildTodayJobsBaseWhere(scope, todayRange) {
  return {
    ...jobScopeWhere(scope),
    date: dateInRange(todayRange)
  };
}

function buildTodayJobsFilterWhere(baseWhere, filter) {
  switch (filter) {
    case TODAY_JOBS_FILTER.PENDING:
      return { ...baseWhere, iscompleted: { not: true } };
    case TODAY_JOBS_FILTER.APPROVED_QUOTATION:
      return { ...baseWhere, quotationstatus: QUOTATION_STATUS.APPROVED };
    case TODAY_JOBS_FILTER.REJECTED_QUOTATION:
      return { ...baseWhere, quotationstatus: QUOTATION_STATUS.REJECTED };
    case TODAY_JOBS_FILTER.PENDING_QUOTATIONS:
      return {
        ...baseWhere,
        quotationstatus: {
          in: [QUOTATION_STATUS.CREATED, QUOTATION_STATUS.SENT]
        }
      };
    default:
      return baseWhere;
  }
}

function mapTodayJobRow(job) {
  return {
    ...mapActiveJobRow(job),
    ...formatQuotationStatusFields(job.quotationstatus),
    isCompleted: job.iscompleted === true
  };
}

function formatHoursLabel(hours) {
  if (hours == null || !Number.isFinite(hours)) return null;
  const rounded = Math.round(hours * 100) / 100;
  const unit = rounded === 1 ? "Hour" : "Hours";
  return `${rounded} ${unit}`;
}

function computeCompletionDurationHours(detail) {
  if (!detail?.completedat) return null;

  const end = new Date(detail.completedat);
  const startSource =
    detail.assignedat ??
    detail.firstresponseat ??
    (detail.job?.date ? new Date(detail.job.date) : null);

  if (!startSource) return null;

  const start = new Date(startSource);
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return hours >= 0 ? hours : null;
}

function computeResolutionDurationHours(detail) {
  if (!detail?.resolvedat) return null;

  const end = new Date(detail.resolvedat);
  const startSource =
    detail.assignedat ??
    detail.firstresponseat ??
    detail.createdat ??
    (detail.job?.date ? new Date(detail.job.date) : null);

  if (!startSource) return null;

  const start = new Date(startSource);
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return hours >= 0 ? hours : null;
}

function averageHours(values) {
  if (!values.length) return 0;
  const total = values.reduce((sum, hours) => sum + hours, 0);
  return Math.round((total / values.length) * 100) / 100;
}

function buildAvgResolutionCategoryRow(categoryId, categoryName, color, durations) {
  const avgResolutionHours = averageHours(durations);
  return {
    categoryId,
    categoryName,
    color: color ?? null,
    avgResolutionHours,
    avgResolutionLabel: formatHoursLabel(avgResolutionHours),
    sampleSize: durations.length
  };
}

function detectJobReopenTimestamps(workSessions, completedAt) {
  if (!completedAt || !workSessions.length) {
    return [];
  }

  const sorted = workSessions
    .filter((session) => session.startedat)
    .sort((a, b) => new Date(a.startedat) - new Date(b.startedat));
  if (!sorted.length) {
    return [];
  }

  const completionMs = new Date(completedAt).getTime();
  const reopenTimestamps = [];

  sorted.forEach((session, index) => {
    const startMs = new Date(session.startedat).getTime();
    if (startMs > completionMs) {
      reopenTimestamps.push(session.startedat);
      return;
    }

    if (index === 0) {
      return;
    }

    const previousStop = sorted[index - 1].stopedat
      ? new Date(sorted[index - 1].stopedat).getTime()
      : null;
    if (previousStop != null && startMs > previousStop && completionMs > startMs) {
      reopenTimestamps.push(session.startedat);
    }
  });

  return reopenTimestamps;
}

function groupWorkSessionsByJob(workSessions) {
  const byJobId = new Map();
  workSessions.forEach((session) => {
    if (!session.jobid) return;
    const jobId = Number(session.jobid);
    if (!byJobId.has(jobId)) {
      byJobId.set(jobId, []);
    }
    byJobId.get(jobId).push(session);
  });
  return byJobId;
}

function buildMonthlyReopeningMetrics(
  monthRanges,
  completedInPeriod,
  allCompletedDetails,
  workByJobId
) {
  const completedByMonth = monthRanges.map(() => new Set());
  const reopenedByMonth = monthRanges.map(() => new Set());

  completedInPeriod.forEach((detail) => {
    if (!detail.jobid || !detail.completedat) return;

    monthRanges.forEach((range, index) => {
      if (isTimestampInRange(detail.completedat, range)) {
        completedByMonth[index].add(Number(detail.jobid));
      }
    });
  });

  allCompletedDetails.forEach((detail) => {
    if (!detail.jobid || !detail.completedat) return;

    const workSessions = workByJobId.get(Number(detail.jobid)) ?? [];
    const reopenTimestamps = detectJobReopenTimestamps(workSessions, detail.completedat);
    reopenTimestamps.forEach((timestamp) => {
      monthRanges.forEach((range, index) => {
        if (isTimestampInRange(timestamp, range)) {
          reopenedByMonth[index].add(Number(detail.jobid));
        }
      });
    });
  });

  return monthRanges.map((range, index) => {
    const completedTickets = completedByMonth[index].size;
    const reopenedTickets = reopenedByMonth[index].size;
    const reopenRate = completedTickets
      ? Math.round((reopenedTickets / completedTickets) * 10000) / 100
      : 0;

    return {
      month: range.month,
      label: range.label,
      completedTickets,
      reopenedTickets,
      reopenRate
    };
  });
}

async function computeAvgCompletionHours(scope, range) {
  const details = await prisma.jobdetails.findMany({
    where: jobDetailsScopeWhere(scope, {
      completedat: dateInRange(range)
    }),
    select: {
      assignedat: true,
      firstresponseat: true,
      completedat: true,
      job: { select: { date: true } }
    }
  });

  const durations = details
    .map((detail) => computeCompletionDurationHours(detail))
    .filter((hours) => hours != null);

  if (!durations.length) {
    return { value: 0, label: "0 Hours", sampleSize: 0 };
  }

  const average = durations.reduce((sum, hours) => sum + hours, 0) / durations.length;
  const value = Math.round(average * 100) / 100;

  return {
    value,
    label: formatHoursLabel(value),
    sampleSize: durations.length
  };
}

function buildActivityPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(
    Math.max(Number(query.pageSize || query.limit || DEFAULT_ACTIVITY_PAGE_SIZE), 1),
    MAX_ACTIVITY_PAGE_SIZE
  );
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

function displayJobCode(job) {
  if (!job) return "—";
  if (job.code != null && String(job.code).trim() !== "") {
    return String(job.code).trim();
  }
  if (job.manualjobno != null && String(job.manualjobno).trim() !== "") {
    return String(job.manualjobno).trim();
  }
  if (job.recno != null) {
    return String(job.recno).padStart(6, "0");
  }
  return "—";
}

function technicianDisplayName(user, fallbackId) {
  if (user?.name != null && String(user.name).trim() !== "") {
    return String(user.name).trim();
  }
  if (fallbackId != null) {
    return `Technician #${fallbackId}`;
  }
  return "Technician";
}

function buildActivityMessage(type, technicianName, jobCode, extra = {}) {
  const code = jobCode || "—";
  switch (type) {
    case ACTIVITY_TYPE.TRAVEL_STARTED:
      return `${technicianName} started travelling on Job #${code}`;
    case ACTIVITY_TYPE.TRAVEL_STOPPED:
      return `${technicianName} stopped travelling on Job #${code}`;
    case ACTIVITY_TYPE.WORK_STARTED:
      return `${technicianName} started work on Job #${code}`;
    case ACTIVITY_TYPE.WORK_STOPPED:
      return `${technicianName} stopped work on Job #${code}`;
    case ACTIVITY_TYPE.JOB_COMPLETED:
      return `${technicianName} completed Job #${code}`;
    case ACTIVITY_TYPE.JOB_RESOLVED:
      return `${technicianName} resolved Job #${code}`;
    case ACTIVITY_TYPE.JOB_ACKNOWLEDGED:
      return `${technicianName} acknowledged Job #${code}`;
    case ACTIVITY_TYPE.QUOTATION_STATUS_CHANGED: {
      const statusLabel = extra.quotationStatusName || "updated";
      return `${technicianName} updated quotation on Job #${code} to ${statusLabel}`;
    }
    default:
      return `${technicianName} performed an action on Job #${code}`;
  }
}

function createActivityEvent({
  id,
  type,
  at,
  technicianId,
  technicianName,
  job,
  remarks,
  extra = {}
}) {
  const jobId = job?.recno ?? job?.jobid ?? null;
  const jobCode = displayJobCode(job);
  const jobManualCode = job?.manualjobno ?? null;
  const atIso = at instanceof Date ? at.toISOString() : at ?? null;

  return {
    id,
    type,
    at: atIso,
    message: buildActivityMessage(type, technicianName, jobCode, extra),
    technicianId: technicianId ?? null,
    technicianName,
    jobId,
    jobCode,
    jobManualCode,
    remarks: remarks ?? null,
    ...extra
  };
}

function sortActivityEvents(events) {
  return [...events].sort((a, b) => {
    const timeA = a.at ? new Date(a.at).getTime() : 0;
    const timeB = b.at ? new Date(b.at).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id).localeCompare(String(a.id));
  });
}

async function resolveActivityActorIds(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);
  const technicians = await loadBranchTechnicians(tenantid, branchid);
  const technicianIds = technicians.map((tech) => tech.userid).filter(Boolean);

  const access = await resolveDashboardAccess(auth);
  if (access.canView) {
    return technicianIds;
  }

  if (await isJobAdmin(auth)) {
    return technicianIds;
  }

  const selfId = Number(auth.userid);
  return technicianIds.includes(selfId) ? [selfId] : [];
}

function actorWhere(actorIds) {
  return actorIds.length ? { in: actorIds } : { in: [-1] };
}

async function countActivityEvents(scope, actorIds) {
  const actors = actorWhere(actorIds);

  const [
    travelStarted,
    travelStopped,
    workStarted,
    workStopped,
    completed,
    resolved,
    acknowledged,
    quotation
  ] = await Promise.all([
    prisma.jobtravelhistory.count({
      where: { ...scope, startedat: { not: null }, traveledby: actors }
    }),
    prisma.jobtravelhistory.count({
      where: { ...scope, stopedat: { not: null }, traveledby: actors }
    }),
    prisma.jobworklhistory.count({
      where: { ...scope, startedat: { not: null }, workedby: actors }
    }),
    prisma.jobworklhistory.count({
      where: { ...scope, stopedat: { not: null }, workedby: actors }
    }),
    prisma.jobdetails.count({
      where: { ...scope, completedat: { not: null }, completedby: actors }
    }),
    prisma.jobdetails.count({
      where: { ...scope, resolvedat: { not: null }, resolvedby: actors }
    }),
    prisma.jobdetails.count({
      where: { ...scope, acknowledgedat: { not: null }, acknowledgedby: actors }
    }),
    prisma.jobquotationstatuslog.count({
      where: { ...scope, changedat: { not: null }, changedby: actors }
    })
  ]);

  return (
    travelStarted +
    travelStopped +
    workStarted +
    workStopped +
    completed +
    resolved +
    acknowledged +
    quotation
  );
}

async function collectActivityEvents(scope, actorIds, fetchLimit) {
  const actors = actorWhere(actorIds);

  const [
    travelStartedRows,
    travelStoppedRows,
    workStartedRows,
    workStoppedRows,
    completedRows,
    resolvedRows,
    acknowledgedRows,
    quotationRows
  ] = await Promise.all([
    prisma.jobtravelhistory.findMany({
      where: { ...scope, startedat: { not: null }, traveledby: actors },
      include: {
        users: { select: ACTIVITY_USER_SELECT },
        job: { select: JOB_REF_SELECT }
      },
      orderBy: { startedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobtravelhistory.findMany({
      where: { ...scope, stopedat: { not: null }, traveledby: actors },
      include: {
        users: { select: ACTIVITY_USER_SELECT },
        job: { select: JOB_REF_SELECT }
      },
      orderBy: { stopedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobworklhistory.findMany({
      where: { ...scope, startedat: { not: null }, workedby: actors },
      include: {
        users: { select: ACTIVITY_USER_SELECT },
        job: { select: JOB_REF_SELECT }
      },
      orderBy: { startedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobworklhistory.findMany({
      where: { ...scope, stopedat: { not: null }, workedby: actors },
      include: {
        users: { select: ACTIVITY_USER_SELECT },
        job: { select: JOB_REF_SELECT }
      },
      orderBy: { stopedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobdetails.findMany({
      where: { ...scope, completedat: { not: null }, completedby: actors },
      include: {
        job: { select: JOB_REF_SELECT },
        users_jobdetails_completedbyTousers: { select: ACTIVITY_USER_SELECT }
      },
      orderBy: { completedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobdetails.findMany({
      where: { ...scope, resolvedat: { not: null }, resolvedby: actors },
      include: {
        job: { select: JOB_REF_SELECT },
        users_jobdetails_resolvedbyTousers: { select: ACTIVITY_USER_SELECT }
      },
      orderBy: { resolvedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobdetails.findMany({
      where: { ...scope, acknowledgedat: { not: null }, acknowledgedby: actors },
      include: {
        job: { select: JOB_REF_SELECT },
        users_jobdetails_acknowledgedbyTousers: { select: ACTIVITY_USER_SELECT }
      },
      orderBy: { acknowledgedat: "desc" },
      take: fetchLimit
    }),
    prisma.jobquotationstatuslog.findMany({
      where: { ...scope, changedat: { not: null }, changedby: actors },
      include: {
        changedbyuser: { select: ACTIVITY_USER_SELECT },
        job: { select: JOB_REF_SELECT }
      },
      orderBy: { changedat: "desc" },
      take: fetchLimit
    })
  ]);

  const events = [];

  travelStartedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `travel-started-${row.recno}`,
        type: ACTIVITY_TYPE.TRAVEL_STARTED,
        at: row.startedat,
        technicianId: row.traveledby,
        technicianName: technicianDisplayName(row.users, row.traveledby),
        job: row.job,
        remarks: row.remarks
      })
    );
  });

  travelStoppedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `travel-stopped-${row.recno}`,
        type: ACTIVITY_TYPE.TRAVEL_STOPPED,
        at: row.stopedat,
        technicianId: row.traveledby,
        technicianName: technicianDisplayName(row.users, row.traveledby),
        job: row.job,
        remarks: row.remarks
      })
    );
  });

  workStartedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `work-started-${row.recno}`,
        type: ACTIVITY_TYPE.WORK_STARTED,
        at: row.startedat,
        technicianId: row.workedby,
        technicianName: technicianDisplayName(row.users, row.workedby),
        job: row.job,
        remarks: row.remarks
      })
    );
  });

  workStoppedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `work-stopped-${row.recno}`,
        type: ACTIVITY_TYPE.WORK_STOPPED,
        at: row.stopedat,
        technicianId: row.workedby,
        technicianName: technicianDisplayName(row.users, row.workedby),
        job: row.job,
        remarks: row.remarks
      })
    );
  });

  completedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `job-completed-${row.recno}`,
        type: ACTIVITY_TYPE.JOB_COMPLETED,
        at: row.completedat,
        technicianId: row.completedby,
        technicianName: technicianDisplayName(
          row.users_jobdetails_completedbyTousers,
          row.completedby
        ),
        job: row.job,
        remarks: row.completedremarks
      })
    );
  });

  resolvedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `job-resolved-${row.recno}`,
        type: ACTIVITY_TYPE.JOB_RESOLVED,
        at: row.resolvedat,
        technicianId: row.resolvedby,
        technicianName: technicianDisplayName(
          row.users_jobdetails_resolvedbyTousers,
          row.resolvedby
        ),
        job: row.job,
        remarks: row.resolvedremarks
      })
    );
  });

  acknowledgedRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `job-acknowledged-${row.recno}`,
        type: ACTIVITY_TYPE.JOB_ACKNOWLEDGED,
        at: row.acknowledgedat,
        technicianId: row.acknowledgedby,
        technicianName: technicianDisplayName(
          row.users_jobdetails_acknowledgedbyTousers,
          row.acknowledgedby
        ),
        job: row.job,
        remarks: row.acknowledgedremarks
      })
    );
  });

  quotationRows.forEach((row) => {
    events.push(
      createActivityEvent({
        id: `quotation-status-${row.recno}`,
        type: ACTIVITY_TYPE.QUOTATION_STATUS_CHANGED,
        at: row.changedat,
        technicianId: row.changedby,
        technicianName: technicianDisplayName(row.changedbyuser, row.changedby),
        job: row.job,
        remarks: row.remarks,
        extra: {
          quotationStatus: row.tostatus ?? null,
          quotationStatusName: quotationStatusLabel(row.tostatus)
        }
      })
    );
  });

  return sortActivityEvents(events);
}

function jobScopeWhere(scope) {
  const where = {
    tenantid: scope.tenantid,
    branchid: scope.branchid
  };
  if (scope.assignedto != null) {
    where.assignedto = scope.assignedto;
  }
  return where;
}

function jobDetailsScopeWhere(scope, extra = {}) {
  const where = {
    tenantid: scope.tenantid,
    branchid: scope.branchid,
    ...extra
  };
  if (scope.assignedto != null) {
    where.job = { is: jobScopeWhere(scope) };
  }
  return where;
}

async function buildJobScope(auth, query = {}) {
  const access = await resolveDashboardAccess(auth);
  const scope = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };

  if (!access.canView) {
    scope.assignedto = -1;
    return scope;
  }

  const scopeMode = String(query.scope || "all").toLowerCase();
  if (scopeMode === "my") {
    scope.assignedto = Number(auth.userid);
  }

  return scope;
}

async function countJobsOnDate(scope, range) {
  return prisma.job.count({
    where: {
      ...jobScopeWhere(scope),
      date: dateInRange(range)
    }
  });
}

async function countCompletedOnDate(scope, range) {
  return prisma.jobdetails.count({
    where: jobDetailsScopeWhere(scope, {
      completedat: dateInRange(range)
    })
  });
}

async function countOpenJobsOnDate(scope, range) {
  const base = {
    ...jobScopeWhere(scope),
    date: dateInRange(range),
    iscompleted: { not: true }
  };

  const [pending, inProgress] = await Promise.all([
    prisma.job.count({
      where: { ...base, isfirstresponse: { not: true } }
    }),
    prisma.job.count({
      where: { ...base, isfirstresponse: true }
    })
  ]);

  return { pending, inProgress, total: pending + inProgress };
}

async function countJobSummaryBucket(scope, range = null) {
  const where = { ...jobScopeWhere(scope) };
  if (range) {
    where.date = dateInRange(range);
  }

  const [total, resolved, inProgress] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.count({ where: { ...where, isresolved: true } }),
    prisma.job.count({ where: { ...where, isresolved: { not: true } } })
  ]);

  return { total, resolved, inProgress };
}

async function countUnacknowledgedJobs(scope) {
  return prisma.job.count({
    where: {
      ...jobScopeWhere(scope),
      isacknowledged: { not: true }
    }
  });
}

async function countActiveTechnicians(tenantid, branchid) {
  const activity = await loadTechnicianActivity(tenantid, branchid);
  const technicians = await loadBranchTechnicians(tenantid, branchid);

  let traveling = 0;
  let onSite = 0;

  technicians.forEach((tech) => {
    const status = resolveTechnicianStatus(tech.userid, activity);
    if (status === TECHNICIAN_STATUS.ON_SITE) onSite += 1;
    else if (status === TECHNICIAN_STATUS.TRAVELING) traveling += 1;
  });

  return {
    value: onSite + traveling,
    traveling,
    onSite
  };
}

class DashboardService {
  async section1(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const yesterday = new Date(todayRange.start);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayRange = utcDayRange(yesterday);

    const scope = await buildJobScope(auth, query);

    const [
      totalJobsToday,
      totalJobsYesterday,
      completedJobsToday,
      completedJobsYesterday,
      openJobsToday,
      unacknowledgedJobs,
      activeTechnicians,
      pendingApprovalResult
    ] = await Promise.all([
      countJobsOnDate(scope, todayRange),
      countJobsOnDate(scope, yesterdayRange),
      countCompletedOnDate(scope, todayRange),
      countCompletedOnDate(scope, yesterdayRange),
      countOpenJobsOnDate(scope, todayRange),
      countUnacknowledgedJobs(scope),
      countActiveTechnicians(auth.tenantid, auth.branchid),
      jobApprovalService.listPending(auth)
    ]);

    const totalJobs = compareDayTrend(totalJobsToday, totalJobsYesterday);
    const completedJobs = compareDayTrend(completedJobsToday, completedJobsYesterday);

    return {
      section: 1,
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      metrics: {
        totalJobsToday: {
          label: "Total Jobs Today",
          value: totalJobs.value,
          trend: totalJobs.trend,
          yesterday: totalJobs.yesterday,
          delta: totalJobs.delta
        },
        openJobsToday: {
          label: "Open Jobs Today",
          value: openJobsToday.total,
          pending: openJobsToday.pending,
          inProgress: openJobsToday.inProgress
        },
        completedJobsToday: {
          label: "Completed Jobs Today",
          value: completedJobs.value,
          trend: completedJobs.trend,
          yesterday: completedJobs.yesterday,
          delta: completedJobs.delta
        },
        pendingApproval: {
          label: "Pending Approval",
          subtitle: "Need Action",
          value: pendingApprovalResult.total ?? 0
        },
        activeTechnicians: {
          label: "Active Technicians",
          subtitle: "Traveling + On Site",
          value: activeTechnicians.value,
          traveling: activeTechnicians.traveling,
          onSite: activeTechnicians.onSite
        },
        unacknowledgedJobs: {
          label: "Unacknowledged Jobs",
          subtitle: "Awaiting acknowledgement",
          value: unacknowledgedJobs
        }
      }
    };
  }

  async jobSummary(auth, query = {}) {
    const now = utcNow();
    const scope = await buildJobScope(auth, query);
    const periods = buildJobSummaryPeriods(now);

    const [overall, today, yesterday, last7Days, last30Days] = await Promise.all([
      countJobSummaryBucket(scope, null),
      countJobSummaryBucket(scope, periods.today),
      countJobSummaryBucket(scope, periods.yesterday),
      countJobSummaryBucket(scope, periods.last7Days),
      countJobSummaryBucket(scope, periods.last30Days)
    ]);

    return {
      asOf: now.toISOString(),
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      scope: scope.assignedto != null ? "my" : "all",
      ...buildJobSummaryPeriodsResponse(
        periods,
        { overall, today, yesterday, last7Days, last30Days },
        now
      )
    };
  }

  async technicians(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const statusFilter = parseTechnicianStatusFilter(query);
    const now = utcNow();

    const [technicians, activity] = await Promise.all([
      loadBranchTechnicians(tenantid, branchid),
      loadTechnicianActivity(tenantid, branchid)
    ]);

    const userIds = technicians.map((tech) => tech.userid);
    const lastLocations = await fetchLatestLocationsByUser(tenantid, branchid, userIds);

    const allRows = sortTechnicians(
      technicians.map((tech) => buildTechnicianRow(tech, activity, lastLocations))
    );
    const summary = buildTechnicianSummary(allRows);
    const techniciansList =
      statusFilter === "all"
        ? allRows
        : allRows.filter((row) => row.status === statusFilter);

    return {
      asOf: now.toISOString(),
      tenantid,
      branchid,
      filter: statusFilter,
      summary,
      technicians: techniciansList
    };
  }

  async techniciansLiveStatus(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const statusFilter = parseLiveTechnicianStatusFilter(query);
    const now = utcNow();

    const technicians = await loadBranchTechnicians(tenantid, branchid);
    const userIds = technicians.map((tech) => tech.userid);

    const [
      activity,
      openAttendanceByUser,
      latestAttendanceByUser,
      lastCompletedByUser,
      lastLocations
    ] = await Promise.all([
      loadLiveTechnicianActivity(tenantid, branchid),
      fetchOpenAttendanceByUser(tenantid, branchid, userIds),
      fetchLatestAttendanceByUser(tenantid, branchid, userIds),
      fetchLastCompletedJobsByUser(tenantid, branchid, userIds),
      fetchLatestLocationsByUser(tenantid, branchid, userIds)
    ]);

    const allRows = sortLiveTechnicians(
      technicians.map((tech) =>
        buildLiveTechnicianRow(
          tech,
          activity,
          openAttendanceByUser,
          latestAttendanceByUser,
          lastCompletedByUser,
          lastLocations
        )
      )
    );
    const summary = buildLiveTechnicianSummary(allRows);
    const techniciansList =
      statusFilter === "all"
        ? allRows
        : allRows.filter((row) => row.status === statusFilter);

    return {
      asOf: now.toISOString(),
      tenantid,
      branchid,
      title: "ALL TECHNICIANS — LIVE STATUS",
      filter: statusFilter,
      summary,
      technicians: techniciansList
    };
  }

  async technicianStats(auth, query = {}) {
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const statusFilter = parseTechnicianStatsStatusFilter(query);
    const includeTechnicians = parseIncludeTechnicians(query);
    const now = utcNow();
    const todayRange = utcDayRange(now);

    const technicians = await loadBranchTechnicians(tenantid, branchid);
    const userIds = technicians.map((tech) => tech.userid);

    const [activity, openAttendanceByUser, checkedInTodayUserIds] = await Promise.all([
      loadTechnicianActivity(tenantid, branchid),
      fetchOpenAttendanceByUser(tenantid, branchid, userIds),
      fetchCheckedInTodayUserIds(tenantid, branchid, userIds, todayRange)
    ]);

    const allRows = sortTechnicianStatsRows(
      technicians.map((tech) =>
        buildTechnicianStatsRow(tech, activity, openAttendanceByUser, checkedInTodayUserIds)
      )
    );
    const summary = buildTechnicianStatsSummary(allRows, checkedInTodayUserIds);

    const response = {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      tenantid,
      branchid,
      title: "TECHNICIAN STATS",
      filter: statusFilter,
      summary
    };

    if (includeTechnicians) {
      response.technicians =
        statusFilter === "all"
          ? allRows
          : allRows.filter((row) => row.status === statusFilter);
    }

    return response;
  }

  async todayJobs(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const statusFilter = parseTodayJobsFilter(query);
    const pagination = buildActiveJobsPagination(query);
    const baseWhere = buildTodayJobsBaseWhere(scope, todayRange);

    const [
      countAll,
      countPending,
      countApprovedQuotation,
      countRejectedQuotation,
      countPendingQuotations,
      rows,
      filteredTotal
    ] = await Promise.all([
      prisma.job.count({ where: baseWhere }),
      prisma.job.count({
        where: buildTodayJobsFilterWhere(baseWhere, TODAY_JOBS_FILTER.PENDING)
      }),
      prisma.job.count({
        where: buildTodayJobsFilterWhere(baseWhere, TODAY_JOBS_FILTER.APPROVED_QUOTATION)
      }),
      prisma.job.count({
        where: buildTodayJobsFilterWhere(baseWhere, TODAY_JOBS_FILTER.REJECTED_QUOTATION)
      }),
      prisma.job.count({
        where: buildTodayJobsFilterWhere(baseWhere, TODAY_JOBS_FILTER.PENDING_QUOTATIONS)
      }),
      prisma.job.findMany({
        where: buildTodayJobsFilterWhere(baseWhere, statusFilter),
        include: ACTIVE_JOB_INCLUDE,
        orderBy: [{ date: "desc" }, { recno: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({
        where: buildTodayJobsFilterWhere(baseWhere, statusFilter)
      })
    ]);

    const summary = {
      all: countAll,
      pending: countPending,
      approvedQuotation: countApprovedQuotation,
      rejectedQuotation: countRejectedQuotation,
      pendingQuotations: countPendingQuotations
    };

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      filter: statusFilter,
      summary,
      statuses: TODAY_JOBS_FILTERS.map((key) => ({
        key,
        label: TODAY_JOBS_FILTER_LABELS[key],
        count: summary[TODAY_JOBS_SUMMARY_KEYS[key]]
      })),
      data: rows.map(mapTodayJobRow),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / pagination.pageSize) || 0
      }
    };
  }

  async jobSummary(auth, query = {}) {
    const now = utcNow();
    const scope = await buildJobScope(auth, query);
    const periods = buildJobSummaryPeriods(now);

    const [overall, today, yesterday, last7Days, last30Days] = await Promise.all([
      countJobSummaryBucket(scope, null),
      countJobSummaryBucket(scope, periods.today),
      countJobSummaryBucket(scope, periods.yesterday),
      countJobSummaryBucket(scope, periods.last7Days),
      countJobSummaryBucket(scope, periods.last30Days)
    ]);

    return {
      asOf: now.toISOString(),
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      scope: scope.assignedto != null ? "my" : "all",
      ...buildJobSummaryPeriodsResponse(
        periods,
        { overall, today, yesterday, last7Days, last30Days },
        now
      )
    };
  }

  async jobPipeline(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const tenantid = Number(auth.tenantid);
    const baseWhere = {
      ...jobScopeWhere(scope),
      date: dateInRange(todayRange)
    };

    const [statusDefinitions, groupedByStatus, totalJobs, unassignedCount] = await Promise.all([
      prisma.jobstatuses.findMany({
        where: { tenantid },
        select: {
          recno: true,
          title: true,
          color: true,
          sort: true
        },
        orderBy: [{ sort: "asc" }, { recno: "asc" }]
      }),
      prisma.job.groupBy({
        by: ["statusid"],
        where: baseWhere,
        _count: { _all: true }
      }),
      prisma.job.count({ where: baseWhere }),
      prisma.job.count({
        where: { ...baseWhere, statusid: null }
      })
    ]);

    const countByStatusId = new Map(
      groupedByStatus.map((row) => [row.statusid, row._count._all])
    );

    const statusItems = statusDefinitions.map((status) => ({
      statusId: status.recno,
      statusName: status.title?.trim() || `Status #${status.recno}`,
      count: countByStatusId.get(status.recno) ?? 0,
      color: status.color ?? null
    }));

    if (unassignedCount > 0) {
      statusItems.push({
        statusId: null,
        statusName: "Unassigned",
        count: unassignedCount,
        color: null
      });
    }

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total: totalJobs,
      statuses: [
        {
          statusId: null,
          statusName: "All",
          count: totalJobs,
          color: null
        },
        ...statusItems
      ]
    };
  }

  async liveActivityFeed(auth, query = {}) {
    const now = utcNow();
    const pagination = buildActivityPagination(query);
    const scope = branchScope(auth.tenantid, auth.branchid);
    const actorIds = await resolveActivityActorIds(auth);
    const fetchLimit = pagination.skip + pagination.pageSize;

    const [total, events] = await Promise.all([
      countActivityEvents(scope, actorIds),
      collectActivityEvents(scope, actorIds, fetchLimit)
    ]);

    const data = events.slice(pagination.skip, pagination.skip + pagination.pageSize);

    return {
      asOf: now.toISOString(),
      data,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      }
    };
  }

  async jobsByGroup(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);

    const groupedJobs = await prisma.job.groupBy({
      by: ["groupid"],
      where: {
        ...jobScopeWhere(scope),
        date: dateInRange(todayRange)
      },
      _count: { _all: true }
    });

    const groupIds = groupedJobs
      .map((row) => row.groupid)
      .filter((id) => id != null);
    const groupsMeta = groupIds.length
      ? await prisma.jobgroups.findMany({
          where: {
            groupid: { in: groupIds },
            tenantid: scope.tenantid,
            branchid: scope.branchid
          },
          select: { groupid: true, name: true, color: true }
        })
      : [];
    const metaByGroupId = new Map(groupsMeta.map((group) => [group.groupid, group]));

    const items = groupedJobs
      .map((row) => {
        const count = row._count._all;
        if (row.groupid == null) {
          return {
            groupName: "Unassigned",
            count,
            color: null
          };
        }

        const meta = metaByGroupId.get(row.groupid);
        return {
          groupName: meta?.name ?? `Group #${row.groupid}`,
          count,
          color: meta?.color ?? null
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.groupName || "").localeCompare(String(b.groupName || ""), undefined, {
          sensitivity: "base"
        });
      });

    const total = items.reduce((sum, row) => sum + row.count, 0);

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total,
      groups: items
    };
  }

  async locationWiseJobs(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const tenantid = Number(auth.tenantid);

    const groupedJobs = await prisma.job.groupBy({
      by: ["city"],
      where: {
        ...jobScopeWhere(scope),
        date: dateInRange(todayRange)
      },
      _count: { _all: true }
    });

    const cityIds = groupedJobs.map((row) => row.city).filter((id) => id != null);
    const citiesMeta = cityIds.length
      ? await prisma.cities.findMany({
          where: {
            recno: { in: cityIds },
            tenantid
          },
          select: { recno: true, name: true }
        })
      : [];
    const metaByCityId = new Map(citiesMeta.map((city) => [city.recno, city]));

    const total = groupedJobs.reduce((sum, row) => sum + row._count._all, 0);

    const cities = groupedJobs
      .map((row) => {
        const count = row._count._all;
        const percentage = total ? Math.round((count / total) * 10000) / 100 : 0;

        if (row.city == null) {
          return {
            cityId: null,
            cityName: "Unassigned",
            count,
            percentage
          };
        }

        const meta = metaByCityId.get(row.city);
        return {
          cityId: row.city,
          cityName: meta?.name ?? `City #${row.city}`,
          count,
          percentage
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.cityName || "").localeCompare(String(b.cityName || ""), undefined, {
          sensitivity: "base"
        });
      });

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total,
      cities
    };
  }

  async categoryWiseJobs(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    const groupedJobs = await prisma.job.groupBy({
      by: ["serviceid"],
      where: {
        ...jobScopeWhere(scope),
        date: dateInRange(todayRange)
      },
      _count: { _all: true }
    });

    const categoryIds = groupedJobs.map((row) => row.serviceid).filter((id) => id != null);
    const categoriesMeta = categoryIds.length
      ? await prisma.jobcategories.findMany({
          where: {
            categoryid: { in: categoryIds },
            tenantid,
            branchid
          },
          select: {
            categoryid: true,
            name: true,
            color: true,
            groupid: true,
            jobgroups: { select: { name: true } }
          }
        })
      : [];
    const metaByCategoryId = new Map(
      categoriesMeta.map((category) => [category.categoryid, category])
    );

    const total = groupedJobs.reduce((sum, row) => sum + row._count._all, 0);

    const categories = groupedJobs
      .map((row) => {
        const count = row._count._all;
        const percentage = total ? Math.round((count / total) * 10000) / 100 : 0;

        if (row.serviceid == null) {
          return {
            categoryId: null,
            categoryName: "Unassigned",
            groupName: null,
            count,
            percentage,
            color: null
          };
        }

        const meta = metaByCategoryId.get(row.serviceid);
        return {
          categoryId: row.serviceid,
          categoryName: meta?.name ?? `Category #${row.serviceid}`,
          groupName: meta?.jobgroups?.name ?? null,
          count,
          percentage,
          color: meta?.color ?? null
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.categoryName || "").localeCompare(
          String(b.categoryName || ""),
          undefined,
          { sensitivity: "base" }
        );
      });

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total,
      categories
    };
  }

  async topFaults(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const limit = Math.min(Math.max(Number(query.limit || 10), 1), 50);

    const groupedJobs = await prisma.job.groupBy({
      by: ["faultid"],
      where: {
        ...jobScopeWhere(scope),
        date: dateInRange(todayRange)
      },
      _count: { _all: true }
    });

    const total = groupedJobs.reduce((sum, row) => sum + row._count._all, 0);
    const faultIds = groupedJobs
      .map((row) => row.faultid)
      .filter((id) => id != null);

    const subcategories = faultIds.length
      ? await prisma.jobsubcategories.findMany({
          where: {
            subcategoryid: { in: faultIds },
            tenantid: scope.tenantid,
            branchid: scope.branchid
          },
          select: {
            subcategoryid: true,
            name: true,
            jobcategories: {
              select: {
                name: true,
                jobgroups: { select: { name: true } }
              }
            }
          }
        })
      : [];
    const metaByFaultId = new Map(
      subcategories.map((sub) => [sub.subcategoryid, sub])
    );

    const items = groupedJobs
      .map((row) => {
        const count = row._count._all;
        const percentage = total ? Math.round((count / total) * 10000) / 100 : 0;

        if (row.faultid == null) {
          return {
            subCategoryName: "Unassigned",
            categoryName: null,
            groupName: null,
            count,
            percentage
          };
        }

        const meta = metaByFaultId.get(row.faultid);
        return {
          subCategoryName: meta?.name ?? `Fault #${row.faultid}`,
          categoryName: meta?.jobcategories?.name ?? null,
          groupName: meta?.jobcategories?.jobgroups?.name ?? null,
          count,
          percentage
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.subCategoryName || "").localeCompare(
          String(b.subCategoryName || ""),
          undefined,
          { sensitivity: "base" }
        );
      })
      .slice(0, limit);

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total,
      limit,
      faults: items
    };
  }

  async technicianPerformance(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const scopeMode = String(query.scope || "all").toLowerCase();
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 100);
    const access = await resolveDashboardAccess(auth);

    const technicians = await loadBranchTechnicians(tenantid, branchid);

    let visibleTechnicians = technicians;
    if (scopeMode === "my") {
      const selfId = Number(auth.userid);
      visibleTechnicians = technicians.filter((tech) => tech.userid === selfId);
    } else if (!access.canView) {
      visibleTechnicians = [];
    }

    const performerIds = visibleTechnicians.map((tech) => tech.userid).filter(Boolean);
    const groupedCompletions = performerIds.length
      ? await prisma.jobdetails.groupBy({
          by: ["completedby"],
          where: {
            ...branchScope(tenantid, branchid),
            completedat: dateInRange(todayRange),
            completedby: { in: performerIds }
          },
          _count: { _all: true }
        })
      : [];

    const countByTechnician = new Map(
      groupedCompletions.map((row) => [row.completedby, row._count._all])
    );
    const totalCompleted = groupedCompletions.reduce(
      (sum, row) => sum + row._count._all,
      0
    );

    const items = visibleTechnicians
      .map((tech) => {
        const completedCount = countByTechnician.get(tech.userid) ?? 0;
        const percentage = totalCompleted
          ? Math.round((completedCount / totalCompleted) * 10000) / 100
          : 0;

        return {
          technicianId: tech.userid,
          technicianName: tech.name ?? null,
          ...formatTechnicianAffiliationFields(tech),
          completedCount,
          percentage
        };
      })
      .sort((a, b) => {
        if (b.completedCount !== a.completedCount) {
          return b.completedCount - a.completedCount;
        }
        return String(a.technicianName || "").localeCompare(
          String(b.technicianName || ""),
          undefined,
          { sensitivity: "base" }
        );
      })
      .slice(0, limit)
      .map((row, index) => ({
        ...row,
        rank: index + 1
      }));

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scopeMode === "my" ? "my" : "all",
      totalCompleted,
      limit,
      technicians: items
    };
  }

  async managerJobs(auth, query = {}) {
    const access = await resolveDashboardAccess(auth);
    const now = utcNow();
    const managerScope = await buildDashboardManagerScope(auth, access);
    const listFilter = parseManagerListFilter(query);
    const listLimit = parseManagerListLimit(query);

    const jobs = await prisma.job.findMany({
      where: {
        ...managerScope,
        iscompleted: { not: true }
      },
      include: MANAGER_JOB_INCLUDE,
      orderBy: [{ date: "asc" }, { recno: "asc" }]
    });

    const lists = {
      awaitingResponse: [],
      overdue: [],
      noFirstResponse: []
    };

    jobs.forEach((job) => {
      const detail = job.jobdetails?.[0] ?? null;
      const overdue = isManagerJobOverdue(job, detail, now);

      if (isAwaitingResponse(job)) {
        lists.awaitingResponse.push(mapManagerJobRow(job, now, { isOverdue: overdue }));
      }
      if (overdue) {
        lists.overdue.push(mapManagerJobRow(job, now, { isOverdue: true }));
      }
      if (isNoFirstResponse(job)) {
        lists.noFirstResponse.push(mapManagerJobRow(job, now, { isOverdue: overdue }));
      }
    });

    MANAGER_LIST_KEYS.forEach((key) => {
      lists[key] = sortManagerJobs(lists[key]).slice(0, listLimit);
    });

    const summary = {
      awaitingResponse: jobs.filter(isAwaitingResponse).length,
      overdue: jobs.filter((job) =>
        isManagerJobOverdue(job, job.jobdetails?.[0] ?? null, now)
      ).length,
      noFirstResponse: jobs.filter(isNoFirstResponse).length
    };

    const responseLists =
      listFilter === "all"
        ? lists
        : { [listFilter]: lists[listFilter] };

    return {
      asOf: now.toISOString(),
      managerId: Number(auth.userid),
      list: listFilter,
      limit: listLimit,
      summary,
      lists: responseLists
    };
  }

  async managerTechnicians(auth, query = {}) {
    const access = await resolveDashboardAccess(auth);
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const managerScope = await buildDashboardManagerScope(auth, access);

    const technicianIds = await resolveManagerTechnicianIds(
      managerScope,
      todayRange,
      tenantid,
      branchid
    );
    if (!technicianIds.length) {
      return {
        asOf: now.toISOString(),
        date: formatUtcDateKey(now),
        managerId: Number(auth.userid),
        total: 0,
        technicians: []
      };
    }

    const [
      technicians,
      activity,
      assignedGrouped,
      completedGrouped,
      workHistoryRows,
      attendanceSessions
    ] = await Promise.all([
      prisma.users.findMany({
        where: {
          userid: { in: technicianIds },
          usertype: "technician",
          isactive: { not: false },
          isdeleted: { not: true }
        },
        select: {
          userid: true,
          name: true,
          technicianaffiliation: true,
          companyname: true
        },
        orderBy: { name: "asc" }
      }),
      loadManagerTechnicianActivity(tenantid, branchid, managerScope),
      prisma.job.groupBy({
        by: ["assignedto"],
        where: {
          ...managerScope,
          iscompleted: { not: true },
          assignedto: { in: technicianIds }
        },
        _count: { _all: true }
      }),
      prisma.jobdetails.groupBy({
        by: ["completedby"],
        where: {
          tenantid,
          branchid,
          completedat: dateInRange(todayRange),
          completedby: { in: technicianIds },
          job: { is: managerScope }
        },
        _count: { _all: true }
      }),
      prisma.jobworklhistory.findMany({
        where: {
          tenantid,
          branchid,
          workedby: { in: technicianIds },
          job: { is: managerScope },
          OR: [
            { startedat: dateInRange(todayRange) },
            { stopedat: dateInRange(todayRange) },
            {
              startedat: { lt: todayRange.end },
              stopedat: null
            }
          ]
        },
        select: {
          workedby: true,
          startedat: true,
          stopedat: true
        }
      }),
      prisma.userattendancesession.findMany({
        where: {
          tenantid,
          branchid,
          isopen: true,
          userid: { in: technicianIds }
        },
        select: {
          userid: true,
          isopen: true,
          status: true
        }
      })
    ]);

    const assignedByUser = new Map(
      assignedGrouped.map((row) => [row.assignedto, row._count._all])
    );
    const completedByUser = new Map(
      completedGrouped.map((row) => [row.completedby, row._count._all])
    );
    const attendanceByUser = new Map(attendanceSessions.map((row) => [row.userid, row]));
    const workedMinutesByUser = new Map();

    workHistoryRows.forEach((row) => {
      const minutes = minutesOverlappingToday(
        row.startedat,
        row.stopedat,
        todayRange,
        now
      );
      if (!minutes) return;
      workedMinutesByUser.set(
        row.workedby,
        (workedMinutesByUser.get(row.workedby) ?? 0) + minutes
      );
    });

    const techniciansList = technicians
      .map((tech) => {
        const userid = tech.userid;
        const workedMinutes = workedMinutesByUser.get(userid) ?? 0;

        return {
          technicianId: userid,
          technicianName: tech.name ?? null,
          ...formatTechnicianAffiliationFields(tech),
          status: resolveManagerTechnicianStatus(userid, activity, attendanceByUser),
          code: activeJobCodeForTechnician(userid, activity),
          jobsAssigned: assignedByUser.get(userid) ?? 0,
          jobsCompleted: completedByUser.get(userid) ?? 0,
          totalWorkedHours: roundHoursFromMinutes(workedMinutes)
        };
      })
      .sort((a, b) => {
        const statusOrder = {
          [MANAGER_TECH_STATUS.ON_SITE]: 0,
          [MANAGER_TECH_STATUS.TRAVELLING]: 1,
          [MANAGER_TECH_STATUS.IDLE]: 2,
          [MANAGER_TECH_STATUS.OFFLINE]: 3
        };
        const statusDiff =
          (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return String(a.technicianName || "").localeCompare(
          String(b.technicianName || ""),
          undefined,
          { sensitivity: "base" }
        );
      });

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      managerId: Number(auth.userid),
      total: techniciansList.length,
      technicians: techniciansList
    };
  }

  async managerSummary(auth) {
    const access = await resolveDashboardAccess(auth);
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);
    const managerScope = await buildDashboardManagerScope(auth, access);

    const technicianIds = await resolveManagerTechnicianIds(
      managerScope,
      todayRange,
      tenantid,
      branchid
    );

    const [teamMembers, openJobs, completedToday, pendingApprovalResult] = await Promise.all([
      loadManagerTeamMembers(technicianIds),
      prisma.job.count({
        where: {
          ...managerScope,
          iscompleted: { not: true }
        }
      }),
      prisma.job.count({
        where: {
          ...managerScope,
          jobdetails: {
            some: {
              tenantid,
              branchid,
              completedat: dateInRange(todayRange)
            }
          }
        }
      }),
      jobApprovalService.listPending(auth)
    ]);

    const metrics = {
      technicians: teamMembers.length,
      openJobs,
      completedToday,
      pendingApprovals: pendingApprovalResult.total ?? 0
    };

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      managerId: Number(auth.userid),
      text: formatManagerSummaryText(teamMembers, metrics),
      team: {
        members: teamMembers,
        total: teamMembers.length
      },
      metrics
    };
  }

  async activeJobs(auth, query = {}) {
    const now = utcNow();
    const pagination = buildActiveJobsPagination(query);
    const { where, scope } = await buildActiveJobsWhere(auth, query);

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: ACTIVE_JOB_INCLUDE,
        orderBy: [{ date: "desc" }, { recno: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({ where })
    ]);

    return {
      asOf: now.toISOString(),
      scope: scope.assignedto != null ? "my" : "all",
      filters: {
        customerName: parseOptionalText(query.customerName ?? query.customername) ?? null,
        statusId: parseOptionalInt(query.statusId ?? query.statusid) ?? null,
        status:
          parseOptionalText(query.status ?? query.statusName ?? query.statusname) ?? null,
        faultId: parseOptionalInt(query.faultId ?? query.faultid) ?? null,
        faultName:
          parseOptionalText(query.faultName ?? query.faultname ?? query.fault) ?? null
      },
      data: rows.map(mapActiveJobRow),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      }
    };
  }

  async todaysProgress(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const todayWhere = {
      ...jobScopeWhere(scope),
      date: dateInRange(todayRange)
    };

    const [
      totalJobs,
      completedJobs,
      firstResponseJobs,
      avgCompletionHours
    ] = await Promise.all([
      prisma.job.count({ where: todayWhere }),
      prisma.job.count({
        where: { ...todayWhere, iscompleted: true }
      }),
      prisma.job.count({
        where: { ...todayWhere, isfirstresponse: true }
      }),
      computeAvgCompletionHours(scope, todayRange)
    ]);

    const pendingJobs = Math.max(totalJobs - completedJobs, 0);
    const completionRate = totalJobs
      ? Math.round((completedJobs / totalJobs) * 10000) / 100
      : 0;
    const firstResponseRate = totalJobs
      ? Math.round((firstResponseJobs / totalJobs) * 10000) / 100
      : 0;

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      jobs: {
        total: totalJobs,
        completed: completedJobs,
        pending: pendingJobs,
        completionRate
      },
      firstResponseRate: {
        value: firstResponseRate,
        responded: firstResponseJobs,
        total: totalJobs
      },
      avgCompletionHours
    };
  }

  async warrantySplit(auth, query = {}) {
    const now = utcNow();
    const todayRange = utcDayRange(now);
    const scope = await buildJobScope(auth, query);
    const baseWhere = {
      ...jobScopeWhere(scope),
      date: dateInRange(todayRange)
    };

    const [warrantyCount, nonWarrantyCount] = await Promise.all([
      prisma.job.count({
        where: { ...baseWhere, isinwaranty: true }
      }),
      prisma.job.count({
        where: { ...baseWhere, isinwaranty: { not: true } }
      })
    ]);

    const total = warrantyCount + nonWarrantyCount;
    const warrantyPercentage = total
      ? Math.round((warrantyCount / total) * 10000) / 100
      : 0;
    const nonWarrantyPercentage = total
      ? Math.round((nonWarrantyCount / total) * 10000) / 100
      : 0;

    return {
      asOf: now.toISOString(),
      date: formatUtcDateKey(now),
      scope: scope.assignedto != null ? "my" : "all",
      total,
      split: {
        warranty: {
          label: "Warranty",
          count: warrantyCount,
          percentage: warrantyPercentage
        },
        nonWarranty: {
          label: "Non-Warranty",
          count: nonWarrantyCount,
          percentage: nonWarrantyPercentage
        }
      }
    };
  }

  async weeklyJobVolume(auth, query = {}) {
    const now = utcNow();
    const scope = await buildJobScope(auth, query);
    const weekRanges = buildLastUtcWeekRanges(WEEKLY_JOB_VOLUME_WEEKS);
    const rangeStart = weekRanges[0].start;
    const rangeEnd = weekRanges[weekRanges.length - 1].end;

    const jobs = await prisma.job.findMany({
      where: {
        ...jobScopeWhere(scope),
        date: { gte: rangeStart, lt: rangeEnd }
      },
      select: { date: true }
    });

    const dailyCounts = buildDailyJobCounts(jobs);
    const weeks = weekRanges.map((weekRange) => buildWeekVolumeStats(weekRange, dailyCounts));

    return {
      asOf: now.toISOString(),
      scope: scope.assignedto != null ? "my" : "all",
      weekCount: WEEKLY_JOB_VOLUME_WEEKS,
      weeks,
      series: [
        {
          key: "highest",
          label: "Highest Volume",
          values: weeks.map((week) => ({
            weekStart: week.weekStart,
            label: week.label,
            value: week.volume.highest.value
          }))
        },
        {
          key: "lowest",
          label: "Lowest Volume",
          values: weeks.map((week) => ({
            weekStart: week.weekStart,
            label: week.label,
            value: week.volume.lowest.value
          }))
        },
        {
          key: "medium",
          label: "Medium Volume",
          values: weeks.map((week) => ({
            weekStart: week.weekStart,
            label: week.label,
            value: week.volume.medium.value
          }))
        }
      ]
    };
  }

  async avgResolutionByCategory(auth, query = {}) {
    const now = utcNow();
    const scope = await buildJobScope(auth, query);
    const tenantid = Number(auth.tenantid);
    const branchid = Number(auth.branchid);

    const [categories, details] = await Promise.all([
      prisma.jobcategories.findMany({
        where: {
          tenantid,
          branchid,
          isactive: { not: false }
        },
        select: {
          categoryid: true,
          name: true,
          color: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.jobdetails.findMany({
        where: jobDetailsScopeWhere(scope, {
          resolvedat: { not: null }
        }),
        select: {
          assignedat: true,
          firstresponseat: true,
          createdat: true,
          resolvedat: true,
          job: {
            select: {
              serviceid: true,
              date: true
            }
          }
        }
      })
    ]);

    const durationsByCategoryId = new Map();
    const allDurations = [];

    details.forEach((detail) => {
      const hours = computeResolutionDurationHours(detail);
      if (hours == null) return;

      const categoryId = detail.job?.serviceid ?? null;
      const key = categoryId == null ? null : Number(categoryId);
      if (!durationsByCategoryId.has(key)) {
        durationsByCategoryId.set(key, []);
      }
      durationsByCategoryId.get(key).push(hours);
      allDurations.push(hours);
    });

    const categoriesList = categories.map((category) =>
      buildAvgResolutionCategoryRow(
        category.categoryid,
        category.name?.trim() || `Category #${category.categoryid}`,
        category.color,
        durationsByCategoryId.get(category.categoryid) ?? []
      )
    );

    const unassignedDurations = durationsByCategoryId.get(null) ?? [];
    if (unassignedDurations.length) {
      categoriesList.push(
        buildAvgResolutionCategoryRow(null, "Unassigned", null, unassignedDurations)
      );
    }

    categoriesList.sort((a, b) => {
      if (b.avgResolutionHours !== a.avgResolutionHours) {
        return b.avgResolutionHours - a.avgResolutionHours;
      }
      return String(a.categoryName).localeCompare(String(b.categoryName), undefined, {
        sensitivity: "base"
      });
    });

    const overallAvgHours = averageHours(allDurations);

    return {
      asOf: now.toISOString(),
      scope: scope.assignedto != null ? "my" : "all",
      overall: {
        avgResolutionHours: overallAvgHours,
        avgResolutionLabel: formatHoursLabel(overallAvgHours),
        sampleSize: allDurations.length
      },
      categories: categoriesList
    };
  }

  async ticketReopeningRate(auth, query = {}) {
    const now = utcNow();
    const scope = await buildJobScope(auth, query);
    const monthRanges = buildLastUtcMonthRanges(TICKET_REOPENING_MONTHS);
    const rangeStart = monthRanges[0].start;
    const rangeEnd = monthRanges[monthRanges.length - 1].end;

    const [completedInPeriod, allCompletedDetails] = await Promise.all([
      prisma.jobdetails.findMany({
        where: jobDetailsScopeWhere(scope, {
          completedat: {
            not: null,
            gte: rangeStart,
            lt: rangeEnd
          }
        }),
        select: {
          jobid: true,
          completedat: true
        }
      }),
      prisma.jobdetails.findMany({
        where: jobDetailsScopeWhere(scope, {
          completedat: { not: null }
        }),
        select: {
          jobid: true,
          completedat: true
        }
      })
    ]);

    const jobIds = [
      ...new Set(allCompletedDetails.map((detail) => detail.jobid).filter(Boolean))
    ];

    const workSessions = jobIds.length
      ? await prisma.jobworklhistory.findMany({
          where: {
            tenantid: scope.tenantid,
            branchid: scope.branchid,
            jobid: { in: jobIds },
            startedat: { not: null },
            ...(scope.assignedto != null
              ? { job: { is: jobScopeWhere(scope) } }
              : {})
          },
          select: {
            jobid: true,
            startedat: true,
            stopedat: true
          }
        })
      : [];

    const workByJobId = groupWorkSessionsByJob(workSessions);
    const months = buildMonthlyReopeningMetrics(
      monthRanges,
      completedInPeriod,
      allCompletedDetails,
      workByJobId
    );

    const totalCompleted = months.reduce((sum, row) => sum + row.completedTickets, 0);
    const totalReopened = months.reduce((sum, row) => sum + row.reopenedTickets, 0);
    const overallReopenRate = totalCompleted
      ? Math.round((totalReopened / totalCompleted) * 10000) / 100
      : 0;

    return {
      asOf: now.toISOString(),
      scope: scope.assignedto != null ? "my" : "all",
      monthCount: TICKET_REOPENING_MONTHS,
      overall: {
        completedTickets: totalCompleted,
        reopenedTickets: totalReopened,
        reopenRate: overallReopenRate
      },
      months,
      series: [
        {
          key: "reopenRate",
          label: "Reopening Rate (%)",
          values: months.map((row) => ({
            month: row.month,
            label: row.label,
            value: row.reopenRate
          }))
        },
        {
          key: "reopenedTickets",
          label: "Reopened Tickets",
          values: months.map((row) => ({
            month: row.month,
            label: row.label,
            value: row.reopenedTickets
          }))
        },
        {
          key: "completedTickets",
          label: "Completed Tickets",
          values: months.map((row) => ({
            month: row.month,
            label: row.label,
            value: row.completedTickets
          }))
        }
      ]
    };
  }
}

module.exports = new DashboardService();
