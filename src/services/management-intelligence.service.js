const { Prisma } = require("@prisma/client");
const prisma = require("../database/prisma");
const { canManageBranchJobs } = require("../utils/job-access");
const { buildJobStatusKpiContext } = require("../utils/job-stats-kpis");
const {
  resolveIntelligenceRange,
  previousPeriod,
  chartGrain,
  listBuckets,
  percentChange
} = require("../utils/intelligence-range");
const {
  LIMITS,
  getReportDefinition,
  listReportCatalog
} = require("./management-intelligence.catalog");
const { classifyQuestion } = require("./management-intelligence.intent");

const DIMENSIONS = {
  status: {
    label: "Status",
    idExpr: Prisma.sql`j.statusid`,
    nameExpr: Prisma.sql`COALESCE(st.title, 'No status')`,
    joinSql: Prisma.sql`LEFT JOIN jobstatuses st ON st.recno = j.statusid`
  },
  technician: {
    label: "Technician",
    idExpr: Prisma.sql`j.assignedto`,
    nameExpr: Prisma.sql`COALESCE(tu.name, 'Unassigned')`,
    joinSql: Prisma.sql`LEFT JOIN users tu ON tu.userid = j.assignedto`
  },
  customer: {
    label: "Customer",
    idExpr: Prisma.sql`j.customerid`,
    nameExpr: Prisma.sql`COALESCE(cu.name, 'No customer')`,
    joinSql: Prisma.sql`LEFT JOIN customers cu ON cu.customerid = j.customerid`
  },
  category: {
    label: "Category",
    idExpr: Prisma.sql`j.serviceid`,
    nameExpr: Prisma.sql`COALESCE(jc.name, 'No category')`,
    joinSql: Prisma.sql`LEFT JOIN jobcategories jc ON jc.categoryid = j.serviceid`
  },
  fault: {
    label: "Fault",
    idExpr: Prisma.sql`j.faultid`,
    nameExpr: Prisma.sql`COALESCE(jf.name, 'No fault')`,
    joinSql: Prisma.sql`LEFT JOIN jobsubcategories jf ON jf.subcategoryid = j.faultid`
  },
  group: {
    label: "Group",
    idExpr: Prisma.sql`j.groupid`,
    nameExpr: Prisma.sql`COALESCE(jg.name, 'No group')`,
    joinSql: Prisma.sql`LEFT JOIN jobgroups jg ON jg.groupid = j.groupid`
  },
  brand: {
    label: "Brand",
    idExpr: Prisma.sql`j.brandid`,
    nameExpr: Prisma.sql`COALESCE(br.name, 'No brand')`,
    joinSql: Prisma.sql`LEFT JOIN brands br ON br.recno = j.brandid`
  },
  source: {
    label: "Source",
    idExpr: Prisma.sql`j.jobsourceid`,
    nameExpr: Prisma.sql`COALESCE(js.name, 'No source')`,
    joinSql: Prisma.sql`LEFT JOIN jobsources js ON js.recno = j.jobsourceid`
  },
  area: {
    label: "Area",
    idExpr: Prisma.sql`j.area`,
    nameExpr: Prisma.sql`COALESCE(ar.name, 'No area')`,
    joinSql: Prisma.sql`LEFT JOIN areas ar ON ar.recno = j.area`
  },
  city: {
    label: "City",
    idExpr: Prisma.sql`j.city`,
    nameExpr: Prisma.sql`COALESCE(ct.name, 'No city')`,
    joinSql: Prisma.sql`LEFT JOIN cities ct ON ct.recno = j.city`
  },
  product: {
    label: "ERP product",
    idExpr: Prisma.sql`j.erpproductid`,
    nameExpr: Prisma.sql`COALESCE(ep.name, 'No ERP product')`,
    joinSql: Prisma.sql`LEFT JOIN erpproducts ep ON ep.erpproductid = j.erpproductid`
  }
};

