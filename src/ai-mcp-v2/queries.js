const { Prisma } = require("@prisma/client");
const { AiMcpError } = require("./errors");
const { resolvePeriod } = require("./range");
const { money, whole, runReadQuery } = require("./sql");

const NOTES = Object.freeze([
  "Amount to Collect is the sum of job costs for jobs dated in the period. It is not cash collected.",
  "Cash collected is the sum of collection records whose collected date falls in the period.",
  "Total expenses are expense amounts whose created date falls in the period.",
  "These figures are not combined into profit."
]);

function assignedSql(scope) {
  return scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`j.assignedto = ${scope.userid}`;
}

function jobScopeSql(scope) {
  return Prisma.sql`
    j.tenantid = ${scope.tenantid}
    AND j.branchid = ${scope.branchid}
    AND ${assignedSql(scope)}
  `;
}

function datedColumnSql(kind, range) {
  if (range?.unbounded) return Prisma.sql`TRUE`;
  if (kind === "expense") {
    return Prisma.sql`e.createdat IS NOT NULL AND e.createdat >= ${range.from} AND e.createdat < ${range.to}`;
  }
  if (kind === "collection") {
    return Prisma.sql`c.collectedat IS NOT NULL AND c.collectedat >= ${range.from} AND c.collectedat < ${range.to}`;
  }
  return Prisma.sql`j.date IS NOT NULL AND j.date >= ${range.from} AND j.date < ${range.to}`;
}

function jobDateSql(scope, range) {
  return Prisma.sql`
    ${jobScopeSql(scope)}
    AND ${datedColumnSql("job", range)}
  `;
}

function amountToCollectStatement(scope, range) {
  return Prisma.sql`
    SELECT COALESCE(SUM(j.totalcost), 0) AS amount, COUNT(*)::int AS jobs
    FROM job j
    WHERE ${jobDateSql(scope, range)}
  `;
}

function expenseStatement(scope, range) {
  return Prisma.sql`
    SELECT COALESCE(SUM(e.amount), 0) AS amount, COUNT(*)::int AS rows
    FROM jobexpenses e
    INNER JOIN job j ON j.recno = e.jobid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND e.tenantid = ${scope.tenantid}
      AND e.branchid = ${scope.branchid}
      AND ${assignedSql(scope)}
      AND ${datedColumnSql("expense", range)}
  `;
}

function collectionStatement(scope, range) {
  return Prisma.sql`
    SELECT COALESCE(SUM(c.amount), 0) AS amount, COUNT(*)::int AS rows
    FROM jobcollections c
    INNER JOIN job j ON j.recno = c.jobid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND c.tenantid = ${scope.tenantid}
      AND c.branchid = ${scope.branchid}
      AND ${assignedSql(scope)}
      AND ${datedColumnSql("collection", range)}
  `;
}

function attendanceStatement(scope) {
  const userFilter = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`s.userid = ${scope.userid}`;
  return Prisma.sql`
    SELECT s.status::text AS status, COUNT(*)::int AS count
    FROM userattendancesession s
    WHERE s.tenantid = ${scope.tenantid}
      AND s.branchid = ${scope.branchid}
      AND s.isopen = true
      AND ${userFilter}
    GROUP BY s.status
  `;
}

function searchFilters(scope, range, literal, statusLiteral) {
  const textFilter = literal
    ? Prisma.sql`AND (
        POSITION(${literal} IN LOWER(COALESCE(j.code, ''))) > 0
        OR POSITION(${literal} IN LOWER(COALESCE(j.manualjobno, ''))) > 0
        OR POSITION(${literal} IN LOWER(COALESCE(c.name, ''))) > 0
      )`
    : Prisma.sql``;
  const statusFilter = statusLiteral
    ? Prisma.sql`AND POSITION(${statusLiteral} IN LOWER(COALESCE(st.title, ''))) > 0`
    : Prisma.sql``;
  return Prisma.sql`
    ${jobDateSql(scope, range)}
    ${textFilter}
    ${statusFilter}
  `;
}

