const {
  utcNow,
  startOfUtcDay,
  endOfUtcDay,
  utcDayRange,
  formatUtcDateKey
} = require("./date");

function clientError(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
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

function normalizeDateParam(value) {
  if (value == null || value === "") return null;
  return String(value).trim();
}

/**
 * Resolves a recorded-at time window from query params.
 * Date filters (`date`, `dateFrom`/`dateTo`) take precedence over rolling `minutes`.
 */
function resolveRecordedAtWindow(query = {}, options = {}) {
  const { defaultMinutes = 30, maxMinutes = 24 * 60 } = options;

  if (query.date != null && query.date !== "") {
    const day = parseOptionalUtcDate(query.date, "date");
    const { start, end } = utcDayRange(day);
    return {
      start,
      end,
      minutes: null,
      date: formatUtcDateKey(day),
      dateFrom: null,
      dateTo: null
    };
  }

  const fromRaw = query.dateFrom ?? query.from;
  const toRaw = query.dateTo ?? query.to;
  if ((fromRaw != null && fromRaw !== "") || (toRaw != null && toRaw !== "")) {
    const start =
      fromRaw != null && fromRaw !== ""
        ? startOfUtcDay(parseOptionalUtcDate(fromRaw, "dateFrom"))
        : startOfUtcDay(new Date(0));
    const end =
      toRaw != null && toRaw !== ""
        ? endOfUtcDay(parseOptionalUtcDate(toRaw, "dateTo"))
        : endOfUtcDay(utcNow());

    if (start.getTime() >= end.getTime()) {
      throw clientError("dateFrom must be before dateTo");
    }

    return {
      start,
      end,
      minutes: null,
      date: null,
      dateFrom: normalizeDateParam(fromRaw),
      dateTo: normalizeDateParam(toRaw)
    };
  }

  const minutes = Math.min(Math.max(Number(query.minutes) || defaultMinutes, 1), maxMinutes);
  const end = utcNow();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  return {
    start,
    end,
    minutes,
    date: null,
    dateFrom: null,
    dateTo: null
  };
}

module.exports = {
  parseOptionalUtcDate,
  resolveRecordedAtWindow
};