const DIMENSION_SORTS = {
  name: Prisma.sql`name`,
  jobs: Prisma.sql`jobs`,
  amountToCollect: Prisma.sql`amount_to_collect`,
  collected: Prisma.sql`collected`,
  expenses: Prisma.sql`expenses`,
  outstanding: Prisma.sql`outstanding`
};

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function formatMoney(value) {
  return money(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function idMatch(columnSql, ids) {
  const valid = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (!valid.length) return Prisma.sql`FALSE`;
  return Prisma.sql`${columnSql} IN (${Prisma.join(valid)})`;
}

function notInIds(ids) {
  const valid = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (!valid.length) return Prisma.sql`TRUE`;
  return Prisma.sql`(j.statusid IS NULL OR j.statusid NOT IN (${Prisma.join(valid)}))`;
}

async function resolveScope(auth) {
  const tenantid = Number(auth?.tenantid);
  const branchid = Number(auth?.branchid);
  const userid = Number(auth?.userid);
  if (!tenantid || !branchid || !userid) {
    httpError("Tenant and branch are required", 400);
  }
  const manageBranch = await canManageBranchJobs(auth);
  return { tenantid, branchid, userid, manageBranch };
}

function jobScope(scope, range) {
  const assigned = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`j.assignedto = ${scope.userid}`;
  return Prisma.sql`
    j.tenantid = ${scope.tenantid}
    AND j.branchid = ${scope.branchid}
    AND ${assigned}
    AND j.date IS NOT NULL
    AND j.date >= ${range.from}
    AND j.date < ${range.to}
  `;
}

function pageQuery(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function sortSql(query, allowlist, fallback) {
  const sortBy = allowlist[query.sortBy] ? query.sortBy : fallback;
  const direction = String(query.sortOrder || "desc").toLowerCase() === "asc"
    ? Prisma.sql`ASC`
    : Prisma.sql`DESC`;
  return { sortBy, direction, expression: allowlist[sortBy] };
}

async function loadStatusContext(tenantid) {
  const rows = await prisma.jobstatuses.findMany({
    where: { tenantid },
    select: {
      recno: true,
      title: true,
      iscancelledstatus: true,
      iscompletedstatus: true,
      isresolvedstatus: true
    }
  });
  return buildJobStatusKpiContext(rows);
}

async function jobTotals(scope, range, context) {
  const terminalIds = [
    ...context.cancelledStatusIds,
    ...context.completedStatusIds,
    ...context.resolvedStatusIds
  ];
  const where = jobScope(scope, range);
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS jobs_in_range,
      (COUNT(*) FILTER (WHERE j.assignedto IS NULL AND ${notInIds(terminalIds)}))::int AS new_jobs,
      (COUNT(*) FILTER (WHERE j.assignedto IS NOT NULL AND ${notInIds(terminalIds)}))::int AS assigned_jobs,
      (COUNT(*) FILTER (WHERE ${idMatch(Prisma.sql`j.statusid`, context.resolvedStatusIds)}))::int AS resolved_jobs,
      (COUNT(*) FILTER (WHERE ${idMatch(Prisma.sql`j.statusid`, context.completedStatusIds)}))::int AS completed_jobs,
      (COUNT(*) FILTER (WHERE ${idMatch(Prisma.sql`j.statusid`, context.cancelledStatusIds)}))::int AS cancelled_jobs,
      (COUNT(*) FILTER (
        WHERE j.followupby IS NOT NULL
          AND ${notInIds(context.completedStatusIds)}
      ))::int AS follow_up_jobs,
      COALESCE(SUM(j.totalcost), 0) AS amount_to_collect,
      COALESCE(SUM(c.amount), 0) AS collected_on_jobs,
      COALESCE(SUM(ex.amount), 0) AS expenses_on_jobs
    FROM job j
    LEFT JOIN jobcollections c ON c.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE ${where}
  `;
  const row = rows[0] || {};
  const newJobs = whole(row.new_jobs);
  const assignedJobs = whole(row.assigned_jobs);
  return {
    jobsInRange: whole(row.jobs_in_range),
    newJobs,
    assignedJobs,
    pendingJobs: newJobs + assignedJobs,
    resolvedJobs: whole(row.resolved_jobs),
    completedJobs: whole(row.completed_jobs),
    cancelledJobs: whole(row.cancelled_jobs),
    followUpJobs: whole(row.follow_up_jobs),
    amountToCollect: money(row.amount_to_collect),
    collectedOnJobs: money(row.collected_on_jobs),
    expensesOnJobs: money(row.expenses_on_jobs),
    outstanding: money(money(row.amount_to_collect) - money(row.collected_on_jobs))
  };
}

async function periodMovement(scope, range, table) {
  const assigned = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`j.assignedto = ${scope.userid}`;
  if (table === "collections") {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(c.amount), 0) AS amount
      FROM jobcollections c
      INNER JOIN job j ON j.recno = c.jobid
      WHERE j.tenantid = ${scope.tenantid}
        AND j.branchid = ${scope.branchid}
        AND ${assigned}
        AND c.collectedat >= ${range.from}
        AND c.collectedat < ${range.to}
    `;
    return money(rows[0]?.amount);
  }
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(e.amount), 0) AS amount
    FROM jobexpenses e
    INNER JOIN job j ON j.recno = e.jobid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assigned}
      AND e.createdat >= ${range.from}
      AND e.createdat < ${range.to}
  `;
  return money(rows[0]?.amount);
}

function bucketExpr(columnSql, grain) {
  const format = grain === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  return Prisma.sql`to_char(${columnSql}, ${format})`;
}

async function trend(scope, range, grain, source) {
  const assigned = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`j.assignedto = ${scope.userid}`;
  if (source === "jobs") {
    return prisma.$queryRaw`
      SELECT ${bucketExpr(Prisma.sql`j.date`, grain)} AS bucket,
             COALESCE(SUM(j.totalcost), 0) AS amount
      FROM job j
      WHERE ${jobScope(scope, range)}
      GROUP BY 1
      ORDER BY 1
    `;
  }
  if (source === "collections") {
    return prisma.$queryRaw`
      SELECT ${bucketExpr(Prisma.sql`c.collectedat`, grain)} AS bucket,
             COALESCE(SUM(c.amount), 0) AS amount
      FROM jobcollections c
      INNER JOIN job j ON j.recno = c.jobid
      WHERE j.tenantid = ${scope.tenantid}
        AND j.branchid = ${scope.branchid}
        AND ${assigned}
        AND c.collectedat >= ${range.from}
        AND c.collectedat < ${range.to}
      GROUP BY 1
      ORDER BY 1
    `;
  }
  return prisma.$queryRaw`
    SELECT ${bucketExpr(Prisma.sql`e.createdat`, grain)} AS bucket,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM jobexpenses e
    INNER JOIN job j ON j.recno = e.jobid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assigned}
      AND e.createdat >= ${range.from}
      AND e.createdat < ${range.to}
    GROUP BY 1
    ORDER BY 1
  `;
}

function fillSeries(buckets, rows) {
  const values = new Map((rows || []).map((row) => [String(row.bucket), money(row.amount)]));
  return buckets.map((bucket) => values.get(bucket) || 0);
}

async function cpairTotals(scope, range) {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(s.totalcpairqty), 0)::int AS cpair_qty,
      COALESCE(SUM(s.totalqtyreceived), 0)::int AS received_qty,
      COALESCE(SUM(s.totalissueqty), 0)::int AS issued_qty,
      COALESCE(SUM(GREATEST(s.totalcpairqty - s.totalqtyreceived, 0)), 0)::int AS outstanding_qty
    FROM jobcpairsummary s
    INNER JOIN job j ON j.recno = s.jobid
    WHERE ${jobScope(scope, range)}
  `;
  const row = rows[0] || {};
  return {
    cpairQty: whole(row.cpair_qty),
    receivedQty: whole(row.received_qty),
    issuedQty: whole(row.issued_qty),
    outstandingQty: whole(row.outstanding_qty)
  };
}

