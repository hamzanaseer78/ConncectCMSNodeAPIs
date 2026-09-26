const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const reportColumnsService = require("./report-columns.service");
const {
  PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
  DEFAULT_PARTS_WARRANTY_CONSUMPTION_COLUMNS,
  PARTS_WARRANTY_CONSUMPTION_SORT_FIELD_MAP,
  mapJobProductLineToReportRow,
  buildReportFilterMeta
} = require("../reports/parts-warranty-consumption-report");

const JOB_PRODUCT_INCLUDE = {
  products: { select: { productid: true, name: true, barcode: true } },
  job: {
    select: {
      recno: true,
      code: true,
      manualjobno: true,
      date: true,
      isinwaranty: true,
      customerid: true,
      assignedto: true,
      serviceid: true,
      faultid: true,
      brandid: true,
      customers: { select: { customerid: true, name: true, contactno: true } },
      users: { select: { userid: true, name: true } },
      jobstatuses: { select: { title: true, color: true } },
      jobsubcategories: { select: { subcategoryid: true, name: true } },
      jobcategories: {
        select: {
          categoryid: true,
          name: true,
          groupid: true,
          jobgroups: { select: { groupid: true, name: true } }
        }
      },
      jobgroups: { select: { groupid: true, name: true } },
      jobdetails: {
        orderBy: { recno: "desc" },
        take: 1,
        select: { remarks: true }
      }
    }
  }
};

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function buildProductLineOrderBy(query = {}) {
  const sortBy = query.sortBy ? String(query.sortBy) : "jobDate";
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  const map = {
    jobDate: { job: { date: sortOrder } },
    jobCode: { job: { code: sortOrder } },
    manualJobNo: { job: { manualjobno: sortOrder } },
    qty: { qty: sortOrder },
    price: { price: sortOrder },
    inclusiveAmount: { inclusiveamount: sortOrder },
    lineNo: { lineno: sortOrder },
    modelNo: { modelno: sortOrder },
    partNo: { partno: sortOrder },
    productName: { products: { name: sortOrder } },
    customerName: { job: { customers: { name: sortOrder } } },
    assignedToName: { job: { users: { name: sortOrder } } },
    status: { job: { jobstatuses: { title: sortOrder } } },
    faultName: { job: { jobsubcategories: { name: sortOrder } } },
    categoryName: { job: { jobcategories: { name: sortOrder } } }
  };

  return map[sortBy] || { job: { date: "desc" } };
}

class PartsWarrantyConsumptionReportService {
  async getColumns(auth) {
    return reportColumnsService.getColumns(
      auth,
      PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
      DEFAULT_PARTS_WARRANTY_CONSUMPTION_COLUMNS
    );
  }

  async updateColumns(auth, columns) {
    const merged = await reportColumnsService.updateColumns(
      auth,
      PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
      DEFAULT_PARTS_WARRANTY_CONSUMPTION_COLUMNS,
      columns
    );

    return {
      reportKey: PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
      columns: merged
    };
  }

  async buildJobProductWhere(auth, query = {}) {
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const jobWhere = await service.applyFilters(auth, query);

    jobWhere.isinwaranty = true;

    return {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid),
      isserviceitem: { not: true },
      qty: { gt: 0 },
      job: jobWhere
    };
  }

  async getReport(auth, args = {}) {
    const isManager = await canManageBranchJobs(auth);
    const query = graphqlJobsFilterToQuery(args.filter, args, {
      sortFieldMap: PARTS_WARRANTY_CONSUMPTION_SORT_FIELD_MAP
    });

    const page = Math.max(Number(query.page || 1), 1);
    const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
    const pageSize = Math.min(requestedPageSize, GRAPHQL_MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const where = await this.buildJobProductWhere(auth, query);
    const orderBy = buildProductLineOrderBy(query);

    const [rows, total] = await Promise.all([
      prisma.jobproducts.findMany({
        where,
        include: JOB_PRODUCT_INCLUDE,
        orderBy,
        skip,
        take: pageSize
      }),
      prisma.jobproducts.count({ where })
    ]);

    return {
      mode: isManager ? "all" : "my",
      reportKey: PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
      data: rows.map(mapJobProductLineToReportRow).filter(Boolean),
      pageInfo: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0
      },
      filters: buildReportFilterMeta(),
      columns: await this.getColumns(auth)
    };
  }
}

module.exports = new PartsWarrantyConsumptionReportService();
