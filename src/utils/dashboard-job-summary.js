const {
  utcDayRange,
  startOfUtcDay,
  addUtcDays,
  formatUtcDateKey
} = require("./date");

function emptyJobSummaryBucket() {
  return {
    total: 0,
    resolved: 0,
    inProgress: 0
  };
}

function buildJobSummaryPeriods(now) {
  const today = utcDayRange(now);
  const yesterday = utcDayRange(addUtcDays(today.start, -1));
  const last7Days = {
    start: startOfUtcDay(addUtcDays(now, -6)),
    end: today.end
  };
  const last30Days = {
    start: startOfUtcDay(addUtcDays(now, -29)),
    end: today.end
  };

  return {
    today,
    yesterday,
    last7Days,
    last30Days
  };
}

function formatPeriodWindow(range) {
  return {
    from: range.start.toISOString(),
    to: range.end.toISOString()
  };
}

function formatSummaryBucket(counts) {
  return {
    total: counts.total,
    resolved: counts.resolved,
    inProgress: counts.inProgress
  };
}

function buildJobSummaryPeriodsResponse(periods, counts, now) {
  return {
    overall: formatSummaryBucket(counts.overall),
    today: {
      ...formatSummaryBucket(counts.today),
      date: formatUtcDateKey(now),
      period: formatPeriodWindow(periods.today)
    },
    yesterday: {
      ...formatSummaryBucket(counts.yesterday),
      date: formatUtcDateKey(addUtcDays(periods.today.start, -1)),
      period: formatPeriodWindow(periods.yesterday)
    },
    last7Days: {
      ...formatSummaryBucket(counts.last7Days),
      period: formatPeriodWindow(periods.last7Days)
    },
    last30Days: {
      ...formatSummaryBucket(counts.last30Days),
      period: formatPeriodWindow(periods.last30Days)
    }
  };
}

module.exports = {
  emptyJobSummaryBucket,
  buildJobSummaryPeriods,
  formatSummaryBucket,
  buildJobSummaryPeriodsResponse
};