async function attendanceSnapshot(scope) {
  const userFilter = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`userid = ${scope.userid}`;
  const rows = await prisma.$queryRaw`
    SELECT status::text AS status, COUNT(*)::int AS count
    FROM userattendancesession
    WHERE tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
      AND isopen = true
      AND ${userFilter}
    GROUP BY status
  `;
  const counts = { checked_in: 0, on_break: 0, checked_out: 0 };
  rows.forEach((row) => {
    counts[row.status] = whole(row.count);
  });
  return {
    checkedIn: counts.checked_in,
    onBreak: counts.on_break,
    scope: scope.manageBranch ? "branch" : "self"
  };
}

async function liveWork(scope) {
  const travelUser = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`traveledby = ${scope.userid}`;
  const workUser = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`workedby = ${scope.userid}`;
  const travel = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT traveledby)::int AS count
    FROM jobtravelhistory
    WHERE tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
      AND startedat IS NOT NULL
      AND stopedat IS NULL
      AND ${travelUser}
  `;
  const work = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT workedby)::int AS count
    FROM jobworklhistory
    WHERE tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
      AND startedat IS NOT NULL
      AND stopedat IS NULL
      AND ${workUser}
  `;
  return {
    onTheWay: whole(travel[0]?.count),
    onLocation: whole(work[0]?.count)
  };
}

function changePair(current, previous) {
  return {
    current,
    previous,
    difference: money(current - previous),
    percentChange: percentChange(current, previous)
  };
}

