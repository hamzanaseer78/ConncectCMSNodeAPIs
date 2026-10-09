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
const { resolveQuestion, detectEntityRef, detectEntityName, pinEntity, buildSuggestions } = require("./management-intelligence.intent");
const {
  resolveConversation,
  toClassified,
  responseTypeFor,
  publicFilters,
  toolName
} = require("./conversation-context");
const {
  decideResolution,
  executionPlan,
  searchJobEntities,
  subjectInScope
} = require("./entity-resolution");
const logger = require("../utils/logger");
const chatSession = require("./ai-chat-session");
const { activeMembershipWhere } = require("../utils/user-branch-access");
const container = require("../utils/service-container");

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
  let statusSql = Prisma.sql`TRUE`;
  if (query.statusKey && query.statusKey !== "all_jobs") {
    const context = await loadStatusContext(scope.tenantid);
    statusSql = statusFilterSql(query.statusKey, context);
  }
  const technicianSql = query.technicianId
    ? Prisma.sql`j.assignedto = ${Number(query.technicianId)}`
    : query.technician
      ? Prisma.sql`EXISTS (
          SELECT 1 FROM users filter_tu
          WHERE filter_tu.userid = j.assignedto
            AND filter_tu.name ILIKE ${`%${query.technician}%`}
        )`
      : Prisma.sql`TRUE`;
  const subjectSql = query.subjectId
    ? recordFilterSql({ type: query.subjectType, id: query.subjectId })
    : Prisma.sql`TRUE`;
  const where = Prisma.sql`${jobScope(scope, range)} AND ${statusSql} AND ${technicianSql} AND ${subjectSql}`;
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
  assigned_jobs: "Assigned jobs",
  all_jobs: "Jobs"
};

const CHART_SERIES_LABELS = {
  collected: "Collected cash",
  expenses: "Recorded expenses",
  amountToCollect: "Amount to collect"
};

