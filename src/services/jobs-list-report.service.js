const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
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
