const { startOfUtcDay, addUtcDays, startOfUtcWeek, startOfUtcMonth } = require("./date");

const RANGE_PRESETS = Object.freeze([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "previous_month",
  "this_quarter",
  "this_year",
  "year_to_date",
  "previous_year",
  "custom"
]);

const MAX_RANGE_DAYS = 366;

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatUtcLabel(date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function inclusiveEnd(to) {
  return new Date(to.getTime() - 24 * 60 * 60 * 1000);
}

function rangeResult(preset, from, to) {
  return {
    preset,
    from,
    to,
    fromDate: from.toISOString().slice(0, 10),
    toDate: inclusiveEnd(to).toISOString().slice(0, 10),
    label: `${formatUtcLabel(from)} to ${formatUtcLabel(inclusiveEnd(to))}`
  };
}

function startOfUtcQuarter(date) {
  const day = startOfUtcDay(date);
  const quarterMonth = Math.floor(day.getUTCMonth() / 3) * 3;
  return utcDate(day.getUTCFullYear(), quarterMonth, 1);
}

function parseDay(value, label) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const err = new Error(`${label} must be YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }
  const date = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    const err = new Error(`${label} must be YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }
  return date;
}

function assertRangeLength(from, to) {
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 0) {
    const err = new Error("Date range must include at least one day");
    err.status = 400;
    throw err;
  }
  if (days > MAX_RANGE_DAYS) {
    const err = new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    err.status = 400;
    throw err;
  }
}

function resolveIntelligenceRange(query = {}, now = new Date()) {
  const preset = String(query.range || query.preset || "year_to_date").trim().toLowerCase();
  if (!RANGE_PRESETS.includes(preset)) {
    const err = new Error(`range must be one of: ${RANGE_PRESETS.join(", ")}`);
    err.status = 400;
    throw err;
  }

  const today = startOfUtcDay(now);
  let from;
  let to;

  if (preset === "today") {
    from = today;
    to = addUtcDays(today, 1);
  } else if (preset === "yesterday") {
    from = addUtcDays(today, -1);
    to = today;
  } else if (preset === "this_week") {
    from = startOfUtcWeek(today, 1);
    to = addUtcDays(from, 7);
  } else if (preset === "this_month") {
    from = startOfUtcMonth(today);
    to = utcDate(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
  } else if (preset === "previous_month") {
    const thisMonth = startOfUtcMonth(today);
    from = utcDate(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1);
    to = thisMonth;
  } else if (preset === "this_quarter") {
    from = startOfUtcQuarter(today);
    to = utcDate(from.getUTCFullYear(), from.getUTCMonth() + 3, 1);
  } else if (preset === "this_year") {
    from = utcDate(today.getUTCFullYear(), 0, 1);
    to = utcDate(today.getUTCFullYear() + 1, 0, 1);
  } else if (preset === "year_to_date") {
    from = utcDate(today.getUTCFullYear(), 0, 1);
    to = addUtcDays(today, 1);
  } else if (preset === "previous_year") {
    from = utcDate(today.getUTCFullYear() - 1, 0, 1);
    to = utcDate(today.getUTCFullYear(), 0, 1);
  } else {
    from = parseDay(query.from || query.dateFrom, "from");
    const inclusiveTo = parseDay(query.to || query.dateTo, "to");
    to = addUtcDays(inclusiveTo, 1);
  }

  assertRangeLength(from, to);
  return rangeResult(preset, from, to);
}

function previousPeriod(range) {
  if (range.preset === "this_month" || range.preset === "previous_month") {
    const from = utcDate(range.from.getUTCFullYear(), range.from.getUTCMonth() - 1, 1);
    return rangeResult("previous", from, new Date(range.from));
  }
  if (range.preset === "this_quarter") {
    const from = utcDate(range.from.getUTCFullYear(), range.from.getUTCMonth() - 3, 1);
    return rangeResult("previous", from, new Date(range.from));
  }
  if (range.preset === "this_year" || range.preset === "previous_year" || range.preset === "year_to_date") {
    const from = utcDate(range.from.getUTCFullYear() - 1, 0, 1);
    const to = range.preset === "year_to_date"
      ? utcDate(range.to.getUTCFullYear() - 1, range.to.getUTCMonth(), range.to.getUTCDate())
      : utcDate(range.from.getUTCFullYear(), 0, 1);
    return rangeResult("previous", from, to);
  }
  const length = range.to.getTime() - range.from.getTime();
  return rangeResult("previous", new Date(range.from.getTime() - length), new Date(range.from));
}

function chartGrain(range) {
  const days = (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000);
  return days <= 62 ? "day" : "month";
}

function listBuckets(range, grain = chartGrain(range)) {
  const buckets = [];
  const cursor = new Date(range.from);
  if (grain === "month") {
    cursor.setUTCDate(1);
    while (cursor < range.to) {
      buckets.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }
  while (cursor < range.to) {
    buckets.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

function percentChange(current, previous) {
  const next = Number(current) || 0;
  const prior = Number(previous) || 0;
  if (prior === 0) return next === 0 ? 0 : null;
  return Math.round(((next - prior) / prior) * 10000) / 100;
}

module.exports = {
  RANGE_PRESETS,
  MAX_RANGE_DAYS,
  resolveIntelligenceRange,
  previousPeriod,
  chartGrain,
  listBuckets,
  percentChange
};
