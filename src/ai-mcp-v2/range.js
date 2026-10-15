const { AiMcpError } = require("./errors");
const { startOfUtcDay, addUtcDays, startOfUtcWeek, startOfUtcMonth } = require("../utils/date");

const PERIODS = Object.freeze([
  "today",
  "yesterday",
  "this_week",
  "previous_week",
  "this_month",
  "previous_month",
  "this_quarter",
  "this_year",
  "year_to_date",
  "previous_year",
  "all_time",
  "custom"
]);

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatMonthLabel(from) {
  return from.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

function inclusiveEnd(to) {
  return new Date(to.getTime() - 24 * 60 * 60 * 1000);
}

function parseDay(value, label) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new AiMcpError(`${label} must be YYYY-MM-DD.`, 400, "invalid_period");
  }
  const date = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime()) || formatDay(date) !== text) {
    throw new AiMcpError(`${label} must be YYYY-MM-DD.`, 400, "invalid_period");
  }
  return date;
}

function result(period, from, to, label, unbounded = false) {
  return {
    period,
    from,
    to,
    unbounded,
    label,
    fromDate: unbounded ? null : formatDay(from),
    toExclusive: unbounded ? null : formatDay(to)
  };
}

function startOfUtcQuarter(date) {
  const day = startOfUtcDay(date);
  const quarterMonth = Math.floor(day.getUTCMonth() / 3) * 3;
  return utcDate(day.getUTCFullYear(), quarterMonth, 1);
}

function resolvePeriod(args = {}, now = new Date()) {
  const fromArg = args.from || args.dateFrom;
  const toArg = args.to || args.dateTo;
  let period = String(args.period || "").trim().toLowerCase();
  if (!period && (fromArg || toArg)) period = "custom";
  if (!period) period = "this_month";
  if (!PERIODS.includes(period)) {
    throw new AiMcpError(
      `period must be one of: ${PERIODS.join(", ")}.`,
      400,
      "invalid_period"
    );
  }

  const today = startOfUtcDay(now);
  if (period === "all_time") {
    return result("all_time", utcDate(1970, 0, 1), addUtcDays(today, 1), "all authorized records", true);
  }
  if (period === "today") {
    return result(period, today, addUtcDays(today, 1), formatDay(today));
  }
  if (period === "yesterday") {
    const from = addUtcDays(today, -1);
    return result(period, from, today, formatDay(from));
  }
  if (period === "this_week") {
    const from = startOfUtcWeek(today, 1);
    return result(period, from, addUtcDays(from, 7), `week of ${formatDay(from)}`);
  }
  if (period === "previous_week") {
    const thisWeek = startOfUtcWeek(today, 1);
    const from = addUtcDays(thisWeek, -7);
    return result(period, from, thisWeek, `week of ${formatDay(from)}`);
  }
  if (period === "this_month") {
    const from = startOfUtcMonth(today);
    const to = utcDate(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
    return result(period, from, to, formatMonthLabel(from));
  }
  if (period === "previous_month") {
    const thisMonth = startOfUtcMonth(today);
    const from = utcDate(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1);
    return result(period, from, thisMonth, formatMonthLabel(from));
  }
  if (period === "this_quarter") {
    const from = startOfUtcQuarter(today);
    const to = utcDate(from.getUTCFullYear(), from.getUTCMonth() + 3, 1);
    return result(period, from, to, `Q${Math.floor(from.getUTCMonth() / 3) + 1} ${from.getUTCFullYear()}`);
  }
  if (period === "this_year") {
    const year = today.getUTCFullYear();
    return result(period, utcDate(year, 0, 1), utcDate(year + 1, 0, 1), String(year));
  }
  if (period === "year_to_date") {
    const year = today.getUTCFullYear();
    return result(period, utcDate(year, 0, 1), addUtcDays(today, 1), `${year} year to date`);
  }
  if (period === "previous_year") {
    const year = today.getUTCFullYear() - 1;
    return result(period, utcDate(year, 0, 1), utcDate(year + 1, 0, 1), String(year));
  }

  const from = parseDay(fromArg, "from");
  const inclusiveTo = parseDay(toArg || fromArg, "to");
  const to = addUtcDays(inclusiveTo, 1);
  if (!(to > from)) {
    throw new AiMcpError("Date range must include at least one day.", 400, "invalid_period");
  }
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > 3660) {
    throw new AiMcpError("Custom date range cannot exceed 10 years. Use all_time for the full authorized history.", 400, "invalid_period");
  }
  return result("custom", from, to, `${formatDay(from)} to ${formatDay(inclusiveEnd(to))}`);
}

function monthRange(period, now = new Date()) {
  return resolvePeriod({ period: period === "previous_month" ? "previous_month" : "this_month" }, now);
}

module.exports = {
  PERIODS,
  monthRange,
  resolvePeriod
};
