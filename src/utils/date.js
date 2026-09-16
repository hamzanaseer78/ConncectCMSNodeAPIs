function utcNow() {
  return new Date();
}

function startOfUtcDay(date = utcNow()) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(date = utcNow()) {
  const start = startOfUtcDay(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function utcDayRange(date = utcNow()) {
  return {
    start: startOfUtcDay(date),
    end: endOfUtcDay(date)
  };
}

function formatUtcDateKey(date = utcNow()) {
  const d = startOfUtcDay(date);
  return d.toISOString().slice(0, 10);
}

function compareDayTrend(todayCount, yesterdayCount) {
  const delta = todayCount - yesterdayCount;
  let trend = 0;
  if (delta > 0) trend = 1;
  else if (delta < 0) trend = -1;
  return { value: todayCount, yesterday: yesterdayCount, trend, delta };
}

function addUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** weekStartsOn: 0 = Sunday, 1 = Monday (default, ISO-style). */
function startOfUtcWeek(date = utcNow(), weekStartsOn = 1) {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function endOfUtcWeek(date = utcNow(), weekStartsOn = 1) {
  const start = startOfUtcWeek(date, weekStartsOn);
  return addUtcDays(start, 7);
}

function utcWeekRange(date = utcNow(), weekStartsOn = 1) {
  return {
    start: startOfUtcWeek(date, weekStartsOn),
    end: endOfUtcWeek(date, weekStartsOn)
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return sorted[mid];
}

function startOfUtcMonth(date = utcNow()) {
  const d = startOfUtcDay(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfUtcMonth(date = utcNow()) {
  const start = startOfUtcMonth(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function formatUtcMonthKey(date = utcNow()) {
  const d = startOfUtcMonth(date);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

function formatUtcMonthLabel(date = utcNow()) {
  return startOfUtcMonth(date).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function buildLastUtcMonthRanges(monthCount) {
  const currentStart = startOfUtcMonth(utcNow());
  const ranges = [];

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const start = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - offset, 1)
    );
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    ranges.push({
      start,
      end,
      month: formatUtcMonthKey(start),
      label: formatUtcMonthLabel(start)
    });
  }

  return ranges;
}

function isTimestampInRange(timestamp, range) {
  const ms = new Date(timestamp).getTime();
  return ms >= range.start.getTime() && ms < range.end.getTime();
}

module.exports = {
  utcNow,
  startOfUtcDay,
  endOfUtcDay,
  utcDayRange,
  formatUtcDateKey,
  compareDayTrend,
  addUtcDays,
  startOfUtcWeek,
  endOfUtcWeek,
  utcWeekRange,
  median,
  startOfUtcMonth,
  endOfUtcMonth,
  formatUtcMonthKey,
  formatUtcMonthLabel,
  buildLastUtcMonthRanges,
  isTimestampInRange
};