async function getOverview(auth, query = {}) {
  const scope = await resolveScope(auth);
  const range = resolveIntelligenceRange(query);
  const prior = previousPeriod(range);
  const context = await loadStatusContext(scope.tenantid);
  const grain = chartGrain(range);
  const buckets = listBuckets(range, grain);

  const [jobs, priorJobs, collectedInPeriod, expensesInPeriod, priorCollected, priorExpenses, jobTrend, collectionTrend, expenseTrend, cpair, attendance, work] =
    await Promise.all([
      jobTotals(scope, range, context),
      jobTotals(scope, prior, context),
      periodMovement(scope, range, "collections"),
      periodMovement(scope, range, "expenses"),
      periodMovement(scope, prior, "collections"),
      periodMovement(scope, prior, "expenses"),
      trend(scope, range, grain, "jobs"),
      trend(scope, range, grain, "collections"),
      trend(scope, range, grain, "expenses"),
      cpairTotals(scope, range),
      attendanceSnapshot(scope),
      liveWork(scope)
    ]);

  const financialChart = {
    id: "amount-expenses-collections",
    title: "Amount to collect, expenses, and collections",
    type: "line",
    categories: buckets,
    series: [
      { name: "Amount to collect", data: fillSeries(buckets, jobTrend) },
      { name: "Recorded expenses", data: fillSeries(buckets, expenseTrend) },
      { name: "Collected cash", data: fillSeries(buckets, collectionTrend) }
    ],
    definition:
      "Amount to collect is summed by job date. Expenses are summed by expense createdat. Collected cash is summed by collectedat."
  };
  const statusChart = {
    id: "job-status",
    title: "Jobs by Jobs List status",
    type: "donut",
    categories: ["New", "Assigned", "Resolved", "Completed", "Cancelled"],
    series: [
      {
        name: "Jobs",
        data: [jobs.newJobs, jobs.assignedJobs, jobs.resolvedJobs, jobs.completedJobs, jobs.cancelledJobs]
      }
    ],
    definition: "Pending jobs are new plus assigned. Follow-up jobs can also sit in another bucket, so they are not on this chart."
  };

  return {
    range,
    previousRange: { label: prior.label, fromDate: prior.fromDate, toDate: prior.toDate },
    scope: scope.manageBranch ? "branch" : "assigned",
    jobs,
    financial: {
      amountToCollect: changePair(jobs.amountToCollect, priorJobs.amountToCollect),
      expensesOnJobs: changePair(jobs.expensesOnJobs, priorJobs.expensesOnJobs),
      collectedOnJobs: changePair(jobs.collectedOnJobs, priorJobs.collectedOnJobs),
      outstanding: jobs.outstanding,
      collectedInPeriod: changePair(collectedInPeriod, priorCollected),
      expensesInPeriod: changePair(expensesInPeriod, priorExpenses)
    },
    cpair,
    attendance,
    work,
    charts: [financialChart, statusChart],
    definitions: {
      amountToCollect: "Sum of job.totalcost for jobs whose job date is in the range. This is the Job Revenue report amount to collect.",
      collectedOnJobs: "Sum of jobcollections.amount on those same jobs.",
      collectedInPeriod: "Sum of jobcollections.amount whose collectedat is in the range.",
      expensesOnJobs: "Sum of jobexpenses.amount recorded against those jobs.",
      expensesInPeriod: "Sum of jobexpenses.amount whose createdat is in the range.",
      outstanding: "Amount to collect minus collected cash on the same jobs. This is not net profit.",
      pendingJobs: "New jobs plus assigned jobs, using the Jobs List status rules.",
      cpair: "Quantities on jobcpairsummary. Outstanding quantity is C-Pair quantity minus quantity received, and is not money.",
      attendance: "Open attendance sessions. checked in and on break are the stored states. Absent, late, and leave are not stored.",
      onTheWay: "Distinct technicians with a jobtravelhistory row that has startedat and no stopedat.",
      onLocation: "Distinct technicians with a jobworklhistory row that has startedat and no stopedat."
    },
    limits: LIMITS
  };
}

function dimensionColumns(label) {
  return [
    { key: "name", label },
    { key: "jobs", label: "Jobs", align: "right" },
    { key: "amountToCollect", label: "Amount to collect", align: "right" },
    { key: "collected", label: "Collected on those jobs", align: "right" },
    { key: "expenses", label: "Expenses on those jobs", align: "right" },
    { key: "outstanding", label: "Outstanding", align: "right" }
  ];
}

async function dimensionReport(scope, range, definition, query) {
  const dimension = DIMENSIONS[definition.dimension];
  if (!dimension) httpError("Report dimension is not available", 400);
  const { page, pageSize, offset } = pageQuery(query);
  const sort = sortSql(query, DIMENSION_SORTS, definition.defaultSort);
  const where = jobScope(scope, range);
  const rows = await prisma.$queryRaw`
    SELECT
      ${dimension.idExpr} AS id,
      ${dimension.nameExpr} AS name,
      COUNT(*)::int AS jobs,
      COALESCE(SUM(j.totalcost), 0) AS amount_to_collect,
      COALESCE(SUM(c.amount), 0) AS collected,
      COALESCE(SUM(ex.amount), 0) AS expenses
    FROM job j
    ${dimension.joinSql}
    LEFT JOIN jobcollections c ON c.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE ${where}
    GROUP BY 1, 2
    ORDER BY ${sort.expression} ${sort.direction}, name ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total FROM (
      SELECT 1
      FROM job j
      ${dimension.joinSql}
      WHERE ${where}
      GROUP BY ${dimension.idExpr}, ${dimension.nameExpr}
    ) grouped
  `;
  return {
    columns: dimensionColumns(dimension.label),
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      jobs: whole(row.jobs),
      amountToCollect: money(row.amount_to_collect),
      collected: money(row.collected),
      expenses: money(row.expenses),
      outstanding: money(money(row.amount_to_collect) - money(row.collected))
    })),
    page,
    pageSize,
    total: whole(totalRows[0]?.total),
    sortBy: sort.sortBy,
    sortOrder: String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    definition:
      "Jobs are included by job date. Collected cash and expenses are the amounts stored against those jobs, not amounts posted on another date."
  };
}

