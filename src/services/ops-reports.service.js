const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const {
  buildJobStatusKpiContext,
  buildCancelledJobsWhere,
  buildNotInTerminalStatusesWhere,
  mergeWhereClauses
} = require("../utils/job-stats-kpis");
const {
  emptyBucketCounts,
  bucketField,
  openAgingBucketId,
  resolutionHours,
  firstResponseHours
} = require("../utils/job-resolution-aging");
const { parseEquipmentFromRemarks } = require("../utils/job-equipment");

const REPORT_KEYS = Object.freeze([
  "open_job_aging",
  "technician_performance",
  "outstanding_collections",
  "expenses_by_technician",
  "first_response_sla",
  "on_the_way_on_location",
  "cancelled_jobs",
  "repeat_jobs",
  "quotation_funnel",
  "parts_used",
  "cpair_aging"
]);

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function whole(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function paginate(rows, query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requested = Math.max(Number(query.pageSize || 25), 1);
  const pageSize = Math.min(requested, GRAPHQL_MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  return {
    data: rows.slice(skip, skip + pageSize),
    pageInfo: {
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.ceil(rows.length / pageSize) || 0
    }
  };
}

function emptyRow(partial = {}) {
  return {
    id: "",
    name: null,
    technicianId: null,
    technicianName: null,
    customerId: null,
    customerName: null,
    jobId: null,
    jobCode: null,
    jobDate: null,
    status: null,
    sessionType: null,
    startedAt: null,
    quotationStatus: null,
    serialNumber: null,
    productName: null,
    qty: null,
    hours: null,
    avgResolutionHours: null,
    assignedJobs: null,
    resolvedJobs: null,
    completedJobs: null,
    cancelledJobs: null,
    openJobs: null,
    jobCount: null,
    singleDay: null,
    threeDays: null,
    fiveDays: null,
    sevenDays: null,
    overSevenDays: null,
    amountToCollect: null,
    collectedAmount: null,
    outstanding: null,
    expenses: null,
    pendingReceiveQty: null,
    pendingIssueQty: null,
    drillDownFilter: {},
    ...partial
  };
}

async function loadStatusContext(tenantid) {
  const statuses = await prisma.jobstatuses.findMany({
    where: { tenantid: Number(tenantid) },
    select: {
      recno: true,
      title: true,
      iscompletedstatus: true,
      isresolvedstatus: true,
      iscancelledstatus: true
    }
  });
  return buildJobStatusKpiContext(statuses);
}

async function technicianNames(ids) {
  const unique = [...new Set(ids.filter((id) => id != null).map(Number))];
  if (!unique.length) return new Map();
  const rows = await prisma.users.findMany({
    where: { userid: { in: unique } },
    select: { userid: true, name: true }
  });
  return new Map(rows.map((row) => [row.userid, row.name || null]));
}

function jobSelectBase() {
  return {
    recno: true,
    code: true,
    date: true,
    assignedto: true,
    customerid: true,
    totalcost: true,
    isresolved: true,
    iscompleted: true,
    isfirstresponse: true,
    quotationstatus: true,
    statusid: true,
    customers: { select: { customerid: true, name: true } },
    users: { select: { userid: true, name: true } },
    jobstatuses: { select: { recno: true, title: true } },
    jobdetails: {
      orderBy: { recno: "asc" },
      take: 1,
      select: {
        assignedat: true,
        firstresponseat: true,
        createdat: true,
        resolvedat: true,
        remarks: true
      }
    }
  };
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function openJobAging(jobs) {
  const now = new Date();
  const buckets = new Map();
  jobs.forEach((job) => {
    const bucket = openAgingBucketId(job, now);
    const field = bucketField(bucket);
    if (!field) return;
    const technicianId = job.assignedto != null ? Number(job.assignedto) : null;
    const key = technicianId == null ? "unassigned" : String(technicianId);
    if (!buckets.has(key)) {
      buckets.set(key, emptyRow({
        id: key,
        technicianId,
        technicianName: technicianId == null ? "Unassigned" : job.users?.name || null,
        ...emptyBucketCounts(),
        drillDownFilter: technicianId == null ? { assignedToUnassigned: true } : { assignedToId: technicianId }
      }));
    }
    buckets.get(key)[field] += 1;
  });
  const rows = [...buckets.values()];
  const names = await technicianNames(rows.map((row) => row.technicianId));
  rows.forEach((row) => {
    if (row.technicianId != null) {
      row.technicianName = names.get(row.technicianId) || row.technicianName || `Technician ${row.technicianId}`;
    }
    row.name = row.technicianName;
  });
  rows.sort((a, b) => String(a.technicianName).localeCompare(String(b.technicianName)));
  return rows;
}

async function technicianPerformance(jobs, context) {
  const cancelled = new Set(context.cancelledStatusIds || []);
  const buckets = new Map();
  jobs.forEach((job) => {
    const technicianId = job.assignedto != null ? Number(job.assignedto) : null;
    const key = technicianId == null ? "unassigned" : String(technicianId);
    if (!buckets.has(key)) {
      buckets.set(key, emptyRow({
        id: key,
        technicianId,
        technicianName: technicianId == null ? "Unassigned" : job.users?.name || null,
        assignedJobs: 0,
        resolvedJobs: 0,
        completedJobs: 0,
        cancelledJobs: 0,
        openJobs: 0,
        hours: 0,
        jobCount: 0,
        drillDownFilter: technicianId == null ? { assignedToUnassigned: true } : { assignedToId: technicianId }
      }));
    }
    const row = buckets.get(key);
    row.assignedJobs += 1;
    if (job.isresolved === true) row.resolvedJobs += 1;
    if (job.iscompleted === true) row.completedJobs += 1;
    if (cancelled.has(Number(job.statusid))) row.cancelledJobs += 1;
    if (job.isresolved !== true && job.iscompleted !== true && !cancelled.has(Number(job.statusid))) {
      row.openJobs += 1;
    }
    const hours = resolutionHours(job);
    if (hours != null) {
      row.hours += hours;
      row.jobCount += 1;
    }
  });
  const rows = [...buckets.values()];
  const names = await technicianNames(rows.map((row) => row.technicianId));
  rows.forEach((row) => {
    if (row.technicianId != null) {
      row.technicianName = names.get(row.technicianId) || row.technicianName || `Technician ${row.technicianId}`;
    }
    row.name = row.technicianName;
    row.avgResolutionHours = row.jobCount ? Math.round((row.hours / row.jobCount) * 100) / 100 : 0;
  });
  rows.sort((a, b) => String(a.technicianName).localeCompare(String(b.technicianName)));
  return rows;
}

async function outstandingCollections(jobs) {
  const buckets = new Map();
  jobs.forEach((job) => {
    const technicianId = job.assignedto != null ? Number(job.assignedto) : null;
    const key = technicianId == null ? "unassigned" : String(technicianId);
    if (!buckets.has(key)) {
      buckets.set(key, emptyRow({
        id: key,
        technicianId,
        technicianName: technicianId == null ? "Unassigned" : job.users?.name || null,
        amountToCollect: 0,
        collectedAmount: 0,
        outstanding: 0,
        jobCount: 0,
        drillDownFilter: technicianId == null ? { assignedToUnassigned: true } : { assignedToId: technicianId }
      }));
    }
    const collected = money(job.jobcollections?.amount);
    const amount = money(job.totalcost);
    const row = buckets.get(key);
    row.amountToCollect += amount;
    row.collectedAmount += collected;
    row.outstanding += amount - collected;
    row.jobCount += 1;
  });
  const rows = [...buckets.values()].map((row) => ({
    ...row,
    amountToCollect: money(row.amountToCollect),
    collectedAmount: money(row.collectedAmount),
    outstanding: money(row.outstanding),
    name: row.technicianName
  }));
  const names = await technicianNames(rows.map((row) => row.technicianId));
  rows.forEach((row) => {
    if (row.technicianId != null) {
      row.technicianName = names.get(row.technicianId) || row.technicianName || `Technician ${row.technicianId}`;
      row.name = row.technicianName;
    }
  });
  rows.sort((a, b) => String(a.technicianName).localeCompare(String(b.technicianName)));
  return rows;
}

async function expensesByTechnician(auth, query, where) {
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const expenseWhere = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid),
    job: where
  };
  if (from || to) {
    expenseWhere.createdat = {};
    if (from) expenseWhere.createdat.gte = from;
    if (to) expenseWhere.createdat.lte = to;
  }
  const rows = await prisma.jobexpenses.findMany({
    where: expenseWhere,
    select: {
      amount: true,
      job: { select: { assignedto: true, users: { select: { name: true } } } }
    }
  });
  const buckets = new Map();
  rows.forEach((line) => {
    const technicianId = line.job?.assignedto != null ? Number(line.job.assignedto) : null;
    const key = technicianId == null ? "unassigned" : String(technicianId);
    if (!buckets.has(key)) {
      buckets.set(key, emptyRow({
        id: key,
        technicianId,
        technicianName: technicianId == null ? "Unassigned" : line.job?.users?.name || null,
        expenses: 0,
        jobCount: 0,
        drillDownFilter: technicianId == null ? { assignedToUnassigned: true } : { assignedToId: technicianId }
      }));
    }
    const bucket = buckets.get(key);
    bucket.expenses += money(line.amount);
    bucket.jobCount += 1;
  });
  const result = [...buckets.values()].map((row) => ({
    ...row,
    expenses: money(row.expenses),
    name: row.technicianName
  }));
  result.sort((a, b) => String(a.technicianName).localeCompare(String(b.technicianName)));
  return result;
}

function firstResponseRows(jobs) {
  return jobs.map((job) =>
    emptyRow({
      id: String(job.recno),
      jobId: job.recno,
      jobCode: job.code || null,
      jobDate: iso(job.date),
      technicianId: job.assignedto != null ? Number(job.assignedto) : null,
      technicianName: job.users?.name || (job.assignedto ? `Technician ${job.assignedto}` : "Unassigned"),
      customerName: job.customers?.name || null,
      status: job.jobstatuses?.title || null,
      hours: firstResponseHours(job),
      name: job.code || String(job.recno),
      drillDownFilter: { jobId: job.recno }
    })
  );
}

function liveSessionRows(jobs) {
  const rows = [];
  jobs.forEach((job) => {
    const travel = (job.jobtravelhistory || []).find((row) => row.startedat && !row.stopedat);
    const work = (job.jobworklhistory || []).find((row) => row.startedat && !row.stopedat);
    const push = (sessionType, startedAt) => {
      rows.push(
        emptyRow({
          id: `${sessionType}-${job.recno}`,
          jobId: job.recno,
          jobCode: job.code || null,
          jobDate: iso(job.date),
          sessionType,
          startedAt: iso(startedAt),
          technicianId: job.assignedto != null ? Number(job.assignedto) : null,
          technicianName: job.users?.name || "Unassigned",
          customerName: job.customers?.name || null,
          status: job.jobstatuses?.title || null,
          name: job.code || String(job.recno),
          drillDownFilter: { jobId: job.recno }
        })
      );
    };
    if (travel) push("On the way", travel.startedat);
    if (work) push("On location", work.startedat);
  });
  return rows;
}

function cancelledJobRows(jobs) {
  return jobs.map((job) =>
    emptyRow({
      id: String(job.recno),
      jobId: job.recno,
      jobCode: job.code || null,
      jobDate: iso(job.date),
      technicianName: job.users?.name || "Unassigned",
      technicianId: job.assignedto != null ? Number(job.assignedto) : null,
      customerName: job.customers?.name || null,
      status: job.jobstatuses?.title || null,
      name: job.code || String(job.recno),
      drillDownFilter: { jobId: job.recno }
    })
  );
}

function repeatJobRows(jobs) {
  const byCustomer = new Map();
  const bySerial = new Map();
  jobs.forEach((job) => {
    const customerId = job.customerid != null ? Number(job.customerid) : null;
    if (customerId) {
      if (!byCustomer.has(customerId)) {
        byCustomer.set(customerId, emptyRow({
          id: `c-${customerId}`,
          customerId,
          customerName: job.customers?.name || `Customer ${customerId}`,
          jobCount: 0,
          name: job.customers?.name || `Customer ${customerId}`,
          drillDownFilter: { customerId }
        }));
      }
      byCustomer.get(customerId).jobCount += 1;
    }
    const serial = parseEquipmentFromRemarks(job.jobdetails?.[0]?.remarks)?.serialNumber;
    if (serial) {
      const key = String(serial).trim();
      if (key) {
        if (!bySerial.has(key)) {
          bySerial.set(key, emptyRow({
            id: `s-${key}`,
            serialNumber: key,
            jobCount: 0,
            name: key,
            drillDownFilter: { productSerial: key }
          }));
        }
        bySerial.get(key).jobCount += 1;
      }
    }
  });
  return [...byCustomer.values(), ...bySerial.values()]
    .filter((row) => Number(row.jobCount) > 1)
    .sort((a, b) => Number(b.jobCount) - Number(a.jobCount));
}

function quotationFunnelRows(jobs) {
  const buckets = new Map();
  jobs.forEach((job) => {
    const status = job.quotationstatus ? String(job.quotationstatus) : "NONE";
    if (!buckets.has(status)) {
      buckets.set(status, emptyRow({
        id: status,
        quotationStatus: status === "NONE" ? null : status,
        name: status === "NONE" ? "No quotation" : status,
        jobCount: 0,
        drillDownFilter: status === "NONE" ? {} : { quotationStatus: status }
      }));
    }
    buckets.get(status).jobCount += 1;
  });
  return [...buckets.values()].sort((a, b) => Number(b.jobCount) - Number(a.jobCount));
}

function partsUsedRows(lines) {
  return lines.map((line) =>
    emptyRow({
      id: String(line.recno),
      jobId: line.job?.recno || null,
      jobCode: line.job?.code || null,
      jobDate: iso(line.job?.date),
      productName: line.products?.name || line.partno || null,
      qty: line.qty != null ? Number(line.qty) : 0,
      technicianName: line.job?.users?.name || null,
      customerName: line.job?.customers?.name || null,
      name: line.products?.name || String(line.recno),
      drillDownFilter: line.job?.recno ? { jobId: line.job.recno } : {}
    })
  );
}

function cpairAgingRows(parts, now = new Date()) {
  return parts
    .map((part) => {
      const pendingReceive = Math.max(0, whole(part.qty) - whole(part.lineqtyreceived));
      const pendingIssue = Math.max(0, whole(part.lineqtyreceived) - whole(part.lineissueqty));
      if (pendingReceive <= 0 && pendingIssue <= 0) return null;
      const hours = part.createdat ? (now.getTime() - new Date(part.createdat).getTime()) / 3600000 : null;
      const bucket = openAgingBucketId(hours);
      return emptyRow({
        id: String(part.recno),
        jobId: part.jobid,
        jobCode: part.job?.code || null,
        productName: part.partname || null,
        qty: whole(part.qty),
        pendingReceiveQty: pendingReceive,
        pendingIssueQty: pendingIssue,
        hours: hours != null ? Math.round(hours * 100) / 100 : null,
        technicianName: part.summary?.technicianname || part.job?.users?.name || null,
        customerName: part.summary?.customername || part.job?.customers?.name || null,
        name: part.partname || String(part.recno),
        status: bucket,
        drillDownFilter: part.jobid ? { jobId: part.jobid } : {}
      });
    })
    .filter(Boolean);
}

class OpsReportsService {
  isKnown(reportKey) {
    return REPORT_KEYS.includes(String(reportKey || ""));
  }

  async getReport(auth, reportKey, args = {}) {
    const key = String(reportKey || "");
    if (!this.isKnown(key)) {
      const err = new Error(`Unknown ops report: ${key}`);
      err.status = 400;
      throw err;
    }

    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const query = graphqlJobsFilterToQuery(args.filter, args);
    delete query.resolutionBucket;
    delete query.openAgingBucket;
    const where = await service.applyFilters(auth, query);
    const context = await loadStatusContext(auth.tenantid);
    const openWhere = mergeWhereClauses(
      mergeWhereClauses(where, buildNotInTerminalStatusesWhere(context)),
      { isresolved: { not: true }, iscompleted: { not: true } }
    );
    const cancelledWhere = mergeWhereClauses(where, buildCancelledJobsWhere(context));

    let rows = [];

    if (key === "open_job_aging") {
      const jobs = await prisma.job.findMany({ where: openWhere, select: jobSelectBase() });
      rows = await openJobAging(jobs);
    } else if (key === "technician_performance") {
      const jobs = await prisma.job.findMany({ where, select: jobSelectBase() });
      rows = await technicianPerformance(jobs, context);
    } else if (key === "outstanding_collections") {
      const jobs = await prisma.job.findMany({
        where,
        select: { ...jobSelectBase(), jobcollections: { select: { amount: true } } }
      });
      rows = await outstandingCollections(jobs);
    } else if (key === "expenses_by_technician") {
      rows = await expensesByTechnician(auth, query, where);
    } else if (key === "first_response_sla") {
      const jobs = await prisma.job.findMany({ where, select: jobSelectBase() });
      rows = firstResponseRows(jobs);
    } else if (key === "on_the_way_on_location") {
      const jobs = await prisma.job.findMany({
        where: mergeWhereClauses(where, {
          OR: [
            { jobtravelhistory: { some: { startedat: { not: null }, stopedat: null } } },
            { jobworklhistory: { some: { startedat: { not: null }, stopedat: null } } }
          ]
        }),
        select: {
          ...jobSelectBase(),
          jobtravelhistory: { select: { startedat: true, stopedat: true } },
          jobworklhistory: { select: { startedat: true, stopedat: true } }
        }
      });
      rows = liveSessionRows(jobs);
    } else if (key === "cancelled_jobs") {
      const jobs = await prisma.job.findMany({ where: cancelledWhere, select: jobSelectBase() });
      rows = cancelledJobRows(jobs);
    } else if (key === "repeat_jobs") {
      const jobs = await prisma.job.findMany({ where, select: jobSelectBase() });
      rows = repeatJobRows(jobs);
    } else if (key === "quotation_funnel") {
      const jobs = await prisma.job.findMany({
        where,
        select: { quotationstatus: true }
      });
      rows = quotationFunnelRows(jobs);
    } else if (key === "parts_used") {
      const lines = await prisma.jobproducts.findMany({
        where: {
          tenantid: Number(auth.tenantid),
          branchid: Number(auth.branchid),
          isserviceitem: { not: true },
          qty: { gt: 0 },
          job: { ...where, isinwaranty: { not: true } }
        },
        include: {
          products: { select: { name: true } },
          job: {
            select: {
              recno: true,
              code: true,
              date: true,
              users: { select: { name: true } },
              customers: { select: { name: true } }
            }
          }
        },
        take: GRAPHQL_MAX_PAGE_SIZE
      });
      rows = partsUsedRows(lines);
    } else if (key === "cpair_aging") {
      const parts = await prisma.jobcpairparts.findMany({
        where: { tenantid: Number(auth.tenantid), branchid: Number(auth.branchid), job: where },
        include: {
          job: { select: { recno: true, code: true, users: { select: { name: true } }, customers: { select: { name: true } } } },
          summary: { select: { technicianname: true, customername: true } }
        },
        take: GRAPHQL_MAX_PAGE_SIZE
      });
      rows = cpairAgingRows(parts);
    }

    const paged = paginate(rows, query);
    return {
      mode: isManager ? "all" : "my",
      reportKey: key,
      ...paged
    };
  }
}

module.exports = new OpsReportsService();
module.exports.REPORT_KEYS = REPORT_KEYS;
