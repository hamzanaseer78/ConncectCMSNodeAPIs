const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { getAvailableJobFilters } = JobsListService;
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const reportColumnsService = require("./report-columns.service");
const {
  JOB_REVENUE_REPORT_KEY,
  DEFAULT_JOB_REVENUE_REPORT_COLUMNS,
  JOB_REVENUE_REPORT_SORT_FIELD_MAP,
  MEMORY_SORT_FIELDS,
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta,
  mapJobToRevenueReportRow,
  sortRevenueReportRows,
  paginateRevenueRows
} = require("../reports/job-revenue-report");

const REVENUE_JOB_INCLUDE = {
  customers: { select: { name: true, contactno: true } },
  users: { select: { userid: true, name: true } },
  jobstatuses: { select: { title: true, color: true } },
  jobcollections: {
    select: {
      amount: true,
      collectedat: true,
      collectedby: true
    }
  },
  jobdetails: {
    orderBy: { recno: "desc" },
    take: 1,
    select: { recno: true }
  }
};

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function resolveSortBy(args = {}, query = {}) {
  const raw = args.sortBy ?? query.sortBy ?? "jobDate";
  const mapped = JOB_REVENUE_REPORT_SORT_FIELD_MAP[raw] ?? raw;
  if (MEMORY_SORT_FIELDS.has(raw)) {
    return { clientSortBy: raw, prismaSortBy: null };
  }
  return { clientSortBy: raw, prismaSortBy: mapped };
}

class JobRevenueReportService {
  async getColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      JOB_REVENUE_REPORT_KEY,
      DEFAULT_JOB_REVENUE_REPORT_COLUMNS
    );
  }

  async updateColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      JOB_REVENUE_REPORT_KEY,
      DEFAULT_JOB_REVENUE_REPORT_COLUMNS,
      columns
    );

    return {
      reportKey: JOB_REVENUE_REPORT_KEY,
      columns: merged
    };
  }

  async getReport(auth, args = {}) {
    assertJobsListReportDateRange(args);
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const query = graphqlJobsFilterToQuery(args.filter, args, {
      sortFieldMap: JOB_REVENUE_REPORT_SORT_FIELD_MAP
    });
    query.maxPageSize = GRAPHQL_MAX_PAGE_SIZE;

    const where = await service.applyFilters(auth, query);
    const { clientSortBy, prismaSortBy } = resolveSortBy(args, query);

    if (MEMORY_SORT_FIELDS.has(clientSortBy)) {
      const rows = await prisma.job.findMany({
        where,
        include: REVENUE_JOB_INCLUDE,
        take: GRAPHQL_MAX_PAGE_SIZE
      });
      const mapped = rows.map(mapJobToRevenueReportRow).filter(Boolean);
      const sorted = sortRevenueReportRows(mapped, {
        ...query,
        sortBy: clientSortBy
      });
      const paged = paginateRevenueRows(sorted, query);

      return {
        mode: isManager ? "all" : "my",
        reportKey: JOB_REVENUE_REPORT_KEY,
        data: paged.data,
        pageInfo: paged.pageInfo,
        filters: markJobsListReportFilterMeta(getAvailableJobFilters()),
        columns: await this.getColumns(auth)
      };
    }

    const pagination = service.buildPagination(query);
    const orderBy = service.buildOrderBy({
      ...query,
      sortBy: prismaSortBy
    });

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: REVENUE_JOB_INCLUDE,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({ where })
    ]);

    return {
      mode: isManager ? "all" : "my",
      reportKey: JOB_REVENUE_REPORT_KEY,
      data: rows.map(mapJobToRevenueReportRow).filter(Boolean),
      pageInfo: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: markJobsListReportFilterMeta(getAvailableJobFilters()),
      columns: await this.getColumns(auth)
    };
  }
}

module.exports = new JobRevenueReportService();
