const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const { getAvailableJobFilters } = require("./jobs-list.service");
const reportColumnsService = require("./report-columns.service");
const {
  normalizeTechnicianAffiliation
} = require("../utils/technician-affiliation");
const {
  TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
  TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
  DEFAULT_SUMMARY_COLUMNS,
  DEFAULT_DETAIL_COLUMNS,
  SUMMARY_SORT_FIELD_MAP,
  DETAIL_SORT_FIELD_MAP,
  assertTechnicianMonthlyBillsDateRange,
  parseReportDateRange,
  aggregateSummaryRows,
  buildDetailRowsFromActivity,
  sortReportRows,
  paginateRows,
  buildTechnicianMonthlyBillsFilterMeta
} = require("../reports/technician-monthly-bills-report");

const JOB_RELATION_INCLUDE = {
  customers: { select: { name: true, contactno: true, address: true } },
  users: { select: { userid: true, name: true, technicianaffiliation: true, companyname: true } },
  jobstatuses: { select: { title: true, color: true } },
  cities: { select: { name: true } },
  areas: { select: { name: true } },
  jobdetails: {
    select: { description: true, address: true, remarks: true },
    orderBy: { recno: "asc" },
    take: 1
  }
};

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function resolveTechnicianIdFilter(filter = {}) {
  const raw =
    filter.technicianId ??
    filter.technicianid ??
    filter.assignedToId ??
    filter.assignedto ??
    null;
  if (raw == null || raw === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function loadBranchTechnicianIds(auth, affiliationFilter = null) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);

  const memberships = await prisma.userorganizations.findMany({
    where: { tenantid, branchid, isblocked: false },
    select: { userid: true }
  });
  const memberIds = [...new Set(memberships.map((row) => row.userid).filter(Boolean))];
  if (!memberIds.length) return [];

  const users = await prisma.users.findMany({
    where: {
      userid: { in: memberIds },
      usertype: "technician",
      isdeleted: { not: true },
      isactive: { not: false },
      ...(affiliationFilter ? { technicianaffiliation: affiliationFilter } : {})
    },
    select: {
      userid: true,
      name: true,
      technicianaffiliation: true,
      companyname: true
    }
  });

  return users;
}

async function resolveAllowedTechnicianIds(auth, filter = {}) {
  const affiliation = normalizeTechnicianAffiliation(filter.technicianAffiliation, {
    required: false
  });
  const technicianId = resolveTechnicianIdFilter(filter);
  const isManager = await canManageBranchJobs(auth);

  if (!isManager) {
    return {
      technicianIds: [Number(auth.userid)],
      usersById: await loadUsersById([Number(auth.userid)])
    };
  }

  let technicians = await loadBranchTechnicianIds(auth, affiliation);
  if (technicianId != null) {
    technicians = technicians.filter((row) => Number(row.userid) === technicianId);
  }

  const technicianIds = technicians.map((row) => Number(row.userid));
  const usersById = new Map(technicians.map((row) => [Number(row.userid), row]));

  return { technicianIds, usersById };
}

async function loadUsersById(ids = []) {
  if (!ids.length) return new Map();
  const rows = await prisma.users.findMany({
    where: { userid: { in: ids } },
    select: {
      userid: true,
      name: true,
      technicianaffiliation: true,
      companyname: true
    }
  });
  return new Map(rows.map((row) => [Number(row.userid), row]));
}

async function loadEligibleJobIds(auth, filter = {}) {
  const isManager = await canManageBranchJobs(auth);
  const service = buildListService(isManager);
  const jobFilterQuery = graphqlJobsFilterToQuery(filter, {});
  delete jobFilterQuery.from;
  delete jobFilterQuery.to;
  delete jobFilterQuery.page;
  delete jobFilterQuery.pageSize;
  delete jobFilterQuery.sortBy;
  delete jobFilterQuery.sortOrder;
  delete jobFilterQuery.technicianAffiliation;
  delete jobFilterQuery.technicianId;
  delete jobFilterQuery.technicianid;

  const where = await service.applyFilters(auth, jobFilterQuery);
  const rows = await prisma.job.findMany({
    where,
    select: { recno: true }
  });
  return new Set(rows.map((row) => Number(row.recno)));
}

