const prisma = require("../database/prisma");
const jobApprovalService = require("./job-approval.service");
const {
  buildJobProductLineInclude,
  mapJobProductLines
} = require("../utils/job-product-lines");
const { JOB_SERVICE_LINE_INCLUDE, mapJobServiceLines } = require("../utils/job-service-lines");
const { optionalJobservicesInclude } = require("../utils/prisma-jobservices");
const { modelHasRelation, modelHasScalarField } = require("../utils/prisma-model-support");
const { jobMainEquipmentFields } = require("../utils/job-equipment");
const { enrichJobApiRow, loadJobListEnrichmentContext } = require("../utils/job-response-enrichment");
const { buildJobCreatedByFields } = require("../utils/job-timeline");
const { normalizeQuotationStatus } = require("../utils/quotation-status");
const { canManageBranchJobs, isDistributor, applyDistributorJobScope } = require("../utils/job-access");
const { loadTeamMemberIds } = require("../utils/user-manager");
const { buildCustomerRelationFilter, buildJobDetailsInvoiceNumberFilter, buildJobDetailsEquipmentFilters } = require("../utils/jobs-list-filters");
const {
  buildJobStatusKpiContext,
  buildJobKpiWhere,
  mergeWhereClauses,
  parseJobStatsKpiKey,
  formatStatsKpisResponse,
  JOB_STATS_KPI_KEYS
} = require("../utils/job-stats-kpis");

const {
  normalizeSortBy,
  parseListSortOrder,
  resolveDefaultListSortField
} = require("../utils/list-sort");
const {
  appendJobDetailsCreatedByFilter,
  getCreatedByFilterMeta
} = require("../utils/list-filter");

const MAX_PAGE_SIZE = 100;

function buildAssignedUserSelect() {
  const select = {
    userid: true,
    name: true
  };

  if (modelHasScalarField(prisma, "users", "technicianaffiliation")) {
    select.technicianaffiliation = true;
  }
  if (modelHasScalarField(prisma, "users", "companyname")) {
    select.companyname = true;
  }

  return select;
}

function buildFollowUpUserSelect() {
  const select = {
    userid: true,
    name: true
  };

  if (modelHasScalarField(prisma, "users", "usertype")) {
    select.usertype = true;
  }

  return select;
}

function buildJobListInclude() {
  const include = {
    customers: {
      include: {
        countries: { select: { recno: true, name: true } },
        cities: { select: { recno: true, name: true } },
        areas: { select: { recno: true, name: true } }
      }
    },
    users: {
      select: buildAssignedUserSelect()
    },
    jobstatuses: { select: { recno: true, title: true, color: true } },
    jobcategories: {
      select: {
        categoryid: true,
        name: true,
        groupid: true,
        jobgroups: { select: { groupid: true, name: true } }
      }
    },
    jobsubcategories: {
      select: {
        subcategoryid: true,
        name: true,
        categoryid: true,
        jobcategories: {
          select: {
            categoryid: true,
            name: true,
            groupid: true,
            jobgroups: { select: { groupid: true, name: true } }
          }
        }
      }
    },
    cities: {
      select: {
        recno: true,
        name: true,
        countryid: true,
        countries: { select: { recno: true, name: true } }
      }
    },
    areas: { select: { recno: true, name: true } },
    jobdetails: {
      orderBy: { recno: "desc" },
      take: 1,
      select: {
        remarks: true,
        createdby: true,
        createdat: true,
        users_jobdetails_createdbyTousers: {
          select: { userid: true, name: true, email: true }
        }
      }
    }
  };

  if (modelHasRelation(prisma, "job", "followupbyuser")) {
    include.followupbyuser = {
      select: buildFollowUpUserSelect()
    };
  }

  if (modelHasRelation(prisma, "job", "jobgroups")) {
    include.jobgroups = { select: { groupid: true, name: true } };
  }

  if (modelHasRelation(prisma, "job", "brands")) {
    include.brands = { select: { recno: true, name: true } };
  }

  if (modelHasRelation(prisma, "job", "jobtypes")) {
    include.jobtypes = { select: { recno: true, name: true } };
  }

  if (modelHasRelation(prisma, "job", "jobsources")) {
    include.jobsources = { select: { recno: true, name: true, description: true } };
  }

  if (modelHasRelation(prisma, "job", "erpproducts")) {
    include.erpproducts = {
      include: {
        units: { select: { recno: true, name: true, symbol: true } },
        brands: { select: { recno: true, name: true } }
      }
    };
  }

  return include;
}