function searchStatement(scope, range, literal, statusLiteral, limit, offset) {
  return Prisma.sql`
    SELECT
      j.recno AS job_id,
      j.code,
      j.date,
      j.totalcost,
      st.title AS status_title,
      c.name AS customer_name,
      u.name AS technician_name,
      COUNT(*) OVER()::int AS total_matched
    FROM job j
    LEFT JOIN jobstatuses st
      ON st.recno = j.statusid
      AND st.tenantid = ${scope.tenantid}
    LEFT JOIN customers c
      ON c.customerid = j.customerid
      AND c.tenantid = j.tenantid
      AND c.branchid = j.branchid
    LEFT JOIN userorganizations uo
      ON uo.userid = j.assignedto
      AND uo.tenantid = ${scope.tenantid}
      AND uo.branchid = ${scope.branchid}
    LEFT JOIN users u ON u.userid = uo.userid
    WHERE ${searchFilters(scope, range, literal, statusLiteral)}
    ORDER BY j.date DESC NULLS LAST, j.recno DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

function jobStatusCountStatement(scope, range) {
  return Prisma.sql`
    SELECT COALESCE(st.title, 'Unknown') AS status_title, COUNT(*)::int AS jobs
    FROM job j
    LEFT JOIN jobstatuses st
      ON st.recno = j.statusid
      AND st.tenantid = ${scope.tenantid}
    WHERE ${jobDateSql(scope, range)}
    GROUP BY st.title
    ORDER BY jobs DESC, status_title ASC
    LIMIT 100
  `;
}

function jobDetailStatement(scope, jobId) {
  return Prisma.sql`
    SELECT
      j.recno AS job_id,
      j.code,
      j.date,
      j.totalcost,
      j.complaintby,
      j.priority,
      st.title AS status_title,
      c.name AS customer_name,
      u.name AS technician_name,
      COALESCE(col.amount, 0) AS cash_collected,
      COALESCE(ex.amount, 0) AS expenses_on_job
    FROM job j
    LEFT JOIN jobstatuses st
      ON st.recno = j.statusid
      AND st.tenantid = ${scope.tenantid}
    LEFT JOIN customers c
      ON c.customerid = j.customerid
      AND c.tenantid = j.tenantid
      AND c.branchid = j.branchid
    LEFT JOIN userorganizations uo
      ON uo.userid = j.assignedto
      AND uo.tenantid = ${scope.tenantid}
      AND uo.branchid = ${scope.branchid}
    LEFT JOIN users u ON u.userid = uo.userid
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobcollections
      WHERE tenantid = ${scope.tenantid}
        AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) col ON col.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid}
        AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE j.recno = ${jobId}
      AND j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assignedSql(scope)}
    LIMIT 1
  `;
}

function periodOf(args, now, fallbackPeriod) {
  const next = { ...(args || {}) };
  if (!next.period && !next.from && !next.dateFrom && fallbackPeriod) {
    next.period = fallbackPeriod;
  }
  return resolvePeriod(next, now);
}

function rangeMeta(range) {
  return {
    period: range.period,
    label: range.label,
    from: range.fromDate,
    toExclusive: range.toExclusive
  };
}

function searchLiteral(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().toLowerCase().slice(0, 80);
}

function positiveInt(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 2147483647) {
    throw new AiMcpError(`${label} is invalid.`, 400, "invalid_argument");
  }
  return number;
}

function rowLimit(value, maxRows) {
  const requested = value == null || value === "" ? maxRows : Number(value);
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new AiMcpError("limit is invalid.", 400, "invalid_argument");
  }
  return Math.min(maxRows, requested);
}

function rowOffset(value) {
  if (value == null || value === "") return 0;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1000000) {
    throw new AiMcpError("offset is invalid.", 400, "invalid_argument");
  }
  return number;
}

async function readOne(db, statement, timeoutMs) {
  const rows = await runReadQuery(db, statement, timeoutMs);
  return rows?.[0] || {};
}

function dated(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function financialFigures(scope, range, db, timeoutMs) {
  const [jobs, expenses, collections] = await Promise.all([
    readOne(db, amountToCollectStatement(scope, range), timeoutMs),
    readOne(db, expenseStatement(scope, range), timeoutMs),
    readOne(db, collectionStatement(scope, range), timeoutMs)
  ]);
  return {
    ...rangeMeta(range),
    amountToCollect: money(jobs.amount),
    jobsInPeriod: whole(jobs.jobs),
    totalExpenses: money(expenses.amount),
    expenseCount: whole(expenses.rows),
    cashCollected: money(collections.amount),
    collectionCount: whole(collections.rows),
    notes: NOTES
  };
}

async function monthlyFinancialSummary(scope, args, db, options) {
  return financialFigures(scope, periodOf(args, options.now), db, options.queryTimeoutMs);
}

async function totalAmountToCollect(scope, args, db, options) {
  const range = periodOf(args, options.now);
  const row = await readOne(db, amountToCollectStatement(scope, range), options.queryTimeoutMs);
  return {
    ...rangeMeta(range),
    amountToCollect: money(row.amount),
    jobsInPeriod: whole(row.jobs),
    notes: [NOTES[0], NOTES[3]]
  };
}

async function totalExpenses(scope, args, db, options) {
  const range = periodOf(args, options.now);
  const row = await readOne(db, expenseStatement(scope, range), options.queryTimeoutMs);
  return {
    ...rangeMeta(range),
    totalExpenses: money(row.amount),
    expenseCount: whole(row.rows),
    notes: [NOTES[2], NOTES[3]]
  };
}

async function collectionSummary(scope, args, db, options) {
  const range = periodOf(args, options.now);
  const row = await readOne(db, collectionStatement(scope, range), options.queryTimeoutMs);
  return {
    ...rangeMeta(range),
    cashCollected: money(row.amount),
    collectionCount: whole(row.rows),
    notes: [NOTES[1], NOTES[3]]
  };
}

async function branchReport(scope, args, db, options) {
  const figures = await financialFigures(scope, periodOf(args, options.now), db, options.queryTimeoutMs);
  return {
    ...figures,
    branchScope: "authenticated-branch-only"
  };
}

async function attendanceSummary(scope, db, options) {
  const rows = await runReadQuery(db, attendanceStatement(scope), options.queryTimeoutMs);
  const counts = { checked_in: 0, on_break: 0, checked_out: 0 };
  (rows || []).forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = whole(row.count);
    }
  });
  return {
    checkedIn: counts.checked_in,
    onBreak: counts.on_break,
    checkedOut: counts.checked_out,
    scope: scope.manageBranch ? "branch" : "self",
    notes: [
      "Counts include open attendance sessions only.",
      "A person with no open session is not recorded as absent, late, or on leave."
    ]
  };
}

async function searchJobs(scope, args, db, options) {
  const range = periodOf(args, options.now, "all_time");
  const literal = searchLiteral(args.search);
  const statusLiteral = searchLiteral(args.status);
  const limit = rowLimit(args.limit, options.maxRows);
  const offset = rowOffset(args.offset);
  const rows = await runReadQuery(
    db,
    searchStatement(scope, range, literal, statusLiteral, limit, offset),
    options.queryTimeoutMs
  );
  const totalMatched = whole(rows?.[0]?.total_matched);
  return {
    ...rangeMeta(range),
    search: literal || null,
    status: statusLiteral || null,
    totalMatched,
    offset,
    limit,
    hasMore: offset + (rows || []).length < totalMatched,
    jobs: (rows || []).map((row) => ({
      jobId: whole(row.job_id),
      code: row.code || null,
      date: dated(row.date),
      status: row.status_title || null,
      totalCost: money(row.totalcost),
      customerName: row.customer_name || null,
      technicianName: row.technician_name || null
    })),
    notes: [
      "Rows are the authorized jobs for this token only.",
      "Use offset with the same filters when hasMore is true. totalMatched is the full authorized count, not this page."
    ]
  };
}

async function jobStatusCounts(scope, args, db, options) {
  const range = periodOf(args, options.now, "all_time");
  const rows = await runReadQuery(db, jobStatusCountStatement(scope, range), options.queryTimeoutMs);
  const statuses = (rows || []).map((row) => ({
    status: row.status_title || "Unknown",
    jobs: whole(row.jobs)
  }));
  return {
    ...rangeMeta(range),
    totalJobs: statuses.reduce((sum, row) => sum + row.jobs, 0),
    statuses,
    notes: ["Counts use the same authorized job scope as the job list."]
  };
}

async function jobDetails(scope, args, db, options) {
  const jobId = positiveInt(args.jobId ?? args.jobid ?? args.id, "jobId");
  const rows = await runReadQuery(db, jobDetailStatement(scope, jobId), options.queryTimeoutMs);
  const row = rows?.[0];
  if (!row) {
    throw new AiMcpError("No matching record was found in the authorized branch.", 404, "not_found");
  }
  return {
    jobId: whole(row.job_id),
    code: row.code || null,
    date: dated(row.date),
    amountToCollect: money(row.totalcost),
    cashCollected: money(row.cash_collected),
    expensesOnJob: money(row.expenses_on_job),
    status: row.status_title || null,
    customerName: row.customer_name || null,
    technicianName: row.technician_name || null,
    complaintBy: row.complaintby || null,
    priority: row.priority || null,
    notes: [NOTES[0], NOTES[3]]
  };
}

module.exports = {
  NOTES,
  amountToCollectStatement,
  expenseStatement,
  collectionStatement,
  attendanceStatement,
  searchStatement,
  jobStatusCountStatement,
  jobDetailStatement,
  monthlyFinancialSummary,
  totalAmountToCollect,
  totalExpenses,
  collectionSummary,
  branchReport,
  attendanceSummary,
  searchJobs,
  jobStatusCounts,
  jobDetails
};
