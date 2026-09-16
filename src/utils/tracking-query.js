const { utcNow, formatUtcDateKey } = require("./date");
const { resolveRecordedAtWindow } = require("./date-range-query");

const DEFAULT_LIVE_MINUTES = 30;
const MAX_SUMMARY_MINUTES = 24 * 60;
const MAX_DETAIL_RANGE_DAYS = 31;
const MAX_DETAIL_RANGE_MS = MAX_DETAIL_RANGE_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_DETAIL_PAGE_SIZE = 100;
const MAX_DETAIL_PAGE_SIZE = 500;

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function hasDateFilter(query = {}) {
  return (
    (query.date != null && query.date !== "") ||
    (query.dateFrom != null && query.dateFrom !== "") ||
    (query.dateTo != null && query.dateTo !== "") ||
    (query.from != null && query.from !== "") ||
    (query.to != null && query.to !== "") ||
    (query.minutes != null && query.minutes !== "")
  );
}

function parseOptionalPositiveInt(value, label) {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw clientError(`${label} must be a positive integer`);
  }
  return n;
}

function resolveSummaryWindow(query = {}) {
  if (!hasDateFilter(query)) {
    return {
      allTime: true,
      minutes: null,
      date: null,
      dateFrom: null,
      dateTo: null,
      start: null,
      end: null
    };
  }

  const window = resolveRecordedAtWindow(query, {
    defaultMinutes: DEFAULT_LIVE_MINUTES,
    maxMinutes: MAX_SUMMARY_MINUTES
  });

  return {
    allTime: false,
    minutes: window.minutes,
    date: window.date,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    start: window.start,
    end: window.end
  };
}

function resolveDetailWindow(query = {}) {
  const window = hasDateFilter(query)
    ? resolveRecordedAtWindow(query, {
        defaultMinutes: DEFAULT_LIVE_MINUTES,
        maxMinutes: MAX_SUMMARY_MINUTES
      })
    : resolveRecordedAtWindow({ date: formatUtcDateKey(utcNow()) });

  if (window.end.getTime() - window.start.getTime() > MAX_DETAIL_RANGE_MS) {
    throw clientError(`Date range cannot exceed ${MAX_DETAIL_RANGE_DAYS} days`);
  }

  return window;
}

function parseDetailPagination(query = {}) {
  const pageRaw = query.page ?? query.pageNumber;
  const pageSizeRaw = query.pageSize ?? query.limit ?? query.take;

  let page = pageRaw == null || pageRaw === "" ? 1 : Number(pageRaw);
  let pageSize =
    pageSizeRaw == null || pageSizeRaw === "" ? DEFAULT_DETAIL_PAGE_SIZE : Number(pageSizeRaw);

  if (!Number.isFinite(page) || page < 1) {
    throw clientError("page must be a positive integer");
  }
  if (!Number.isFinite(pageSize) || pageSize < 1) {
    throw clientError("pageSize must be a positive integer");
  }

  page = Math.floor(page);
  pageSize = Math.min(Math.floor(pageSize), MAX_DETAIL_PAGE_SIZE);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

function formatWindowFilters(window) {
  if (window.allTime) {
    return {
      allTime: true,
      minutes: null,
      since: null,
      until: null,
      date: null,
      dateFrom: null,
      dateTo: null
    };
  }

  return {
    allTime: false,
    minutes: window.minutes,
    since: window.start.toISOString(),
    until: window.end.toISOString(),
    date: window.date,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo
  };
}

module.exports = {
  DEFAULT_DETAIL_PAGE_SIZE,
  MAX_DETAIL_PAGE_SIZE,
  parseOptionalPositiveInt,
  resolveSummaryWindow,
  resolveDetailWindow,
  parseDetailPagination,
  formatWindowFilters,
  hasDateFilter
};