/** Only fields needed for list rows (smaller query + no nested noise). */
const JOB_LIST_INCLUDE = buildJobListInclude();

const JOB_REPORT_INCLUDE = { ...JOB_LIST_INCLUDE };

const JOB_SCALAR_FILTERS = [
  { name: "recno", type: "Int" },
  { name: "code", type: "String" },
  { name: "assignedto", type: "Int" },
  { name: "followupby", type: "Int" },
  { name: "city", type: "Int" },
  { name: "area", type: "Int" },
  { name: "groupid", type: "Int" },
  { name: "serviceid", type: "Int" },
  { name: "faultid", type: "Int" },
  { name: "customerid", type: "Int" },
  { name: "statusid", type: "Int" },
  { name: "priority", type: "String" },
  { name: "deliverytype", type: "Int" },
  { name: "manualjobno", type: "String" },
  { name: "complaintby", type: "String" },
  { name: "isinwaranty", type: "Boolean" },
  { name: "isfirstresponse", type: "Boolean" },
  { name: "iscompleted", type: "Boolean" },
  { name: "isresolved", type: "Boolean" },
  { name: "isacknowledged", type: "Boolean" },
  { name: "qualityassuerd", type: "Boolean" },
  { name: "estimatedcompletedtime", type: "Int" },
  { name: "brandid", type: "Int" },
  { name: "jobtypeid", type: "Int" },
  { name: "jobsourceid", type: "Int" },
  { name: "quotationstatus", type: "String" }
];

const JOB_QUERY_ALIASES = {
  serviceId: "groupid",
  categoryId: "serviceid",
  customerId: "customerid",
  assignedToId: "assignedto",
  followUpById: "followupby",
  statusId: "statusid",
  faultId: "faultid",
  brandId: "brandid",
  jobTypeId: "jobtypeid",
  jobSourceId: "jobsourceid",
  complaintBy: "complaintby",
  quotationStatus: "quotationstatus"
};

const SORT_RELATION_MAP = {
  customerName: { relation: "customers", field: "name" },
  assignedToName: { relation: "users", field: "name" },
  followUpByName: { relation: "followupbyuser", field: "name" },
  statusName: { relation: "jobstatuses", field: "title" },
  serviceName: { relation: "jobgroups", field: "name" },
  categoryName: { relation: "jobcategories", field: "name" },
  faultName: { relation: "jobsubcategories", field: "name" },
  jobTypeName: { relation: "jobtypes", field: "name" },
  jobSourceName: { relation: "jobsources", field: "name" }
};

const SORTABLE_COLUMNS = [
  ...JOB_SCALAR_FILTERS.map((f) => f.name),
  ...Object.keys(SORT_RELATION_MAP)
];

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

function parseIntFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function coerceScalarFilter(field, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (field.name === "quotationstatus") {
    try {
      return normalizeQuotationStatus(value);
    } catch {
      return undefined;
    }
  }
  if (field.type === "Int") return parseIntFilter(value);
  if (field.type === "Boolean") return parseBoolean(value);
  return String(value).trim();
}

function normalizeQuery(query = {}) {
  const next = { ...query };
  Object.entries(JOB_QUERY_ALIASES).forEach(([alias, target]) => {
    if (next[alias] !== undefined && next[target] === undefined) {
      next[target] = next[alias];
    }
  });
  return next;
}

