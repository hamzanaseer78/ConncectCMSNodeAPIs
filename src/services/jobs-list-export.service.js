const JobsListService = require("./jobs-list.service");
const jobsTeamService = require("./jobs-team.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const reportColumnsService = require("./report-columns.service");
const { getAvailableJobFilters } = require("./jobs-list.service");
const {
  JOBS_LIST_REPORT_KEY,
  DEFAULT_JOBS_LIST_REPORT_COLUMNS,
  JOBS_LIST_REPORT_SORT_FIELD_MAP,
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta,
  mapSlimJobToReportRow
} = require("../reports/jobs-list-report");
const {
  normalizeExportFormat,
  resolveExportColumns,
  buildExportBuffer,
  buildExportFilename,
  clientError
} = require("../utils/jobs-export");

const MAX_EXPORT_ROWS = Math.max(Number(process.env.JOBS_EXPORT_MAX_ROWS || 10000), 1);

function buildListService(scope, isManager) {
  if (scope === "team") {
    return jobsTeamService;
  }
  return new JobsListService({
    mode: scope === "my" ? "my" : "all",
    restrictToAssignee: scope === "my" || (!isManager && scope === "all")
  });
}

function extractFilterPayload(source = {}) {
  const filter = source.filter && typeof source.filter === "object" ? { ...source.filter } : { ...source };
  delete filter.format;
  delete filter.exportFormat;
  delete filter.columns;
  delete filter.scope;
  return filter;
}

class JobsListExportService {
  async getColumns(auth) {
    const columns = await reportColumnsService.getColumns(
      auth,
      JOBS_LIST_REPORT_KEY,
      DEFAULT_JOBS_LIST_REPORT_COLUMNS
    );
    return {
      reportKey: JOBS_LIST_REPORT_KEY,
      columns,
      filters: markJobsListReportFilterMeta(getAvailableJobFilters()),
      supportedFormats: ["csv", "xlsx", "xls"],
      maxExportRows: MAX_EXPORT_ROWS
    };
  }

  async updateColumns(auth, columns) {
    return reportColumnsService.updateColumns(
      auth,
      JOBS_LIST_REPORT_KEY,
      DEFAULT_JOBS_LIST_REPORT_COLUMNS,
      columns
    );
  }

  async fetchAllReportRows(auth, scope, args = {}) {
    assertJobsListReportDateRange(args);
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(scope, isManager);
    const query = graphqlJobsFilterToQuery(extractFilterPayload(args), args, {
      sortFieldMap: JOBS_LIST_REPORT_SORT_FIELD_MAP
    });

    const rows = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && rows.length < MAX_EXPORT_ROWS) {
      const pageSize = Math.min(500, MAX_EXPORT_ROWS - rows.length);
      const result = await service.list(auth, {
        ...query,
        page,
        pageSize
      });

      totalPages = result.pagination.totalPages || 1;
      const mapped = result.data.map(mapSlimJobToReportRow).filter(Boolean);
      rows.push(...mapped);
      page += 1;
    }

    return {
      rows,
      truncated: rows.length >= MAX_EXPORT_ROWS,
      maxExportRows: MAX_EXPORT_ROWS
    };
  }

  async export(auth, options = {}) {
    const scope = options.scope === "my" || options.scope === "team" ? options.scope : "all";
    const format = normalizeExportFormat(options.format ?? options.exportFormat);
    const savedColumns = await reportColumnsService.getColumns(
      auth,
      JOBS_LIST_REPORT_KEY,
      DEFAULT_JOBS_LIST_REPORT_COLUMNS
    );
    const columns = resolveExportColumns(
      DEFAULT_JOBS_LIST_REPORT_COLUMNS,
      savedColumns,
      options.columns
    );

    if (!columns.length) {
      throw clientError("At least one visible column is required for export");
    }

    const exportArgs = {
      ...(options.filter && typeof options.filter === "object" ? options.filter : {}),
      sortBy: options.sortBy,
      sortOrder: options.sortOrder
    };

    const { rows, truncated, maxExportRows } = await this.fetchAllReportRows(auth, scope, exportArgs);
    const { buffer, contentType, extension } = buildExportBuffer(rows, columns, format);
    const isManager = await canManageBranchJobs(auth);

    return {
      reportKey: JOBS_LIST_REPORT_KEY,
      mode: scope === "my" ? "my" : scope === "team" ? "team" : isManager ? "all" : "my",
      format,
      filename: `${buildExportFilename("jobs-export")}.${extension}`,
      contentType,
      buffer,
      rowCount: rows.length,
      truncated,
      maxExportRows,
      columns
    };
  }
}

module.exports = new JobsListExportService();