function toApexChart(chart) {
  const type = chart.type === "pie" || chart.type === "donut"
    ? chart.type
    : chart.type === "bar"
      ? "bar"
      : "line";
  const options = {
    chart: { type, toolbar: { show: false }, zoom: { enabled: false } },
    title: { text: chart.title || "" },
    stroke: { curve: "smooth", width: 2 },
    dataLabels: { enabled: false },
    legend: { position: "top" },
    tooltip: { shared: true, intersect: false }
  };
  if (type === "donut" || type === "pie") {
    options.labels = chart.categories;
    options.stroke = { width: 0 };
    options.tooltip = { shared: false, intersect: false };
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
  if (statusKey === "resolved_jobs") return idMatch(Prisma.sql`j.statusid`, context.resolvedStatusIds);
  return Prisma.sql`TRUE`;
}

function technicianNameSql(technicianName, entity) {
  if (entity?.id && (entity.type === "technician" || entity.type === "user")) {
    return Prisma.sql`tu.userid = ${Number(entity.id)}`;
  }
  if (!technicianName) return Prisma.sql`TRUE`;
  return Prisma.sql`tu.name ILIKE ${`%${technicianName}%`}`;
}

function recordFilterSql(entity) {
  if (!entity?.id) return Prisma.sql`TRUE`;
  const id = Number(entity.id);
  if (entity.type === "customer") return Prisma.sql`j.customerid = ${id}`;
  if (entity.type === "category") return Prisma.sql`j.serviceid = ${id}`;
  if (entity.type === "fault") return Prisma.sql`j.faultid = ${id}`;
  if (entity.type === "brand") return Prisma.sql`j.brandid = ${id}`;
  if (entity.type === "group") return Prisma.sql`j.groupid = ${id}`;
  if (entity.type === "technician" || entity.type === "user") return Prisma.sql`j.assignedto = ${id}`;
  return Prisma.sql`FALSE`;
}

function subjectPhrase(classified) {
  if (classified.entity?.id && classified.entity.name) {
    const label = {
      customer: "customer",
      technician: "technician",
      user: "user",
      brand: "brand",
      category: "category",
      fault: "subcategory",
      group: "group"
    }[classified.entity.type] || classified.entity.type;
    return ` for ${label} ${classified.entity.name}`;
  }
  return classified.technician ? ` assigned to ${classified.technician}` : "";
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

async function statusJobsReport(scope, range, context, statusKey, technicianName, entity, listByStatus) {
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
      AND ${technicianNameSql(technicianName, entity)}
      AND ${recordFilterSql(entity)}
    ORDER BY ${listByStatus ? Prisma.sql`st.title NULLS LAST, ` : Prisma.sql``}j.date DESC, j.recno DESC
    LIMIT 50
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM job j
    LEFT JOIN users tu ON tu.userid = j.assignedto
    WHERE ${jobScope(scope, range)}
      AND ${statusFilterSql(statusKey, context)}
      AND ${technicianNameSql(technicianName, entity)}
      AND ${recordFilterSql(entity)}
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

async function sumFilteredJobs(scope, range, context, statusKey, technicianName, entity) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS jobs,
      COALESCE(SUM(j.totalcost), 0) AS amount_to_collect,
      COALESCE(SUM(c.amount), 0) AS collected,
      COALESCE(SUM(ex.amount), 0) AS expenses
    FROM job j
    LEFT JOIN users tu ON tu.userid = j.assignedto
    LEFT JOIN jobcollections c ON c.jobid = j.recno
    LEFT JOIN (
      SELECT jobid, SUM(amount) AS amount
      FROM jobexpenses
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      GROUP BY jobid
    ) ex ON ex.jobid = j.recno
    WHERE ${jobScope(scope, range)}
      AND ${statusFilterSql(statusKey || "all_jobs", context)}
      AND ${technicianNameSql(technicianName, entity)}
      AND ${recordFilterSql(entity)}
  `;
  const row = rows[0] || {};
  return {
    jobs: whole(row.jobs),
    amountToCollect: money(row.amount_to_collect),
    collected: money(row.collected),
    expenses: money(row.expenses)
  };
}

async function metricTrend(scope, range, technicianName, metric, entity) {
  const grain = chartGrain(range);
  const bucket = bucketExpr(
    metric === "amountToCollect" ? Prisma.sql`j.date` : metric === "collected" ? Prisma.sql`c.collectedat` : Prisma.sql`e.createdat`,
    grain
  );
  const assigned = scope.manageBranch ? Prisma.sql`TRUE` : Prisma.sql`j.assignedto = ${scope.userid}`;
  const technician = technicianNameSql(technicianName, entity);
  const record = recordFilterSql(entity);
  if (metric === "amountToCollect") {
    return prisma.$queryRaw`
      SELECT ${bucket} AS bucket, COALESCE(SUM(j.totalcost), 0) AS amount
      FROM job j
      LEFT JOIN users tu ON tu.userid = j.assignedto
      WHERE ${jobScope(scope, range)} AND ${technician} AND ${record}
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
        AND ${record}
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
      AND ${record}
      AND e.createdat >= ${range.from}
      AND e.createdat < ${range.to}
    GROUP BY 1
  `;
}

async function buildMoneyChart(scope, range, classified) {
  const metrics = classified.chart?.metrics?.length ? classified.chart.metrics : ["collected", "expenses"];
  const grain = chartGrain(range);
  const categories = listBuckets(range, grain);
  const series = [];
  for (const metric of metrics) {
    const rows = await metricTrend(scope, range, classified.technician, metric, classified.entity);
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
    const focus = classified.focus;
    const lines = [lead];
    if (!focus || focus === "financial" || focus === "amountToCollect") {
      lines.push(moneySentence("Amount to collect, by job date,", overview.financial.amountToCollect));
    }
    if (!focus || focus === "financial" || focus === "expenses") {
      lines.push(moneySentence("Expenses recorded in the period,", overview.financial.expensesInPeriod));
    }
    if (!focus || focus === "financial" || focus === "collected") {
      lines.push(moneySentence("Cash collected in the period,", overview.financial.collectedInPeriod));
    }
    if (!focus || focus === "financial" || focus === "outstanding" || focus === "amountToCollect") {
      lines.push(`Outstanding on jobs in the range is ${formatMoney(overview.financial.outstanding)} (amount to collect minus collected cash on those jobs).`);
    }
    if (!focus || focus === "financial") {
      lines.push("Amount to collect minus expenses is not net profit.");
    }
    return lines.join(" ");
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

function finishAnswer(auth, message, payload) {
  chatSession.remember(auth, message, payload.answer);
  if (payload && Object.prototype.hasOwnProperty.call(payload, "conversationState")) {
    chatSession.rememberState(auth, payload.conversationState);
  }
  return payload;
}

function focusedMoneyMetrics(classified) {
  if (classified.focus === "expenses") return ["expenses"];
  if (classified.focus === "collected") return ["collected"];
  if (classified.focus === "amountToCollect") return ["amountToCollect"];
  if (classified.focus === "outstanding") return ["amountToCollect", "collected"];
  return null;
}

async function answerProfile(auth, classified) {
  const user = await prisma.users.findUnique({
    where: { userid: Number(auth.userid) },
    select: { name: true, email: true }
  });
  if (classified.profileField === "email") {
    const email = user?.email || auth.email || "";
    return {
      kind: "profile",
      answer: email ? `Your email is ${email}.` : "No email is stored on your user.",
      charts: [],
      tables: []
    };
  }
  const name = user?.name || auth.name || "";
  return {
    kind: "profile",
    answer: name ? `Your name is ${name}.` : "No name is stored on your user.",
    charts: [],
    tables: []
  };
}

async function answerBranches(auth) {
  const rows = await prisma.userorganizations.findMany({
    where: activeMembershipWhere({
      userid: Number(auth.userid),
      tenantid: Number(auth.tenantid),
      branchid: { not: null }
    }),
    include: {
      branches: { select: { branchid: true, name: true } }
    }
  });
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    const branchId = Number(row.branchid);
    if (!branchId || seen.has(branchId)) continue;
    seen.add(branchId);
    names.push(row.branches?.name || `Branch ${branchId}`);
  }
  const countLabel = names.length === 1 ? "1 branch" : `${names.length} branches`;
  const list = names.length ? `: ${names.join(", ")}` : "";
  return {
    kind: "branches",
    answer: `You have ${countLabel}${list}.`,
    charts: [],
    tables: []
  };
}

function personList(names) {
  const unique = [...new Set(names.filter(Boolean))];
  return unique.length ? unique.join(", ") : "none";
}

async function branchPeople(scope) {
  const userFilter = scope.manageBranch ? Prisma.sql`TRUE` : Prisma.sql`uo.userid = ${scope.userid}`;
  return prisma.$queryRaw`
    SELECT
      u.userid,
      u.name,
      u.email,
      u.usertype::text AS usertype,
      u.technicianaffiliation::text AS affiliation,
      u.companyname
    FROM userorganizations uo
    INNER JOIN users u ON u.userid = uo.userid
    WHERE uo.tenantid = ${scope.tenantid}
      AND uo.branchid = ${scope.branchid}
      AND (uo.isblocked = false OR uo.isblocked IS NULL)
      AND (u.isactive = true OR u.isactive IS NULL)
      AND (u.isdeleted = false OR u.isdeleted IS NULL)
      AND ${userFilter}
    ORDER BY u.name
  `;
}

async function openSessions(scope) {
  const userFilter = scope.manageBranch ? Prisma.sql`TRUE` : Prisma.sql`userid = ${scope.userid}`;
  return prisma.$queryRaw`
    SELECT userid, status::text AS status
    FROM userattendancesession
    WHERE tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
      AND isopen = true
      AND ${userFilter}
  `;
}

async function liveNames(scope, table, userColumn) {
  const userFilter = scope.manageBranch ? Prisma.sql`TRUE` : Prisma.sql`${Prisma.raw(userColumn)} = ${scope.userid}`;
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT u.name AS name
    FROM ${Prisma.raw(table)} t
    INNER JOIN users u ON u.userid = t.${Prisma.raw(userColumn)}
    WHERE t.tenantid = ${scope.tenantid}
      AND t.branchid = ${scope.branchid}
      AND t.startedat IS NOT NULL
      AND t.stopedat IS NULL
      AND ${userFilter}
    ORDER BY u.name
  `;
  return rows.map((row) => row.name).filter(Boolean);
}

async function answerAttendance(auth, classified) {
  const scope = await resolveScope(auth);
  const [people, sessions, onTheWay, onLocation] = await Promise.all([
    branchPeople(scope),
    openSessions(scope),
    liveNames(scope, "jobtravelhistory", "traveledby"),
    liveNames(scope, "jobworklhistory", "workedby")
  ]);
  const byUser = new Map(sessions.map((row) => [Number(row.userid), row.status]));
  const checkedIn = [];
  const onBreak = [];
  const noSession = [];
  people.forEach((person) => {
    const status = byUser.get(Number(person.userid));
    if (status === "checked_in") checkedIn.push(person.name);
    else if (status === "on_break") onBreak.push(person.name);
    else noSession.push(person.name);
  });
  const focus = classified.attendanceFocus;
  const lines = [
    "Absent, late, and leave are not stored. An open attendance session is current only while it is still open."
  ];
  if (focus === "absent" || focus === "late" || focus === "attendance") {
    lines.push(`No open attendance session: ${personList(noSession)}. That is not a recorded absence.`);
  }
  if (!focus || focus === "attendance" || focus === "checked_in" || focus === "absent") {
    lines.push(`Checked in: ${personList(checkedIn)}.`);
  }
  if (!focus || focus === "attendance" || focus === "on_break" || focus === "absent") {
    lines.push(`On break: ${personList(onBreak)}.`);
  }
  if (!focus || focus === "attendance" || focus === "on_the_way") {
    lines.push(`On the way: ${personList(onTheWay)}.`);
  }
  if (!focus || focus === "attendance" || focus === "on_location") {
    lines.push(`On location: ${personList(onLocation)}.`);
  }
  return {
    kind: "attendance",
    answer: lines.join(" "),
    charts: [],
    tables: []
  };
}

async function answerTechnicians(auth, classified) {
  const scope = await resolveScope(auth);
  const [people, sessions] = await Promise.all([branchPeople(scope), openSessions(scope)]);
  const byUser = new Map(sessions.map((row) => [Number(row.userid), row.status]));
  const needle = String(classified.entity?.name || classified.technician || "").toLowerCase();
  const technicians = people.filter((person) => {
    if (classified.entity?.id) return Number(person.userid) === Number(classified.entity.id);
    if (person.usertype !== "technician") return false;
    if (!needle) return true;
    return String(person.name || "").toLowerCase().includes(needle);
  });
  if (!technicians.length) {
    return {
      kind: "technicians",
      answer: needle
        ? `No technician matching ${classified.technician} is in this branch.`
        : "No technicians are in this branch.",
      charts: [],
      tables: []
    };
  }
  const rows = technicians.map((person) => ({
    id: person.userid,
    name: person.name,
    email: person.email,
    affiliation: person.affiliation,
    company: person.companyname,
    attendance: byUser.get(Number(person.userid)) || "no open session"
  }));
  const summary = rows
    .map((row) => `${row.name} (${row.attendance}${row.affiliation ? `, ${row.affiliation}` : ""})`)
    .join("; ");
  return {
    kind: "technicians",
    answer: `${rows.length === 1 ? "Technician" : "Technicians"}: ${summary}.`,
    charts: [],
    tables: [{
      id: "technicians",
      title: "Technicians",
      columns: [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "affiliation", label: "Affiliation" },
        { key: "attendance", label: "Attendance" }
      ],
      rows
    }]
  };
}

function moduleLabel(row) {
  return row?.name || row?.title || row?.description || row?.code || row?.email || null;
}

async function answerModule(auth, classified, message) {
  const moduleQuestion = classified.module;
  try {
    const service = container.getGenericService(moduleQuestion.resource);
    const result = await service.list(auth, { page: 1, pageSize: 10 });
    const rows = result.data || [];
    const total = result.pagination?.total ?? rows.length;
    const labels = rows.map(moduleLabel).filter(Boolean);
    const showRows = /list|show|which|who/.test(String(message || "").toLowerCase());
    const names = showRows && labels.length ? ` ${labels.join(", ")}.` : "";
    return {
      kind: "module",
      answer: `${moduleQuestion.label}: ${total}.${names}`,
      charts: [],
      tables: showRows && labels.length ? [{
        id: moduleQuestion.resource,
        title: moduleQuestion.label,
        columns: [{ key: "name", label: "Name" }],
        rows: labels.map((name, index) => ({ id: index, name }))
      }] : []
    };
  } catch (err) {
    return {
      kind: "module",
      answer: err.message || `Could not read ${moduleQuestion.label}.`,
      charts: [],
      tables: []
    };
  }
}

function matchLabel(type, row) {
  if (type === "technician" || type === "user") {
    return [row.name, row.email, row.contactno, row.usertype, row.affiliation, row.companyname].filter(Boolean).join(" · ");
  }
  if (type === "category") {
    return [row.name, row.group_name ? `group ${row.group_name}` : null, row.isactive === false ? "inactive" : null].filter(Boolean).join(" · ");
  }
  if (type === "fault") {
    return [row.name, row.category_name ? `category ${row.category_name}` : null].filter(Boolean).join(" · ");
  }
  return [row.name, row.isactive === false ? "inactive" : "active"].filter(Boolean).join(" · ");
}

function likeTerm(name) {
  return `%${String(name || "").replace(/[%_\\]/g, "")}%`;
}

async function lookupNamedRows(scope, named) {
  const like = likeTerm(named.name);
  if (named.type === "technician" || named.type === "user") {
    const typeSql = named.type === "technician"
      ? Prisma.sql`AND u.usertype::text = 'technician'`
      : Prisma.sql``;
    return prisma.$queryRaw`
      SELECT u.userid AS id, u.name, u.email, u.contactno, u.usertype::text AS usertype,
             u.technicianaffiliation::text AS affiliation, u.companyname
      FROM users u
      INNER JOIN userorganizations uo ON uo.userid = u.userid
      WHERE uo.tenantid = ${scope.tenantid}
        AND uo.branchid = ${scope.branchid}
        AND (uo.isblocked = false OR uo.isblocked IS NULL)
        AND (u.isdeleted = false OR u.isdeleted IS NULL)
        AND u.name ILIKE ${like}
        ${typeSql}
      ORDER BY u.name
      LIMIT 8
    `;
  }
  if (named.type === "category") {
    return prisma.$queryRaw`
      SELECT c.categoryid AS id, c.name, g.name AS group_name, c.isactive
      FROM jobcategories c
      LEFT JOIN jobgroups g ON g.groupid = c.groupid
      WHERE c.tenantid = ${scope.tenantid}
        AND (c.branchid IS NULL OR c.branchid = ${scope.branchid})
        AND c.name ILIKE ${like}
      ORDER BY c.name
      LIMIT 8
    `;
  }
  if (named.type === "fault") {
    return prisma.$queryRaw`
      SELECT s.subcategoryid AS id, s.name, c.name AS category_name, s.isactive
      FROM jobsubcategories s
      LEFT JOIN jobcategories c ON c.categoryid = s.categoryid
      WHERE s.tenantid = ${scope.tenantid}
        AND (s.branchid IS NULL OR s.branchid = ${scope.branchid})
        AND s.name ILIKE ${like}
      ORDER BY s.name
      LIMIT 8
    `;
  }
  return prisma.$queryRaw`
    SELECT b.recno AS id, b.name, b.isactive
    FROM brands b
    WHERE b.tenantid = ${scope.tenantid}
      AND b.name ILIKE ${like}
    ORDER BY b.name
    LIMIT 8
  `;
}

async function lookupEntityById(scope, ref) {
  if (ref.type === "technician" || ref.type === "user") {
    const typeSql = ref.type === "technician"
      ? Prisma.sql`AND u.usertype::text = 'technician'`
      : Prisma.sql``;
    return prisma.$queryRaw`
      SELECT u.userid AS id, u.name
      FROM users u
      INNER JOIN userorganizations uo ON uo.userid = u.userid
      WHERE uo.tenantid = ${scope.tenantid}
        AND uo.branchid = ${scope.branchid}
        AND u.userid = ${ref.id}
        ${typeSql}
      LIMIT 1
    `;
  }
  if (ref.type === "category") {
    return prisma.$queryRaw`
      SELECT c.categoryid AS id, c.name
      FROM jobcategories c
      WHERE c.tenantid = ${scope.tenantid}
        AND c.categoryid = ${ref.id}
      LIMIT 1
    `;
  }
  if (ref.type === "fault") {
    return prisma.$queryRaw`
      SELECT s.subcategoryid AS id, s.name
      FROM jobsubcategories s
      WHERE s.tenantid = ${scope.tenantid}
        AND s.subcategoryid = ${ref.id}
      LIMIT 1
    `;
  }
  return prisma.$queryRaw`
    SELECT b.recno AS id, b.name
    FROM brands b
    WHERE b.tenantid = ${scope.tenantid}
      AND b.recno = ${ref.id}
    LIMIT 1
  `;
}

async function disambiguate(auth, message) {
  const ref = detectEntityRef(message);
  const named = detectEntityName(message);
  if (!ref && !named) return null;
  const scope = await resolveScope(auth);
  if (ref) {
    const rows = await lookupEntityById(scope, ref);
    if (!rows.length) {
      return {
        response: {
          kind: "confirm",
          answer: `No ${ref.word} with id ${ref.id} is in this branch.`,
          suggestions: buildSuggestions(message),
          charts: [],
          tables: []
        }
      };
    }
    return { entity: { type: ref.type, id: ref.id, name: rows[0].name, word: ref.word } };
  }
  const rows = await lookupNamedRows(scope, named);
  if (!rows.length) {
    return {
      response: {
        kind: "confirm",
        answer: `No ${named.word} matching ${named.name} is in this branch.`,
        suggestions: buildSuggestions(message),
        charts: [],
        tables: []
      }
    };
  }
  if (rows.length === 1) {
    return { entity: { type: named.type, id: Number(rows[0].id), name: rows[0].name, word: named.word, detail: matchLabel(named.type, rows[0]) } };
  }
  return {
    response: {
      kind: "confirm",
      answer: `More than one ${named.word} matches ${named.name}. Which one do you mean?`,
      suggestions: rows.map((row) => ({
        label: matchLabel(named.type, row),
        message: pinEntity(message, named.word, row.id)
      })),
      charts: [],
      tables: []
    }
  };
}

async function answerScoped(scope, range, classified) {
  const context = await loadStatusContext(scope.tenantid);
  const statusKey = classified.statusReport || "all_jobs";
  const current = await sumFilteredJobs(scope, range, context, statusKey, classified.technician, classified.entity);
  let prior = null;
  let priorRange = null;
  if (classified.comparison) {
    priorRange = previousPeriod(range);
    prior = await sumFilteredJobs(scope, priorRange, context, statusKey, classified.technician, classified.entity);
  }
  const who = subjectPhrase(classified);
  const statusLabel = classified.statusFilter ? `${classified.statusFilter} ` : "";
  if (classified.kind === "financial") {
    const focus = classified.focus;
    const pick = (row) => focus === "expenses" ? row.expenses : focus === "collected" ? row.collected : row.amountToCollect;
    const metric = focus === "expenses" ? "Expenses" : focus === "collected" ? "Collected cash" : "Amount to collect";
    const note = focus === "expenses"
      ? "Expenses are the sum of jobexpenses.amount stored on these jobs."
      : focus === "collected"
        ? "Collected cash is jobcollections.amount on these jobs."
        : "Amount to collect is the sum of job.totalcost on these jobs. It is not cash collected and it is not profit.";
    let answer = `${metric} for the ${statusLabel}jobs${who} is ${formatMoney(pick(current))} (${range.label}). ${note}`;
    if (prior) {
      answer += ` ${range.label} compared with ${priorRange.label}: ${formatMoney(pick(current))} versus ${formatMoney(pick(prior))}.`;
    }
    return {
      kind: "financial",
      responseType: classified.comparison ? "report" : "summary",
      tool: focus === "amountToCollect" ? "cms_job_revenue_report" : "cms_jobs_stats_kpis",
      answer,
      charts: [],
      tables: []
    };
  }
  let answer = `You have ${current.jobs} ${statusLabel}jobs${who} for ${range.label}.`;
  if (classified.statusFilter === "pending") {
    answer += " Pending is new plus assigned, the same split as the Jobs List.";
  }
  if (prior) {
    answer += ` ${range.label} compared with ${priorRange.label}: ${current.jobs} versus ${prior.jobs}.`;
  }
  return {
    kind: "jobs",
    responseType: classified.comparison ? "report" : "summary",
    tool: "cms_jobs_stats_kpis",
    answer,
    charts: [],
    tables: []
  };
}

async function answerQuestion(auth, message, history, clientState, stateProvided) {
  const resolution = resolveConversation(
    message,
    chatSession.stateFor(auth, clientState, Boolean(stateProvided))
  );
  let state = resolution.state;
  let classified = resolution.handled
    ? resolution.classified
    : resolveQuestion(message, chatSession.historyFor(auth, history));
  const deliver = (payload) => {
    const plan = executionPlan(state);
    let next = payload;
    let skipTool = ["clarify", "confirm", "greeting", "profile", "branches", "explain"].includes(next.kind);
    if (!plan.ok && !skipTool) {
      next = {
        kind: "clarify",
        responseType: "clarification",
        answer: `I couldn't apply ${state.filters.requestedName} to this request, so I did not retrieve jobs.`,
        suggestions: [],
        charts: [],
        tables: []
      };
      skipTool = true;
    }
    const tool = next.tool || (skipTool ? null : toolName(classified));
    if (tool) state = { ...state, lastSuccessfulTool: tool };
    const suggestions = next.suggestions?.length
      ? next.suggestions
      : (resolution.handled && !skipTool ? resolution.suggestions : next.suggestions);
    return finishAnswer(auth, message, {
      ...next,
      suggestions,
      conversationState: state,
      responseType: next.responseType || responseTypeFor(next, classified),
      appliedFilters: publicFilters(state),
      executionPlan: plan,
      entity: state.entity || null,
      source: { tool: tool || null, executed: Boolean(tool) }
    });
  };
  if (resolution.clarification) {
    return deliver({
      kind: "clarify",
      responseType: "clarification",
      answer: resolution.clarification,
      suggestions: resolution.suggestions,
      charts: [],
      tables: []
    });
  }
  if (classified.kind === "greeting") {
    return deliver( {
      kind: "greeting",
      answer: "Hello. I can answer with your name, technicians, jobs, attendance, customers, products, or a report.",
      charts: [],
      tables: []
    });
  }
  if (classified.kind === "profile") {
    return deliver( await answerProfile(auth, classified));
  }
  if (classified.kind === "branches") {
    return deliver( await answerBranches(auth));
  }
  if (classified.kind === "attendance") {
    return deliver( await answerAttendance(auth, classified));
  }
  if (classified.kind === "clarify") {
    return deliver( {
      kind: "clarify",
      answer: "That isn't something Connect CMS can answer. Try one of these:",
      suggestions: buildSuggestions(message),
      charts: [],
      tables: []
    });
  }

  const lookupMessage = classified.technician && !detectEntityRef(message) && !detectEntityName(message)
    ? `technician ${classified.technician}`
    : message;
  const named = await disambiguate(auth, lookupMessage);
  if (named?.response) return deliver( named.response);
  if (named?.entity) {
    classified = {
      ...classified,
      entity: named.entity,
      technician: named.entity.type === "technician" || named.entity.type === "user"
        ? named.entity.name
        : classified.technician
    };
    if (named.entity.type === "technician" || named.entity.type === "user") {
      state = {
        ...state,
        filters: {
          ...state.filters,
          technician: named.entity.name,
          technicianId: named.entity.id
        }
      };
    }
  }

  if (classified.kind === "technicians") {
    return deliver( await answerTechnicians(auth, classified));
  }
  if (classified.kind === "module" && classified.entity) {
    return deliver( {
      kind: "module",
      answer: `${classified.entity.word}: ${classified.entity.detail || classified.entity.name}.`,
      charts: [],
      tables: []
    });
  }
  if (classified.kind === "module") {
    return deliver( await answerModule(auth, classified, message));
  }

  const scope = await resolveScope(auth);
  const range = resolveIntelligenceRange({ range: classified.range });

  if (state?.filters?.requestedName) {
    let candidates = [];
    try {
      candidates = await searchJobEntities(prisma, scope, state.filters.requestedName);
    } catch (err) {
      logger.error("Entity resolution failed", { tenantid: scope.tenantid, branchid: scope.branchid }, err);
      return deliver({
        kind: "clarify",
        responseType: "clarification",
        answer: `I couldn't look up ${state.filters.requestedName}, so I did not retrieve jobs.`,
        charts: [],
        tables: [],
        suggestions: []
      });
    }
    const decision = decideResolution({
      requestedName: state.filters.requestedName,
      hintedType: state.filters.hintedType,
      preferredType: state.filters.preferredType,
      candidates
    }, scope);
    logger.info("Entity resolution", {
      outcome: decision.outcome,
      requestedName: state.filters.requestedName,
      hintedType: state.filters.hintedType || null,
      candidateCount: candidates.length,
      types: [...new Set(candidates.map((item) => item.entityType))],
      tenantid: scope.tenantid,
      branchid: scope.branchid
    });
    if (decision.outcome === "resolved") {
      const person = decision.subject.type === "technician" || decision.subject.type === "user";
      state = {
        ...state,
        filters: {
          ...state.filters,
          subject: decision.subject,
          requestedName: null,
          pendingCandidates: null,
          hintedType: null,
          technician: person ? decision.subject.name : null,
          technicianId: person ? decision.subject.id : null
        }
      };
      classified = toClassified(state);
    } else {
      state = {
        ...state,
        filters: {
          ...state.filters,
          subject: null,
          technicianId: null,
          pendingCandidates: decision.choices || null
        }
      };
      return deliver({
        kind: "clarify",
        responseType: "clarification",
        answer: decision.message,
        suggestions: decision.suggestions,
        charts: [],
        tables: []
      });
    }
  } else if (state?.filters?.subject?.id) {
    const allowed = await subjectInScope(prisma, scope, state.filters.subject);
    if (!allowed) {
      const missingName = state.filters.subject.name;
      state = {
        ...state,
        filters: { ...state.filters, subject: null, technician: null, technicianId: null }
      };
      return deliver({
        kind: "clarify",
        responseType: "clarification",
        answer: `I couldn't find ${missingName} in this branch, so I did not retrieve jobs.`,
        charts: [],
        tables: [],
        suggestions: []
      });
    }
    classified = toClassified(state);
  }

  if (classified.technician && !classified.entity?.id) {
    const names = await findTechnicianNames(scope, classified.technician);
    if (!names.length) {
      return deliver( {
        kind: classified.kind,
        answer: `No technician matching ${classified.technician} has jobs in this branch.`,
        charts: [],
        tables: []
      });
    }
  }

  if (classified.kind === "dimension_report" && classified.report) {
    const report = await getReport(auth, classified.report, {
      range: classified.range,
      page: 1,
      pageSize: 20,
      sortBy: "jobs",
      sortOrder: "desc",
      statusKey: classified.statusReport,
      technician: classified.entity?.type === "technician" || classified.entity?.type === "user" ? classified.technician : null,
      technicianId: classified.entity?.type === "technician" || classified.entity?.type === "user" ? classified.entity.id : null,
      subjectType: classified.entity?.type || null,
      subjectId: classified.entity?.id || null
    });
    const rows = report.table?.rows || [];
    return deliver({
      kind: "dimension_report",
      responseType: "report",
      tool: "getReport",
      answer: rows.length
        ? `Here is ${report.title} for ${report.range.label}.`
        : `No rows to break down for ${report.range.label}.`,
      charts: [],
      tables: rows.length ? [report.table] : [],
      pagination: {
        page: 1,
        pageSize: rows.length,
        total: report.table?.total ?? rows.length,
        totalPages: report.table?.totalPages || 1
      }
    });
  }

  if (
    resolution.handled
    && (classified.kind === "jobs" || classified.kind === "financial")
    && (classified.statusFilter || classified.technician || classified.comparison || classified.entity?.id)
  ) {
    return deliver(await answerScoped(scope, range, classified));
  }

  if (classified.kind === "group_chart" && classified.report) {
    const report = await getReport(auth, classified.report, {
      range: classified.range,
      page: 1,
      pageSize: 12,
      sortBy: "jobs",
      sortOrder: "desc",
      statusKey: classified.statusReport,
      technician: classified.entity?.type === "technician" || classified.entity?.type === "user" ? classified.technician : null,
      technicianId: classified.entity?.type === "technician" || classified.entity?.type === "user" ? classified.entity.id : null,
      subjectType: classified.entity?.type || null,
      subjectId: classified.entity?.id || null
    });
    const rows = report.table?.rows || [];
    const chartType = classified.chart?.type === "pie" || classified.chart?.type === "donut" || classified.chart?.type === "line"
      ? classified.chart.type
      : "bar";
    const chart = toApexChart({
      type: chartType,
      title: report.title,
      categories: rows.map((row) => row.name || "None"),
      series: [{ name: "Jobs", data: rows.map((row) => Number(row.jobs) || 0) }]
    });
    const shape = chartType === "pie" || chartType === "donut" ? "Each slice is the number of jobs." : "The bars are the number of jobs.";
    return deliver( {
      kind: "group_chart",
      answer: rows.length
        ? `${report.title} for ${report.range.label}. ${shape}`
        : `No jobs to group for ${report.range.label}.`,
      charts: rows.length ? [chart] : [],
      tables: rows.length ? [report.table] : []
    });
  }

  if (classified.kind === "explain") {
    return deliver( {
      kind: "explain",
      answer: "The previous reply was a summary of job counts for that date range. Pending is new plus assigned, the same split as the Jobs List. It is not the job list. Ask for the job list to see each job.",
      suggestions: [
        { label: "Show the job list", message: "show the job list" },
        { label: "Status wise job list", message: "give me status wise jobs list" }
      ],
      charts: [],
      tables: []
    });
  }

  if (classified.kind === "chart") {
    const chart = await buildMoneyChart(scope, range, classified);
    const who = classified.technician ? ` for technician ${classified.technician}` : "";
    return deliver( {
      kind: "chart",
      answer: `${chart.options.title.text}. ${range.label}${who}. Collected cash uses the collection date. Expenses use the date the expense was created. Amount to collect uses the job date.`,
      charts: [chart],
      tables: []
    });
  }

  if (classified.kind === "job_report") {
    const context = await loadStatusContext(scope.tenantid);
    if (classified.statusReport === "completed_jobs" && !context.completedStatusIds.length) {
      return deliver( {
        kind: "job_report",
        answer: "No job status is marked completed for this organization.",
        charts: [],
        tables: []
      });
    }
    const table = await statusJobsReport(scope, range, context, classified.statusReport, classified.technician, classified.entity, classified.listByStatus);
    const title = classified.listByStatus
      ? "Jobs by status"
      : (STATUS_REPORT_TITLES[classified.statusReport] || "Jobs");
    const extra = table.total > table.rows.length ? ` Showing the first ${table.rows.length} of ${table.total}.` : "";
    const who = subjectPhrase(classified);
    const statusWord = classified.statusFilter ? `${classified.statusFilter} ` : "";
    let answer;
    if (!table.total) {
      answer = `No ${statusWord}jobs${who} for ${range.label}.`;
    } else if (classified.listByStatus) {
      answer = `Here is the status-wise job list for ${range.label}${who}: ${table.total} jobs.${extra}`;
    } else if (classified.intent === "ENTITY_REPORT") {
      answer = `Here is the jobs report for ${range.label}${who}: ${table.total} jobs.${extra}`;
    } else {
      answer = `Here are the ${table.total} ${statusWord}jobs${who} for ${range.label}.${extra}`;
    }
    return deliver({
      kind: "job_report",
      responseType: classified.intent === "ENTITY_REPORT" ? "report" : "table",
      tool: "statusJobsReport",
      answer,
      charts: [],
      tables: table.total ? [{ id: classified.statusReport, title: `${title} — ${range.label}`, ...table }] : [],
      pagination: {
        page: 1,
        pageSize: 50,
        total: table.total,
        totalPages: Math.ceil(table.total / 50) || 0
      }
    });
  }

  const overview = await getOverview(auth, { range: classified.range });
  const charts = [];
  const focusedMetrics = classified.kind === "financial" ? focusedMoneyMetrics(classified) : null;
  if (classified.chart && focusedMetrics) {
    charts.push(await buildMoneyChart(scope, range, {
      technician: classified.technician,
      chart: { metrics: focusedMetrics }
    }));
  } else if (classified.chart && (classified.kind === "financial" || classified.kind === "jobs")) {
    charts.push(toApexChart(classified.kind === "financial" ? overview.charts[0] : overview.charts[1]));
  }
  let table = null;
  if (classified.report) {
    const report = await getReport(auth, classified.report, {
      range: classified.range,
      page: 1,
      pageSize: 10,
      subjectType: classified.entity?.type || null,
      subjectId: classified.entity?.id || null
    });
    table = report.table;
  }
  let answer = answerFromOverview(overview, classified);
  if (classified.technician && focusedMetrics && charts[0]) {
    const totals = (charts[0].series || []).map((series) => {
      const total = (series.data || []).reduce((sum, value) => sum + Number(value || 0), 0);
      return `${series.name} ${formatMoney(total)}`;
    });
    answer = `${range.label} for technician ${classified.technician}. ${totals.join(". ")}. Collected cash uses the collection date. Expenses use the date the expense was created. Amount to collect uses the job date.`;
  }
  return deliver({
    kind: classified.kind,
    tool: "getOverview",
    answer,
    charts,
    tables: table ? [table] : [],
    range: overview.range,
    definitions: overview.definitions
  });
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
      "year_to_date",
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
