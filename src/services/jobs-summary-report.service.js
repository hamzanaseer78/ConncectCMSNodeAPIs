const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const reportColumnsService = require("./report-columns.service");
const { getAvailableJobFilters } = require("./jobs-list.service");
const {
  getJobsSummaryReportDefinition,
  listJobsSummaryReportDefinitions,
  aggregateJobsByGroup,
  mapSummaryRow
} = require("../reports/jobs-summary-report.registry");

const MAX_PAGE_SIZE = 100;

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function buildPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function sortSummaryRows(rows, query = {}, definition) {
  const defaultSort = definition.nameField === definition.sortFieldMap?.groupName ? "noOfJobs" : "noOfJobs";
  const sortBy = query.sortBy ? String(query.sortBy) : "noOfJobs";
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  const nameSortFields = new Set([
    definition.nameField,
    "groupName",
    ...Object.keys(definition.sortFieldMap || {}).filter((key) => key.endsWith("Name"))
  ]);

  const getter = (row) => {
    if (nameSortFields.has(sortBy) || sortBy === "groupName") {
      return row.groupName ?? row[definition.nameField] ?? "";
    }
    return Number(row[sortBy]) || 0;
  };

  return [...rows].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);
    if (leftValue < rightValue) return -sortOrder;
    if (leftValue > rightValue) return sortOrder;
    return 0;
  });
}

function getSummaryFilters() {
  return getAvailableJobFilters();
}

class JobsSummaryReportService {
  resolveDefinition(reportKey) {
    return getJobsSummaryReportDefinition(reportKey);
  }

  async getColumns(auth, reportKey) {
    const definition = this.resolveDefinition(reportKey);
    return reportColumnsService.getColumns(auth, definition.reportKey, definition.defaultColumns);
  }

  async updateColumns(auth, reportKey, columns) {
    const definition = this.resolveDefinition(reportKey);
    const merged = await reportColumnsService.updateColumns(
      auth,
      definition.reportKey,
      definition.defaultColumns,
      columns
    );

    return {
      reportKey: definition.reportKey,
      columns: merged
    };
  }

  async getReport(auth, reportKey, args = {}) {
    const definition = this.resolveDefinition(reportKey);
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const query = graphqlJobsFilterToQuery(args.filter, args, {
      sortFieldMap: definition.sortFieldMap
    });
    const pagination = buildPagination(query);
    const where = await service.applyFilters(auth, query);

    const jobs = await prisma.job.findMany({
      where,
      select: definition.jobSelect
    });

    const buckets = aggregateJobsByGroup(jobs, definition.extractGroupKey);
    const nameMap = await definition.loadGroupNames(
      { ...auth, __prisma: prisma },
      [...buckets.values()].map((bucket) => bucket.groupKey)
    );

    const rows = sortSummaryRows(
      [...buckets.values()].map((bucket) => {
        const groupName =
          bucket.groupKey == null
            ? definition.unassignedLabel
            : nameMap.get(bucket.groupKey) ?? nameMap.get(String(bucket.groupKey)) ?? null;

        return mapSummaryRow(definition, bucket.groupKey, groupName, bucket);
      }),
      query,
      definition
    );

    const total = rows.length;
    const data = rows.slice(pagination.skip, pagination.skip + pagination.pageSize);

    return {
      mode: isManager ? "all" : "my",
      reportKey: definition.reportKey,
      data,
      pageInfo: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getSummaryFilters(),
      columns: await this.getColumns(auth, reportKey),
      detailReportKey: "jobs_list"
    };
  }

  listDefinitions() {
    return listJobsSummaryReportDefinitions();
  }
}

module.exports = new JobsSummaryReportService();
