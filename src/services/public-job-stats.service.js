const prisma = require("../database/prisma");
const {
  utcNow,
  utcDayRange,
  startOfUtcDay,
  endOfUtcDay,
  addUtcDays
} = require("../utils/date");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseScope(query = {}) {
  const tenantid = Number(query.tenantid ?? query.tenantId);
  const branchid = Number(query.branchid ?? query.branchId);

  if (!Number.isFinite(tenantid) || tenantid <= 0) {
    throw clientError("tenantid is required and must be a positive integer");
  }
  if (!Number.isFinite(branchid) || branchid <= 0) {
    throw clientError("branchid is required and must be a positive integer");
  }

  return { tenantid, branchid };
}

async function assertBranchInTenant(branchid, tenantid) {
  const branch = await prisma.branches.findFirst({
    where: {
      branchid: Number(branchid),
      tenantid: Number(tenantid)
    },
    select: { branchid: true, name: true }
  });

  if (!branch) {
    throw clientError("Invalid tenantid or branchid", 404);
  }

  return branch;
}

function buildRollingPeriods(now = utcNow()) {
  const today = utcDayRange(now);
  const last7DaysStart = startOfUtcDay(addUtcDays(now, -6));
  const last30DaysStart = startOfUtcDay(addUtcDays(now, -29));

  return {
    today,
    last7Days: {
      start: last7DaysStart,
      end: endOfUtcDay(now)
    },
    last30Days: {
      start: last30DaysStart,
      end: endOfUtcDay(now)
    }
  };
}

function formatPeriod(range) {
  return {
    from: range.start.toISOString(),
    to: range.end.toISOString()
  };
}

async function countOpenJobs(scope) {
  return prisma.job.count({
    where: {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      isresolved: { not: true }
    }
  });
}

async function countResolvedInRange(scope, range) {
  return prisma.jobdetails.count({
    where: {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      resolvedat: {
        gte: range.start,
        lt: range.end
      }
    }
  });
}

class PublicJobStatsService {
  async getStats(query = {}) {
    const scope = parseScope(query);
    const branch = await assertBranchInTenant(scope.branchid, scope.tenantid);
    const now = utcNow();
    const periods = buildRollingPeriods(now);

    const [openJobs, resolvedToday, resolvedLast7Days, resolvedLast30Days] =
      await Promise.all([
        countOpenJobs(scope),
        countResolvedInRange(scope, periods.today),
        countResolvedInRange(scope, periods.last7Days),
        countResolvedInRange(scope, periods.last30Days)
      ]);

    return {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      branchName: branch.name ?? null,
      asOf: now.toISOString(),
      stats: {
        openJobs,
        resolvedToday,
        resolvedLast7Days,
        resolvedLast30Days
      },
      periods: {
        today: formatPeriod(periods.today),
        last7Days: formatPeriod(periods.last7Days),
        last30Days: formatPeriod(periods.last30Days)
      }
    };
  }
}

module.exports = {
  PublicJobStatsService,
  parseScope,
  buildRollingPeriods,
  countOpenJobs,
  countResolvedInRange
};
