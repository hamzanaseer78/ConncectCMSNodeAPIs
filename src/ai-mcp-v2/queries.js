const { Prisma } = require("@prisma/client");
const { AiMcpError } = require("./errors");
const { monthRange } = require("./range");
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

function jobDateSql(scope, range) {
  return Prisma.sql`
    j.tenantid = ${scope.tenantid}
    AND j.branchid = ${scope.branchid}
    AND ${assignedSql(scope)}
    AND j.date IS NOT NULL
    AND j.date >= ${range.from}
    AND j.date < ${range.to}
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
      AND e.createdat IS NOT NULL
      AND e.createdat >= ${range.from}
      AND e.createdat < ${range.to}
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
      AND c.collectedat >= ${range.from}
      AND c.collectedat < ${range.to}
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

function searchStatement(scope, literal, limit) {
  const textFilter = literal
    ? Prisma.sql`AND (
        POSITION(${literal} IN LOWER(COALESCE(j.code, ''))) > 0
        OR POSITION(${literal} IN LOWER(COALESCE(j.manualjobno, ''))) > 0
        OR POSITION(${literal} IN LOWER(COALESCE(c.name, ''))) > 0
      )`
    : Prisma.sql``;
  return Prisma.sql`
    SELECT
      j.recno AS job_id,
      j.code,
      j.date,
      j.totalcost,
      c.name AS customer_name,
      u.name AS technician_name
    FROM job j
    LEFT JOIN customers c
      ON c.customerid = j.customerid
      AND c.tenantid = j.tenantid
      AND c.branchid = j.branchid
    LEFT JOIN userorganizations uo
      ON uo.userid = j.assignedto
      AND uo.tenantid = ${scope.tenantid}
      AND uo.branchid = ${scope.branchid}
    LEFT JOIN users u ON u.userid = uo.userid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assignedSql(scope)}
      ${textFilter}
    ORDER BY j.date DESC NULLS LAST, j.recno DESC
    LIMIT ${limit}
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
    LEFT JOIN jobcollections col
      ON col.jobid = j.recno
      AND col.tenantid = ${scope.tenantid}
      AND col.branchid = ${scope.branchid}
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

function periodOf(args, now) {
  const period = args?.period || "this_month";
  if (period !== "this_month" && period !== "previous_month") {
    throw new AiMcpError("period must be this_month or previous_month.", 400, "invalid_period");
  }
  return monthRange(period, now);
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
    period: range.period,
    label: range.label,
    from: range.from.toISOString().slice(0, 10),
    toExclusive: range.to.toISOString().slice(0, 10),
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
    label: range.label,
    from: range.from.toISOString().slice(0, 10),
    toExclusive: range.to.toISOString().slice(0, 10),
    amountToCollect: money(row.amount),
    jobsInPeriod: whole(row.jobs),
    notes: [NOTES[0], NOTES[3]]
  };
}

async function totalExpenses(scope, args, db, options) {
  const range = periodOf(args, options.now);
  const row = await readOne(db, expenseStatement(scope, range), options.queryTimeoutMs);
  return {
    label: range.label,
    from: range.from.toISOString().slice(0, 10),
    toExclusive: range.to.toISOString().slice(0, 10),
    totalExpenses: money(row.amount),
    expenseCount: whole(row.rows),
    notes: [NOTES[2], NOTES[3]]
  };
}

async function collectionSummary(scope, args, db, options) {
  const range = periodOf(args, options.now);
  const row = await readOne(db, collectionStatement(scope, range), options.queryTimeoutMs);
  return {
    label: range.label,
    from: range.from.toISOString().slice(0, 10),
    toExclusive: range.to.toISOString().slice(0, 10),
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
  const literal = searchLiteral(args.search);
  const limit = rowLimit(args.limit, options.maxRows);
  const rows = await runReadQuery(db, searchStatement(scope, literal, limit), options.queryTimeoutMs);
  return {
    jobs: (rows || []).map((row) => ({
      jobId: whole(row.job_id),
      code: row.code || null,
      date: dated(row.date),
      totalCost: money(row.totalcost),
      customerName: row.customer_name || null,
      technicianName: row.technician_name || null
    }))
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
  jobDetailStatement,
  monthlyFinancialSummary,
  totalAmountToCollect,
  totalExpenses,
  collectionSummary,
  branchReport,
  attendanceSummary,
  searchJobs,
  jobDetails
};