function getAvailableJobFilters() {
  const scalar = JOB_SCALAR_FILTERS.map((field) => ({
    field: field.name,
    type: field.type,
    operators: field.type === "String" ? ["equals", "contains"] : ["equals"]
  }));

  const extra = [
    { field: "from", type: "DateTime", operators: ["gte"], description: "Job date from (inclusive)" },
    { field: "to", type: "DateTime", operators: ["lte"], description: "Job date to (inclusive)" },
    { field: "search", type: "String", operators: ["contains"], description: "Matches code or manualjobno" },
    { field: "customerName", type: "String", operators: ["contains"] },
    { field: "customerPhone", type: "String", operators: ["contains"], description: "Partial match on customer contactno" },
    { field: "customerEmail", type: "String", operators: ["contains"], description: "Partial match on customer email" },
    { field: "assignedToName", type: "String", operators: ["contains"] },
    { field: "followUpById", type: "Int", operators: ["equals"], description: "Follow-up user id (job.followupby)" },
    { field: "followUpByName", type: "String", operators: ["contains"] },
    { field: "faultName", type: "String", operators: ["contains"], description: "Partial match on fault/subcategory name" },
    { field: "serviceId", type: "Int", operators: ["equals"], description: "Job group id" },
    { field: "categoryId", type: "Int", operators: ["equals"], description: "Job category id" },
    {
      field: "brandId",
      type: "Int",
      operators: ["equals"],
      description: "job.brandid (brands.recno)"
    },
    {
      field: "invoiceNumber",
      type: "String",
      operators: ["contains"],
      description: "Partial match on equipment invoice number stored in jobdetails.remarks JSON"
    },
    {
      field: "productModel",
      type: "String",
      operators: ["contains"],
      description: "Partial match on equipment product model in jobdetails.remarks JSON"
    },
    {
      field: "productSerial",
      type: "String",
      operators: ["contains"],
      description: "Partial match on equipment serial number in jobdetails.remarks JSON"
    },
    {
      field: "kpi",
      type: "String",
      operators: ["equals"],
      description: `Filter by job page KPI bucket: ${JOB_STATS_KPI_KEYS.join(", ")}`
    },
    ...getCreatedByFilterMeta({ includeName: true })
  ];

  return [...scalar, ...extra];
}

/**
 * Flat list/report row: relation labels as customerId, customerName, etc. (no nested objects, no title).
 */
function slimJobListRow(job, enrichmentContext = {}) {
  const { jobdetails, jobproducts, jobservices, jobaddonproducts: _jobaddonproducts, ...rest } = job;
  const detail = Array.isArray(jobdetails) ? jobdetails[0] : jobdetails ?? null;
  const equipmentMain = jobMainEquipmentFields(detail, rest.brandid);

  return {
    ...enrichJobApiRow(rest, enrichmentContext),
    brandId: rest.brandid ?? equipmentMain.brandId ?? null,
    brandName: rest.brands?.name ?? null,
    ...equipmentMain,
    productLines: mapJobProductLines(jobproducts),
    serviceLines: mapJobServiceLines(jobservices),
    totalCost: rest.totalcost ?? null,
    ...buildJobCreatedByFields(detail)
  };
}

class JobsListService {
  constructor({ mode, restrictToAssignee = false, restrictToTeam = false }) {
    this.mode = mode;
    this.restrictToAssignee = restrictToAssignee;
    this.restrictToTeam = restrictToTeam;
  }

  async buildScope(auth) {
    const scope = {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    };

    if (this.restrictToTeam) {
      const teamIds = await loadTeamMemberIds(auth);
      scope.assignedto = teamIds.length ? { in: teamIds } : { in: [-1] };
      return scope;
    }

    if (await isDistributor(auth)) {
      return applyDistributorJobScope(auth, scope);
    }

    if (this.restrictToAssignee || !(await canManageBranchJobs(auth))) {
      scope.assignedto = Number(auth.userid);
    }

    return scope;
  }

