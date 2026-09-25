const prisma = require("../database/prisma");
const jobCpairService = require("./job-cpair.service");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const reportColumnsService = require("./report-columns.service");
const { formatOverviewRow } = require("../utils/job-cpair");
const { graphqlCpairFilterToQuery } = require("../utils/graphql-cpair-report-filter");
const {
  buildReceivedNotIssuedPartWhere,
  sortOverviewRows,
  filterOverviewRows
} = require("../utils/job-cpair-list");
const {
  CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
  DEFAULT_CPAIR_RECEIVED_NOT_ISSUED_COLUMNS,
  CPAIR_RECEIVED_NOT_ISSUED_SORT_FIELD_MAP,
  isReceivedNotFullyIssuedRow,
  mapOverviewToReportRow,
  buildReportFilterMeta
} = require("../reports/cpair-received-not-issued-report");

function buildReportPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const pageSize = Math.min(requestedPageSize, GRAPHQL_MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

class CpairReceivedNotIssuedReportService {
  async getColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
      DEFAULT_CPAIR_RECEIVED_NOT_ISSUED_COLUMNS
    );
  }

  async updateColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
      DEFAULT_CPAIR_RECEIVED_NOT_ISSUED_COLUMNS,
      columns
    );

    return {
      reportKey: CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
      columns: merged
    };
  }

  async getReport(auth, args = {}) {
    const query = graphqlCpairFilterToQuery(args.filter, args, {
      sortFieldMap: CPAIR_RECEIVED_NOT_ISSUED_SORT_FIELD_MAP
    });
    const pagination = buildReportPagination(query);
    const restrictToAssignee = await jobCpairService.shouldRestrictToAssignee(auth);
    const partWhere = buildReceivedNotIssuedPartWhere(auth, query, { restrictToAssignee });

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
      overviewRows.filter(isReceivedNotFullyIssuedRow),
      query
    );

    const sorted = sortOverviewRows(filtered, query);

    const data = sorted
      .slice(pagination.skip, pagination.skip + pagination.pageSize)
      .map(mapOverviewToReportRow);

    return {
      mode: restrictToAssignee ? "my" : "all",
      reportKey: CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
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

module.exports = new CpairReceivedNotIssuedReportService();