async function loadActivity(auth, filter = {}) {
  const scope = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };
  const { fromDate, toDate } = parseReportDateRange(filter);
  const { technicianIds, usersById } = await resolveAllowedTechnicianIds(auth, filter);

  if (!technicianIds.length) {
    return { collections: [], expenses: [], usersById, jobIds: new Set() };
  }

  const eligibleJobIds = await loadEligibleJobIds(auth, filter);
  if (!eligibleJobIds.size) {
    return { collections: [], expenses: [], usersById, jobIds: new Set() };
  }

  const jobIdList = [...eligibleJobIds];
  const technicianIdList = technicianIds;

  const [collections, expenses] = await Promise.all([
    prisma.jobcollections.findMany({
      where: {
        ...scope,
        jobid: { in: jobIdList },
        collectedby: { in: technicianIdList },
        collectedat: { gte: fromDate, lte: toDate }
      },
      select: {
        jobid: true,
        collectedby: true,
        amount: true,
        collectedat: true
      }
    }),
    prisma.jobexpenses.findMany({
      where: {
        ...scope,
        jobid: { in: jobIdList },
        createdby: { in: technicianIdList },
        createdat: { gte: fromDate, lte: toDate }
      },
      select: {
        jobid: true,
        createdby: true,
        amount: true,
        createdat: true
      }
    })
  ]);

  const jobIds = new Set([
    ...collections.map((row) => Number(row.jobid)),
    ...expenses.map((row) => Number(row.jobid))
  ]);

  return { collections, expenses, usersById, jobIds };
}

async function loadJobsById(jobIds = []) {
  if (!jobIds.length) return new Map();
  const rows = await prisma.job.findMany({
    where: { recno: { in: jobIds } },
    include: JOB_RELATION_INCLUDE
  });
  return new Map(rows.map((row) => [Number(row.recno), row]));
}

class TechnicianMonthlyBillsReportService {
  getFilters() {
    return buildTechnicianMonthlyBillsFilterMeta(getAvailableJobFilters());
  }

  async getSummaryColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
      DEFAULT_SUMMARY_COLUMNS
    );
  }

  async updateSummaryColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
      DEFAULT_SUMMARY_COLUMNS,
      columns
    );
    return {
      reportKey: TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
      columns: merged
    };
  }

  async getDetailColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
      DEFAULT_DETAIL_COLUMNS
    );
  }

  async updateDetailColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
      DEFAULT_DETAIL_COLUMNS,
      columns
    );
    return {
      reportKey: TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
      columns: merged
    };
  }

  async getSummaryReport(auth, args = {}) {
    assertTechnicianMonthlyBillsDateRange(args);
    const filter = args.filter || {};
    const isManager = await canManageBranchJobs(auth);
    const { collections, expenses, usersById } = await loadActivity(auth, filter);

    const entries = [
      ...collections.map((row) => ({
        technicianId: Number(row.collectedby),
        cashCollected: row.amount,
        expenses: 0,
        technician: usersById.get(Number(row.collectedby))
      })),
      ...expenses.map((row) => ({
        technicianId: Number(row.createdby),
        cashCollected: 0,
        expenses: row.amount,
        technician: usersById.get(Number(row.createdby))
      }))
    ];

    const query = graphqlJobsFilterToQuery(filter, args, {
      sortFieldMap: SUMMARY_SORT_FIELD_MAP
    });
    const aggregated = sortReportRows(
      aggregateSummaryRows(entries),
      query,
      SUMMARY_SORT_FIELD_MAP
    );
    const paged = paginateRows(aggregated, query);

    return {
      mode: isManager ? "all" : "my",
      reportKey: TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
      data: paged.data,
      pageInfo: paged.pageInfo,
      filters: this.getFilters(),
      columns: await this.getSummaryColumns(auth),
      detailReportKey: TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY
    };
  }

  async getDetailReport(auth, args = {}) {
    assertTechnicianMonthlyBillsDateRange(args);
    const filter = args.filter || {};
    const isManager = await canManageBranchJobs(auth);
    const { collections, expenses, usersById, jobIds } = await loadActivity(auth, filter);
    const jobsById = await loadJobsById([...jobIds]);

    const detailRows = buildDetailRowsFromActivity({
      collections,
      expenses,
      jobsById,
      usersById
    });

    const query = graphqlJobsFilterToQuery(filter, args, {
      sortFieldMap: DETAIL_SORT_FIELD_MAP
    });
    const sorted = sortReportRows(detailRows, query, DETAIL_SORT_FIELD_MAP);
    const paged = paginateRows(sorted, query);

    return {
      mode: isManager ? "all" : "my",
      reportKey: TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
      data: paged.data,
      pageInfo: paged.pageInfo,
      filters: this.getFilters(),
      columns: await this.getDetailColumns(auth)
    };
  }
}

module.exports = new TechnicianMonthlyBillsReportService();