  buildPagination(query = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize
    };
  }

  buildOrderBy(query = {}) {
    const sortBy = normalizeSortBy(query.sortBy);
    const sortOrder = parseListSortOrder(query.sortOrder);

    if (sortBy) {
      if (SORTABLE_COLUMNS.includes(sortBy) && !SORT_RELATION_MAP[sortBy]) {
        return { [sortBy]: sortOrder };
      }

      const relationSort = SORT_RELATION_MAP[sortBy];
      if (relationSort) {
        return {
          [relationSort.relation]: {
            [relationSort.field]: sortOrder
          }
        };
      }
    }

    const defaultField = resolveDefaultListSortField("job", "recno");
    return { [defaultField]: "desc" };
  }

  async applyFilters(auth, rawQuery = {}) {
    const query = normalizeQuery(rawQuery);
    const where = { ...(await this.buildScope(auth)) };

    JOB_SCALAR_FILTERS.forEach((field) => {
      if (field.type !== "Boolean" && !modelHasScalarField(prisma, "job", field.name)) {
        return;
      }
      const value = coerceScalarFilter(field, query[field.name]);
      if (value !== undefined) {
        where[field.name] = value;
      }
    });

    if (query.from || query.to) {
      where.date = where.date || {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    const search = query.search ?? query.q ?? query.keyword;
    if (search != null && String(search).trim() !== "") {
      const term = String(search).trim();
      where.OR = [
        { code: { contains: term, mode: "insensitive" } },
        { manualjobno: { contains: term, mode: "insensitive" } }
      ];
    } else {
      if (query.codeContains) {
        where.code = { contains: String(query.codeContains).trim(), mode: "insensitive" };
      }
      if (query.manualjobnoContains) {
        where.manualjobno = { contains: String(query.manualjobnoContains).trim(), mode: "insensitive" };
      }
    }

    const customerFilter = buildCustomerRelationFilter(query);
    if (customerFilter) {
      where.customers = customerFilter;
    }

    const assignedToName = query.assignedToName ?? query.assignedtoname;
    if (assignedToName != null && String(assignedToName).trim() !== "") {
      where.users = {
        name: { contains: String(assignedToName).trim(), mode: "insensitive" }
      };
    }

    const followUpByName = query.followUpByName ?? query.followupbyname;
    if (
      followUpByName != null &&
      String(followUpByName).trim() !== "" &&
      modelHasRelation(prisma, "job", "followupbyuser")
    ) {
      where.followupbyuser = {
        name: { contains: String(followUpByName).trim(), mode: "insensitive" }
      };
    }

    const faultName = query.faultName ?? query.faultname;
    if (faultName != null && String(faultName).trim() !== "") {
      where.jobsubcategories = {
        name: { contains: String(faultName).trim(), mode: "insensitive" }
      };
    }

    const brandId = parseIntFilter(query.brandId ?? query.brandid);
    if (brandId !== undefined) {
      where.brandid = brandId;
    }

    const serviceGroupId = parseIntFilter(query.serviceId);
    if (serviceGroupId !== undefined) {
      where.groupid = serviceGroupId;
    }

    const invoiceNumberFilter = buildJobDetailsInvoiceNumberFilter(query);
    const equipmentDetailFilters = buildJobDetailsEquipmentFilters(query);
    const jobDetailsFilters = [invoiceNumberFilter, ...equipmentDetailFilters].filter(Boolean);

    if (jobDetailsFilters.length === 1) {
      where.jobdetails = jobDetailsFilters[0];
    } else if (jobDetailsFilters.length > 1) {
      where.AND = where.AND || [];
      jobDetailsFilters.forEach((filter) => where.AND.push({ jobdetails: filter }));
    }

    appendJobDetailsCreatedByFilter(where, query);

    const kpiKey = query.kpi ?? query.statsKpi;
    if (kpiKey != null && String(kpiKey).trim() !== "") {
      const parsedKpi = parseJobStatsKpiKey(kpiKey);
      const statuses = await prisma.jobstatuses.findMany({
        where: { tenantid: Number(auth.tenantid) },
        select: {
          recno: true,
          title: true,
          isfirststatus: true,
          iscompletedstatus: true
        },
        orderBy: [{ sort: "asc" }, { recno: "asc" }]
      });
      const kpiWhere = buildJobKpiWhere(parsedKpi, buildJobStatusKpiContext(statuses));
      if (kpiWhere) {
        return mergeWhereClauses(where, kpiWhere);
      }
    }

    return where;
  }

  async list(auth, query = {}) {
    const pagination = this.buildPagination(query);
    const where = await this.applyFilters(auth, query);
    const orderBy = this.buildOrderBy(query);

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          ...buildJobListInclude(),
          jobproducts: buildJobProductLineInclude(),
          ...optionalJobservicesInclude()
        },
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({ where })
    ]);

    const [approvalMap, enrichmentContext] = await Promise.all([
      jobApprovalService.getApprovalSummariesForJobs(auth, rows),
      loadJobListEnrichmentContext(auth, rows)
    ]);
    const data = rows.map((job) => ({
      ...slimJobListRow(job, enrichmentContext),
      approval: approvalMap.get(Number(job.recno)) ?? null
    }));

    return {
      mode: this.mode,
      data,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailableJobFilters()
    };
  }

  async statsKpis(auth, query = {}) {
    const queryWithoutKpi = { ...query };
    delete queryWithoutKpi.kpi;
    delete queryWithoutKpi.statsKpi;

    const baseWhere = await this.applyFilters(auth, queryWithoutKpi);
    const tenantid = Number(auth.tenantid);

    const statuses = await prisma.jobstatuses.findMany({
      where: { tenantid },
      select: {
        recno: true,
        title: true,
        isfirststatus: true,
        iscompletedstatus: true
      },
      orderBy: [{ sort: "asc" }, { recno: "asc" }]
    });
    const context = buildJobStatusKpiContext(statuses);

    const countFor = (kpiKey) =>
      prisma.job.count({
        where: mergeWhereClauses(baseWhere, buildJobKpiWhere(kpiKey, context))
      });

    const [totalJobs, ...kpiCounts] = await Promise.all([
      prisma.job.count({ where: baseWhere }),
      ...JOB_STATS_KPI_KEYS.map((key) => countFor(key))
    ]);

    const counts = { totalJobs };
    JOB_STATS_KPI_KEYS.forEach((key, index) => {
      counts[key] = kpiCounts[index];
    });

    return formatStatsKpisResponse(this.mode, counts);
  }

  async dashboard(auth) {
    const where = await this.applyFilters(auth, {});
    const tenantid = Number(auth.tenantid);

    const [
      totalJobs,
      completedJobs,
      resolvedJobs,
      firstResponseJobs,
      pendingJobs,
      statusBreakdownRaw,
      allStatuses
    ] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.count({ where: { ...where, iscompleted: true } }),
      prisma.job.count({ where: { ...where, isresolved: true } }),
      prisma.job.count({ where: { ...where, isfirstresponse: true } }),
      // Treat null/undefined as not completed (only explicit true counts as completed).
      prisma.job.count({ where: { ...where, iscompleted: { not: true } } }),
      prisma.job.groupBy({ by: ["statusid"], where, _count: { _all: true } }),
      prisma.jobstatuses.findMany({
        where: { tenantid },
        select: {
          recno: true,
          title: true,
          color: true,
          sort: true,
          isfirststatus: true,
          iscompletedstatus: true,
          isresolvedstatus: true
        },
        orderBy: [{ sort: "asc" }, { recno: "asc" }]
      })
    ]);

    const countByStatusId = new Map();
    let noStatusCount = 0;
    statusBreakdownRaw.forEach((row) => {
      const count = row._count._all;
      if (row.statusid == null) {
        noStatusCount = count;
      } else {
        countByStatusId.set(Number(row.statusid), count);
      }
    });

    const statusBreakdown = allStatuses.map((meta) => ({
      statusId: meta.recno,
      statusName: meta.title ?? null,
      statusColor: meta.color ?? null,
      sort: meta.sort ?? null,
      count: countByStatusId.get(meta.recno) ?? 0,
      isFirstStatus: meta.isfirststatus ?? null,
      isCompletedStatus: meta.iscompletedstatus ?? null,
      isResolvedStatus: meta.isresolvedstatus ?? null
    }));

    if (noStatusCount > 0) {
      statusBreakdown.push({
        statusId: null,
        statusName: null,
        statusColor: null,
        sort: null,
        count: noStatusCount,
        isFirstStatus: null,
        isCompletedStatus: null,
        isResolvedStatus: null
      });
    }

    const statusBreakdownTotal = statusBreakdown.reduce((sum, row) => sum + row.count, 0);

    return {
      mode: this.mode,
      totalJobs,
      completedJobs,
      resolvedJobs,
      firstResponseJobs,
      pendingJobs,
      statusBreakdown,
      statusBreakdownTotal
    };
  }

  async reports(auth, query = {}) {
    const where = await this.applyFilters(auth, query);
    const [priorityBreakdown, assigneeBreakdown, serviceBreakdown, statusBreakdown, rows] = await Promise.all([
      prisma.job.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["assignedto"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["serviceid"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["statusid"], where, _count: { _all: true } }),
      prisma.job.findMany({
        where,
        include: buildJobListInclude(),
        orderBy: { recno: "desc" }
      })
    ]);

    return {
      mode: this.mode,
      summary: {
        total: rows.length,
        completed: rows.filter((job) => job.iscompleted === true).length,
        resolved: rows.filter((job) => job.isresolved === true).length
      },
      breakdowns: {
        priority: priorityBreakdown,
        assignee: assigneeBreakdown,
        service: serviceBreakdown,
        status: statusBreakdown
      },
      jobs: await (async () => {
        const [approvalMap, enrichmentContext] = await Promise.all([
          jobApprovalService.getApprovalSummariesForJobs(auth, rows),
          loadJobListEnrichmentContext(auth, rows)
        ]);
        return rows.map((job) => ({
          ...slimJobListRow(job, enrichmentContext),
          approval: approvalMap.get(Number(job.recno)) ?? null
        }));
      })()
    };
  }
}

module.exports = JobsListService;
module.exports.getAvailableJobFilters = getAvailableJobFilters;
module.exports.SORTABLE_COLUMNS = SORTABLE_COLUMNS;
