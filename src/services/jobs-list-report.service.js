const JobsListService = require("./jobs-list.service");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const { isResolutionBucket } = require("../utils/job-resolution-aging");
const { listJobIdsForResolutionBucket } = require("./technician-aging-report.service");
const reportColumnsService = require("./report-columns.service");
const {
  JOBS_LIST_REPORT_KEY,
  DEFAULT_JOBS_LIST_REPORT_COLUMNS,
  JOBS_LIST_REPORT_SORT_FIELD_MAP,
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta,
  mapSlimJobToReportRow
} = require("../reports/jobs-list-report");

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

class JobsListReportService {
  async getColumns(auth) {
    return reportColumnsService.getColumns(auth, JOBS_LIST_REPORT_KEY, DEFAULT_JOBS_LIST_REPORT_COLUMNS);
  }

  async updateColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      JOBS_LIST_REPORT_KEY,
      DEFAULT_JOBS_LIST_REPORT_COLUMNS,
      columns
    );

    return {
      reportKey: JOBS_LIST_REPORT_KEY,
      columns: merged
    };
  }

  async getReport(auth, args = {}) {
    assertJobsListReportDateRange(args);
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const query = graphqlJobsFilterToQuery(args.filter, args, {
      sortFieldMap: JOBS_LIST_REPORT_SORT_FIELD_MAP
    });
    const bucket = query.resolutionBucket != null ? String(query.resolutionBucket) : "";
    delete query.resolutionBucket;
    if (bucket) {
      if (!isResolutionBucket(bucket)) {
        const err = new Error(
          "resolutionBucket must be one of: single_day, three_days, five_days, seven_days, over_seven_days"
        );
        err.status = 400;
        throw err;
      }
      const where = await service.applyFilters(auth, query);
      query.recnoIn = await listJobIdsForResolutionBucket(where, bucket);
    }
    query.maxPageSize = GRAPHQL_MAX_PAGE_SIZE;
    const result = await service.list(auth, query);

    return {
      mode: isManager ? "all" : "my",
      data: result.data.map(mapSlimJobToReportRow).filter(Boolean),
      pageInfo: {
        page: result.pagination.page,
        pageSize: result.pagination.pageSize,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      },
      filters: markJobsListReportFilterMeta(result.filters),
      columns: await this.getColumns(auth)
    };
  }
}

module.exports = new JobsListReportService();
