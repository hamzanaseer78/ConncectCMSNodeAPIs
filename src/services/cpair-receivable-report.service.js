const prisma = require("../database/prisma");
const jobCpairService = require("./job-cpair.service");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const reportColumnsService = require("./report-columns.service");
const { formatOverviewRow } = require("../utils/job-cpair");
const { graphqlCpairFilterToQuery } = require("../utils/graphql-cpair-report-filter");
const {
  buildReceivablePartWhere,
  sortOverviewRows,
  filterOverviewRows
} = require("../utils/job-cpair-list");
const {
  CPAIR_RECEIVABLE_REPORT_KEY,
  DEFAULT_CPAIR_RECEIVABLE_COLUMNS,
  CPAIR_RECEIVABLE_SORT_FIELD_MAP,
  isReceivableCpairRow,
  mapOverviewToReceivableReportRow,
  buildReportFilterMeta
} = require("../reports/cpair-receivable-report");

function buildReportPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const pageSize = Math.min(requestedPageSize, GRAPHQL_MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

class CpairReceivableReportService {
  async getColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      CPAIR_RECEIVABLE_REPORT_KEY,
      DEFAULT_CPAIR_RECEIVABLE_COLUMNS
    );
  }

  async updateColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      CPAIR_RECEIVABLE_REPORT_KEY,
      DEFAULT_CPAIR_RECEIVABLE_COLUMNS,
      columns
    );

    return {
      reportKey: CPAIR_RECEIVABLE_REPORT_KEY,
      columns: merged
    };
  }

  async getReport(auth, args = {}) {
    const query = graphqlCpairFilterToQuery(args.filter, args, {
      sortFieldMap: CPAIR_RECEIVABLE_SORT_FIELD_MAP
    });
    const pagination = buildReportPagination(query);
    const restrictToAssignee = await jobCpairService.shouldRestrictToAssignee(auth);
    const partWhere = buildReceivablePartWhere(auth, query, { restrictToAssignee });

    const parts = await prisma.jobcpairparts.findMany({
      where: partWhere,
      include: {
        summary: {
          include: {
            job: { select: { recno: true, code: true, manualjobno: true } }
          }
        }
      },
      orderBy: { recno: "asc" }
    });

    const overviewRows = parts.map((part) => {
      const row = formatOverviewRow(part.summary, part);
      row.manualJobNo = part.summary?.job?.manualjobno ?? null;
      return row;
    });

    const filtered = filterOverviewRows(
      overviewRows.filter(isReceivableCpairRow),
      query
    );

    const sorted = sortOverviewRows(filtered, query);

    const data = sorted
      .slice(pagination.skip, pagination.skip + pagination.pageSize)
      .map(mapOverviewToReceivableReportRow);

    return {
      mode: restrictToAssignee ? "my" : "all",
      reportKey: CPAIR_RECEIVABLE_REPORT_KEY,
      data,
      pageInfo: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: sorted.length,
        totalPages: Math.ceil(sorted.length / pagination.pageSize) || 0
      },
      filters: buildReportFilterMeta(),
      columns: await this.getColumns(auth)
    };
  }
}

module.exports = new CpairReceivableReportService();