async function balancesReport(scope, range, query) {
  const { page, pageSize, offset } = pageQuery(query);
  const allowlist = {
    jobCode: Prisma.sql`j.code`,
    jobDate: Prisma.sql`j.date`,
    amountToCollect: Prisma.sql`COALESCE(j.totalcost, 0)`,
    collected: Prisma.sql`COALESCE(c.amount, 0)`,
    expenses: Prisma.sql`COALESCE(ex.amount, 0)`,
    outstanding: Prisma.sql`(COALESCE(j.totalcost, 0) - COALESCE(c.amount, 0))`
  };
  const sort = sortSql(query, allowlist, "outstanding");
  const where = jobScope(scope, range);
  const rows = await prisma.$queryRaw`
    SELECT
      j.recno AS id,
      j.code AS job_code,
      j.date AS job_date,
      cu.name AS customer_name,
      tu.name AS technician_name,
      COALESCE(j.totalcost, 0) AS amount_to_collect,
      COALESCE(c.amount, 0) AS collected,
      COALESCE(ex.amount, 0) AS expenses
    FROM job j
    LEFT JOIN customers cu ON cu.customerid = j.customerid
    LEFT JOIN users tu ON tu.userid = j.assignedto
    LEFT JOIN jobcollections c ON c.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE ${where}
    ORDER BY ${sort.expression} ${sort.direction}, j.recno DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total FROM job j WHERE ${where}
  `;
  return {
    columns: [
      { key: "jobCode", label: "Job" },
      { key: "jobDate", label: "Job date" },
      { key: "customerName", label: "Customer" },
      { key: "technicianName", label: "Technician" },
      { key: "amountToCollect", label: "Amount to collect", align: "right" },
      { key: "collected", label: "Collected", align: "right" },
      { key: "expenses", label: "Expenses", align: "right" },
      { key: "outstanding", label: "Outstanding", align: "right" }
    ],
    rows: rows.map((row) => ({
      id: row.id,
      jobId: row.id,
      jobCode: row.job_code,
      jobDate: row.job_date ? new Date(row.job_date).toISOString().slice(0, 10) : null,
      customerName: row.customer_name,
      technicianName: row.technician_name,
      amountToCollect: money(row.amount_to_collect),
      collected: money(row.collected),
      expenses: money(row.expenses),
      outstanding: money(money(row.amount_to_collect) - money(row.collected))
    })),
    page,
    pageSize,
    total: whole(totalRows[0]?.total),
    sortBy: sort.sortBy,
    sortOrder: String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    definition: "One row per job in the job-date range. Outstanding is job.totalcost minus that job's collection."
  };
}

async function collectionsReport(scope, range, query) {
  const { page, pageSize, offset } = pageQuery(query);
  const assigned = scope.manageBranch
    ? Prisma.sql`TRUE`
    : Prisma.sql`j.assignedto = ${scope.userid}`;
  const rows = await prisma.$queryRaw`
    SELECT
      c.collectedby AS id,
      COALESCE(u.name, 'Unknown') AS name,
      COUNT(*)::int AS collections,
      COALESCE(SUM(c.amount), 0) AS collected
    FROM jobcollections c
    INNER JOIN job j ON j.recno = c.jobid
    LEFT JOIN users u ON u.userid = c.collectedby
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assigned}
      AND c.collectedat >= ${range.from}
      AND c.collectedat < ${range.to}
    GROUP BY c.collectedby, u.name
    ORDER BY collected DESC, name ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total FROM (
      SELECT c.collectedby
      FROM jobcollections c
      INNER JOIN job j ON j.recno = c.jobid
      WHERE j.tenantid = ${scope.tenantid}
        AND j.branchid = ${scope.branchid}
        AND ${assigned}
        AND c.collectedat >= ${range.from}
        AND c.collectedat < ${range.to}
      GROUP BY c.collectedby
    ) grouped
  `;
  return {
    columns: [
      { key: "name", label: "Collected by" },
      { key: "collections", label: "Collection rows", align: "right" },
      { key: "collected", label: "Collected cash", align: "right" }
    ],
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      collections: whole(row.collections),
      collected: money(row.collected)
    })),
    page,
    pageSize,
    total: whole(totalRows[0]?.total),
    definition: "Grouped by jobcollections.collectedby and filtered by collectedat. This is cash recorded, not a remittance to the company."
  };
}

async function cpairReport(scope, range, query) {
  const { page, pageSize, offset } = pageQuery(query);
  const rows = await prisma.$queryRaw`
    SELECT
      s.technicianid AS id,
      COALESCE(NULLIF(s.technicianname, ''), u.name, 'Unassigned') AS name,
      COALESCE(SUM(s.totalcpairqty), 0)::int AS cpair_qty,
      COALESCE(SUM(s.totalqtyreceived), 0)::int AS received_qty,
      COALESCE(SUM(s.totalissueqty), 0)::int AS issued_qty,
      COALESCE(SUM(GREATEST(s.totalcpairqty - s.totalqtyreceived, 0)), 0)::int AS outstanding_qty
    FROM jobcpairsummary s
    INNER JOIN job j ON j.recno = s.jobid
    LEFT JOIN users u ON u.userid = s.technicianid
    WHERE ${jobScope(scope, range)}
    GROUP BY 1, 2
    ORDER BY outstanding_qty DESC, name ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total FROM (
      SELECT s.technicianid
      FROM jobcpairsummary s
      INNER JOIN job j ON j.recno = s.jobid
      WHERE ${jobScope(scope, range)}
      GROUP BY s.technicianid
    ) grouped
  `;
  return {
    columns: [
      { key: "name", label: "Technician" },
      { key: "cpairQty", label: "C-Pair qty", align: "right" },
      { key: "receivedQty", label: "Received qty", align: "right" },
      { key: "outstandingQty", label: "Still to receive", align: "right" },
      { key: "issuedQty", label: "Issued qty", align: "right" }
    ],
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      cpairQty: whole(row.cpair_qty),
      receivedQty: whole(row.received_qty),
      outstandingQty: whole(row.outstanding_qty),
      issuedQty: whole(row.issued_qty)
    })),
    page,
    pageSize,
    total: whole(totalRows[0]?.total),
    definition: "Quantities from jobcpairsummary for jobs in the job-date range. These are not currency amounts."
  };
}

async function getReport(auth, reportKey, query = {}) {
  const definition = getReportDefinition(reportKey);
  if (!definition) httpError("Unknown report", 404);
  const scope = await resolveScope(auth);
  const range = resolveIntelligenceRange(query);
  let table;
  if (definition.type === "dimension") table = await dimensionReport(scope, range, definition, query);
  else if (definition.type === "balances") table = await balancesReport(scope, range, query);
  else if (definition.type === "collections") table = await collectionsReport(scope, range, query);
  else if (definition.type === "cpair") table = await cpairReport(scope, range, query);
  else httpError("Unknown report", 404);

  return {
    key: definition.key,
    title: definition.title,
    group: definition.group,
    range,
    scope: scope.manageBranch ? "branch" : "assigned",
    table: {
      id: definition.key,
      title: definition.title,
      ...table
    }
  };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function exportReport(auth, reportKey, query = {}) {
  const report = await getReport(auth, reportKey, { ...query, page: 1, pageSize: 100 });
  const pages = [report];
  const total = report.table.total;
  for (let page = 2; page <= Math.ceil(total / 100) && page <= 50; page += 1) {
    pages.push(await getReport(auth, reportKey, { ...query, page, pageSize: 100 }));
  }
  const columns = report.table.columns;
  const lines = [
    ["Report", report.title].map(csvCell).join(","),
    ["Date range", report.range.label].map(csvCell).join(","),
    ["Scope", report.scope === "branch" ? "Branch jobs" : "Jobs assigned to you"].map(csvCell).join(","),
    ["Definition", report.table.definition].map(csvCell).join(","),
    "",
    columns.map((column) => csvCell(column.label)).join(",")
  ];
  pages.forEach((page) => {
    page.table.rows.forEach((row) => {
      lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
    });
  });
  if (total > 5000) {
    lines.push("");
    lines.push(csvCell("Export stopped at 5,000 rows."));
  }
  return {
    filename: `${report.key}.csv`,
    body: lines.join("\n")
  };
}

const STATUS_REPORT_TITLES = {
  completed_jobs: "Completed jobs",
  cancelled_jobs: "Cancelled jobs",
  pending_jobs: "Pending jobs",
  new_jobs: "New jobs",
  assigned_jobs: "Assigned jobs"
};

const CHART_SERIES_LABELS = {
  collected: "Collected cash",
  expenses: "Recorded expenses",
  amountToCollect: "Amount to collect"
};

function toApexChart(chart) {
  const type = chart.type === "donut" ? "donut" : "line";
  const options = {
    chart: { type, toolbar: { show: false }, zoom: { enabled: false } },
    title: { text: chart.title || "" },
    stroke: { curve: "smooth", width: 2 },
    dataLabels: { enabled: false },
    legend: { position: "top" },
    tooltip: { shared: true, intersect: false }
  };
  if (type === "donut") {
    options.labels = chart.categories;
    return { options, series: chart.series[0]?.data || [] };
  }
  options.xaxis = { categories: chart.categories };
  return { options, series: chart.series };
}

function statusFilterSql(statusKey, context) {
  const terminalIds = [
    ...context.cancelledStatusIds,
    ...context.completedStatusIds,
    ...context.resolvedStatusIds
  ];
  if (statusKey === "completed_jobs") return idMatch(Prisma.sql`j.statusid`, context.completedStatusIds);
  if (statusKey === "cancelled_jobs") return idMatch(Prisma.sql`j.statusid`, context.cancelledStatusIds);
  if (statusKey === "new_jobs") return Prisma.sql`j.assignedto IS NULL AND ${notInIds(terminalIds)}`;
  if (statusKey === "assigned_jobs") return Prisma.sql`j.assignedto IS NOT NULL AND ${notInIds(terminalIds)}`;
  if (statusKey === "pending_jobs") return notInIds(terminalIds);
  return Prisma.sql`TRUE`;
}

function technicianNameSql(technicianName) {
  if (!technicianName) return Prisma.sql`TRUE`;
  return Prisma.sql`tu.name ILIKE ${`%${technicianName}%`}`;
}

async function findTechnicianNames(scope, technicianName) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT tu.name AS name
    FROM users tu
    INNER JOIN job j ON j.assignedto = tu.userid
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND tu.name ILIKE ${`%${technicianName}%`}
    ORDER BY tu.name
    LIMIT 5
  `;
  return rows.map((row) => row.name).filter(Boolean);
}

async function statusJobsReport(scope, range, context, statusKey, technicianName) {
  const rows = await prisma.$queryRaw`
    SELECT
      j.recno AS id,
      j.code AS job_code,
      j.date AS job_date,
      cu.name AS customer_name,
      tu.name AS technician_name,
      st.title AS status_name,
      COALESCE(j.totalcost, 0) AS amount_to_collect,
      COALESCE(c.amount, 0) AS collected,
      COALESCE(ex.amount, 0) AS expenses
    FROM job j
    LEFT JOIN users tu ON tu.userid = j.assignedto
    LEFT JOIN customers cu ON cu.customerid = j.customerid
    LEFT JOIN jobstatuses st ON st.recno = j.statusid
    LEFT JOIN jobcollections c ON c.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE ${jobScope(scope, range)}
      AND ${statusFilterSql(statusKey, context)}
      AND ${technicianNameSql(technicianName)}
    ORDER BY j.date DESC, j.recno DESC
    LIMIT 50
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM job j
    LEFT JOIN users tu ON tu.userid = j.assignedto
    WHERE ${jobScope(scope, range)}
      AND ${statusFilterSql(statusKey, context)}
      AND ${technicianNameSql(technicianName)}
  `;
  return {
    title: STATUS_REPORT_TITLES[statusKey] || "Jobs",
    columns: [
      { key: "jobCode", label: "Job" },
      { key: "jobDate", label: "Job date" },
      { key: "customerName", label: "Customer" },
      { key: "technicianName", label: "Technician" },
      { key: "status", label: "Status" },
      { key: "amountToCollect", label: "Amount to collect", align: "right" },
      { key: "collected", label: "Collected", align: "right" },
      { key: "expenses", label: "Expenses", align: "right" }
    ],
    rows: rows.map((row) => ({
      id: row.id,
      jobId: row.id,
      jobCode: row.job_code,
      jobDate: row.job_date ? new Date(row.job_date).toISOString().slice(0, 10) : null,
      customerName: row.customer_name,
      technicianName: row.technician_name,
      status: row.status_name,
      amountToCollect: money(row.amount_to_collect),
      collected: money(row.collected),
      expenses: money(row.expenses)
    })),
    total: whole(totalRows[0]?.total)
  };
}

async function metricTrend(scope, range, technicianName, metric) {
  const grain = chartGrain(range);
  const bucket = bucketExpr(
    metric === "amountToCollect" ? Prisma.sql`j.date` : metric === "collected" ? Prisma.sql`c.collectedat` : Prisma.sql`e.createdat`,
    grain
  );
  const assigned = scope.manageBranch ? Prisma.sql`TRUE` : Prisma.sql`j.assignedto = ${scope.userid}`;
  const technician = technicianNameSql(technicianName);
  if (metric === "amountToCollect") {
    return prisma.$queryRaw`
      SELECT ${bucket} AS bucket, COALESCE(SUM(j.totalcost), 0) AS amount
      FROM job j
      LEFT JOIN users tu ON tu.userid = j.assignedto
      WHERE ${jobScope(scope, range)} AND ${technician}
      GROUP BY 1
    `;
  }
  if (metric === "collected") {
    return prisma.$queryRaw`
      SELECT ${bucket} AS bucket, COALESCE(SUM(c.amount), 0) AS amount
      FROM jobcollections c
      INNER JOIN job j ON j.recno = c.jobid
      LEFT JOIN users tu ON tu.userid = j.assignedto
      WHERE j.tenantid = ${scope.tenantid}
        AND j.branchid = ${scope.branchid}
        AND ${assigned}
        AND ${technician}
        AND c.collectedat >= ${range.from}
        AND c.collectedat < ${range.to}
      GROUP BY 1
    `;
  }
  return prisma.$queryRaw`
    SELECT ${bucket} AS bucket, COALESCE(SUM(e.amount), 0) AS amount
    FROM jobexpenses e
    INNER JOIN job j ON j.recno = e.jobid
    LEFT JOIN users tu ON tu.userid = j.assignedto
    WHERE j.tenantid = ${scope.tenantid}
      AND j.branchid = ${scope.branchid}
      AND ${assigned}
      AND ${technician}
      AND e.createdat >= ${range.from}
      AND e.createdat < ${range.to}
    GROUP BY 1
  `;
}

async function buildMoneyChart(scope, range, classified) {
  const metrics = classified.chart?.metrics || ["collected", "expenses"];
  const grain = chartGrain(range);
  const categories = listBuckets(range, grain);
  const series = [];
  for (const metric of metrics) {
    const rows = await metricTrend(scope, range, classified.technician, metric);
    series.push({
      name: CHART_SERIES_LABELS[metric] || metric,
      data: fillSeries(categories, rows)
    });
  }
  const who = classified.technician ? ` for ${classified.technician}` : "";
  return toApexChart({
    type: "line",
    title: `${series.map((item) => item.name).join(" vs ")}${who}`,
    categories,
    series
  });
}

function moneySentence(label, pair) {
  const change = pair.percentChange == null
    ? "the previous period was 0, so the percentage change is not shown"
    : `${pair.percentChange}% versus the previous period`;
  return `${label} ${formatMoney(pair.current)} (${change}; previous ${formatMoney(pair.previous)}).`;
}

function answerFromOverview(overview, classified) {
  const scopeText = overview.scope === "branch" ? "this branch" : "jobs assigned to you";
  const lead = `Date range ${overview.range.label}, compared with ${overview.previousRange.label}. Figures are for ${scopeText}.`;
  if (classified.kind === "financial") {
    return [
      lead,
      moneySentence("Amount to collect, by job date,", overview.financial.amountToCollect),
      moneySentence("Expenses recorded in the period,", overview.financial.expensesInPeriod),
      moneySentence("Cash collected in the period,", overview.financial.collectedInPeriod),
      `Outstanding on jobs in the range is ${formatMoney(overview.financial.outstanding)} (amount to collect minus collected cash on those jobs).`,
      "Amount to collect minus expenses is not net profit."
    ].join(" ");
  }
  if (classified.kind === "cpair") {
    const cpair = overview.cpair;
    return [
      lead,
      `C-Pair quantity ${cpair.cpairQty}. Received ${cpair.receivedQty}. Still to receive ${cpair.outstandingQty}. Issued ${cpair.issuedQty}.`,
      "These are quantities, not money."
    ].join(" ");
  }
  if (classified.kind === "attendance") {
    const attendance = overview.attendance;
    const who = attendance.scope === "branch" ? "In this branch right now" : "For your open session";
    return [
      `${who}: ${attendance.checkedIn} checked in, ${attendance.onBreak} on break.`,
      `${overview.work.onTheWay} technician(s) have an open travel record (on the way). ${overview.work.onLocation} have an open work record (on location).`,
      "Absent, late, and leave are not stored. An open travel or work row is current only while its stop time is empty."
    ].join(" ");
  }
  const jobs = overview.jobs;
  return [
    lead,
    `${jobs.jobsInRange} jobs. New ${jobs.newJobs}, assigned ${jobs.assignedJobs}, pending ${jobs.pendingJobs}, resolved ${jobs.resolvedJobs}, completed ${jobs.completedJobs}, cancelled ${jobs.cancelledJobs}, follow-up ${jobs.followUpJobs}.`,
    "Pending is new plus assigned, the same split as the Jobs List."
  ].join(" ");
}

async function answerQuestion(auth, message) {
  const classified = classifyQuestion(message);
  if (classified.kind === "clarify") {
    return {
      kind: "clarify",
      answer:
        "Ask about jobs, amount to collect, expenses, collections, C-Pair quantities, or who is checked in, on the way, or on location. Include a period such as today, this month, or last month.",
      charts: [],
      tables: [],
      reports: listReportCatalog()
    };
  }

  const scope = await resolveScope(auth);
  const range = resolveIntelligenceRange({ range: classified.range });

  if (classified.technician) {
    const names = await findTechnicianNames(scope, classified.technician);
    if (!names.length) {
      return {
        kind: classified.kind,
        answer: `No technician matching ${classified.technician} has jobs in this branch.`,
        charts: [],
        tables: []
      };
    }
  }

  if (classified.kind === "chart") {
    const chart = await buildMoneyChart(scope, range, classified);
    const who = classified.technician ? ` for technician ${classified.technician}` : "";
    return {
      kind: "chart",
      answer: `${chart.options.title.text}. ${range.label}${who}. Collected cash uses the collection date. Expenses use the date the expense was created.`,
      charts: [chart],
      tables: []
    };
  }

  if (classified.kind === "job_report") {
    const context = await loadStatusContext(scope.tenantid);
    if (classified.statusReport === "completed_jobs" && !context.completedStatusIds.length) {
      return {
        kind: "job_report",
        answer: "No job status is marked completed for this organization.",
        charts: [],
        tables: []
      };
    }
    const table = await statusJobsReport(scope, range, context, classified.statusReport, classified.technician);
    const title = STATUS_REPORT_TITLES[classified.statusReport] || "Jobs";
    const extra = table.total > table.rows.length ? ` Showing the first ${table.rows.length} of ${table.total}.` : "";
    return {
      kind: "job_report",
      answer: table.total
        ? `${title} for ${range.label}: ${table.total}.${extra}`
        : `No ${title.toLowerCase()} for ${range.label}.`,
      charts: [],
      tables: table.total ? [{ id: classified.statusReport, title: `${title} — ${range.label}`, ...table }] : []
    };
  }

  const overview = await getOverview(auth, { range: classified.range });
  const charts = [];
  if (classified.kind === "financial" || classified.kind === "jobs") {
    charts.push(toApexChart(classified.kind === "financial" ? overview.charts[0] : overview.charts[1]));
  }
  let table = null;
  if (classified.report) {
    const report = await getReport(auth, classified.report, { range: classified.range, page: 1, pageSize: 10 });
    table = report.table;
  }
  return {
    kind: classified.kind,
    answer: answerFromOverview(overview, classified),
    charts,
    tables: table ? [table] : [],
    range: overview.range,
    definitions: overview.definitions
  };
}

function getCatalog() {
  return {
    ranges: [
      "today",
      "yesterday",
      "this_week",
      "this_month",
      "previous_month",
      "this_quarter",
      "this_year",
      "previous_year",
      "custom"
    ],
    reports: listReportCatalog(),
    limits: LIMITS
  };
}

module.exports = {
  getCatalog,
  getOverview,
  getReport,
  exportReport,
  answerQuestion
};
