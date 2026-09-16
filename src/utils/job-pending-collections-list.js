const { buildCustomerRelationFilter } = require("./jobs-list-filters");
const { buildJobHierarchyFields } = require("./job-response-labels");
const {
  normalizeQuery,
  buildPagination,
  buildJobAddressLabel,
  COLLECTION_LIST_JOB_INCLUDE
} = require("./job-collections-list");
const {
  appendJobDetailsCreatedByFilter,
  getCreatedByFilterMeta
} = require("./list-filter");

const MAX_PAGE_SIZE = 100;

const SORTABLE_COLUMNS = [
  "jobId",
  "jobNo",
  "jobDate",
  "date",
  "totalCost",
  "amountToCollect",
  "technicianName",
  "customerName",
  "jobCategory",
  "jobFault",
  "assignedByName"
];

const SORT_COLUMN_MAP = {
  date: "jobDate",
  jobNo: "code",
  amountToCollect: "totalcost",
  totalCost: "totalcost"
};

function parseIntFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseFloatFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatPendingCollectionListRow(job) {
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] ?? null : job.jobdetails ?? null;
  const hierarchy = buildJobHierarchyFields(job);
  const assignedByUser = detail?.users_jobdetails_assignedbyTousers ?? null;
  const totalCost = job.totalcost ?? 0;

  return {
    jobId: job.recno,
    jobDate: job.date ?? null,
    jobNo: job.code ?? null,
    manualJobNo: job.manualjobno ?? null,
    technicianId: job.assignedto ?? null,
    technicianName: job.users?.name ?? null,
    assignedBy: detail?.assignedby ?? null,
    assignedByName: assignedByUser?.name ?? null,
    totalCost,
    amountToCollect: totalCost,
    cashToCollect: totalCost,
    collectionStatus: "pending",
    cashCollection: null,
    customerId: job.customerid ?? job.customers?.customerid ?? null,
    customerName: job.customers?.name ?? null,
    customerAddress: buildJobAddressLabel(job, detail),
    jobFault: hierarchy.faultName,
    jobCategory: hierarchy.categoryName,
    jobServiceId: hierarchy.serviceId,
    jobServiceName: hierarchy.serviceName,
    isCompleted: job.iscompleted === true,
    isResolved: job.isresolved === true
  };
}

function buildPendingCollectionJobWhere(auth, query = {}, options = {}) {
  const q = normalizeQuery(query);
  const where = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid),
    jobcollections: { is: null },
    AND: [{ OR: [{ iscompleted: true }, { isresolved: true }] }]
  };

  const jobId = parseIntFilter(q.jobId ?? q.jobid);
  if (jobId !== undefined) {
    where.recno = jobId;
  }

  const assignedToId = parseIntFilter(q.assignedToId ?? q.technicianId ?? q.assignedto);
  if (assignedToId !== undefined) {
    where.assignedto = assignedToId;
  }

  const customerId = parseIntFilter(q.customerId ?? q.customerid);
  if (customerId !== undefined) {
    where.customerid = customerId;
  }

  const categoryId = parseIntFilter(q.categoryId ?? q.serviceid);
  if (categoryId !== undefined) {
    where.serviceid = categoryId;
  }

  const faultId = parseIntFilter(q.faultId ?? q.faultid);
  if (faultId !== undefined) {
    where.faultid = faultId;
  }

  const serviceId = parseIntFilter(q.serviceId ?? q.groupid);
  if (serviceId !== undefined) {
    where.groupid = serviceId;
  }

  if (q.jobFrom || q.jobTo || q.from || q.to) {
    where.date = where.date || {};
    if (q.jobFrom || q.from) where.date.gte = new Date(q.jobFrom || q.from);
    if (q.jobTo || q.to) where.date.lte = new Date(q.jobTo || q.to);
  }

  const search = q.search ?? q.q ?? q.keyword ?? q.jobNo ?? q.jobno ?? q.code;
  if (search != null && String(search).trim() !== "") {
    const term = String(search).trim();
    where.AND.push({
      OR: [
        { code: { contains: term, mode: "insensitive" } },
        { manualjobno: { contains: term, mode: "insensitive" } }
      ]
    });
  }

  const customerFilter = buildCustomerRelationFilter(q);
  if (customerFilter) {
    where.customers = customerFilter;
  }

  const technicianName = q.technicianName ?? q.assignedToName ?? q.assignedtoname;
  if (technicianName != null && String(technicianName).trim() !== "") {
    where.users = {
      name: { contains: String(technicianName).trim(), mode: "insensitive" }
    };
  }

  const assignedBy = parseIntFilter(q.assignedBy ?? q.assignedById ?? q.assignedby);
  const assignedByName = q.assignedByName ?? q.assignedbyname;
  const customerAddress = q.customerAddress ?? q.customeraddress ?? q.address;

  const detailFilter = {};
  if (assignedBy !== undefined) {
    detailFilter.assignedby = assignedBy;
  }
  if (assignedByName != null && String(assignedByName).trim() !== "") {
    detailFilter.users_jobdetails_assignedbyTousers = {
      name: { contains: String(assignedByName).trim(), mode: "insensitive" }
    };
  }
  if (customerAddress != null && String(customerAddress).trim() !== "") {
    detailFilter.address = { contains: String(customerAddress).trim(), mode: "insensitive" };
  }
  if (Object.keys(detailFilter).length) {
    where.jobdetails = { some: detailFilter };
  }

  const minAmount = parseFloatFilter(q.minAmount ?? q.minAmountToCollect);
  const maxAmount = parseFloatFilter(q.maxAmount ?? q.maxAmountToCollect);
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.totalcost = where.totalcost || {};
    if (minAmount !== undefined) where.totalcost.gte = minAmount;
    if (maxAmount !== undefined) where.totalcost.lte = maxAmount;
  }

  if (options.restrictToAssignee) {
    where.assignedto = Number(auth.userid);
  }

  appendJobDetailsCreatedByFilter(where, q);

  return where;
}

function buildPendingCollectionListOrderBy(query = {}) {
  const rawSortBy = query.sortBy ? String(query.sortBy) : null;
  const sortBy = rawSortBy ? SORT_COLUMN_MAP[rawSortBy] || rawSortBy : null;
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  if (!sortBy || !SORTABLE_COLUMNS.includes(rawSortBy || sortBy)) {
    return { recno: "desc" };
  }

  switch (sortBy) {
    case "jobDate":
      return { date: sortOrder };
    case "code":
      return { code: sortOrder };
    case "totalcost":
      return { totalcost: sortOrder };
    case "jobId":
      return { recno: sortOrder };
    case "technicianName":
      return { users: { name: sortOrder } };
    case "customerName":
      return { customers: { name: sortOrder } };
    case "jobCategory":
      return { jobcategories: { name: sortOrder } };
    case "jobFault":
      return { jobsubcategories: { name: sortOrder } };
    case "assignedByName":
      return { recno: sortOrder };
    default:
      return { recno: "desc" };
  }
}

function getAvailablePendingCollectionListFilters() {
  return [
    { field: "jobFrom", type: "DateTime", operators: ["gte"], description: "Job date from" },
    { field: "jobTo", type: "DateTime", operators: ["lte"], description: "Job date to" },
    { field: "jobId", type: "Int", operators: ["equals"] },
    { field: "search", type: "String", operators: ["contains"], description: "Job code or manual job number" },
    { field: "technicianId", type: "Int", operators: ["equals"], description: "Assigned technician (job.assignedto)" },
    { field: "technicianName", type: "String", operators: ["contains"] },
    { field: "assignedBy", type: "Int", operators: ["equals"] },
    { field: "assignedByName", type: "String", operators: ["contains"] },
    { field: "customerId", type: "Int", operators: ["equals"] },
    { field: "customerName", type: "String", operators: ["contains"] },
    { field: "customerPhone", type: "String", operators: ["contains"] },
    { field: "customerAddress", type: "String", operators: ["contains"] },
    { field: "serviceId", type: "Int", operators: ["equals"], description: "Job group id" },
    { field: "categoryId", type: "Int", operators: ["equals"], description: "Job category id" },
    { field: "faultId", type: "Int", operators: ["equals"], description: "Job fault/subcategory id" },
    {
      field: "minAmount",
      type: "Float",
      operators: ["gte"],
      description: "Minimum cash to collect (job.totalcost)"
    },
    {
      field: "maxAmount",
      type: "Float",
      operators: ["lte"],
      description: "Maximum cash to collect (job.totalcost)"
    },
    ...getCreatedByFilterMeta({ includeName: true })
  ];
}

function buildEmptyPendingCollectionsResponse(service, pagination, settings) {
  return {
    mode: service.mode,
    cashCollectionEnabled: settings?.allowreceivecollection === true,
    data: [],
    summary: {
      totalPendingJobs: 0,
      totalAmountToCollect: 0,
      totalRecords: 0
    },
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: 0,
      totalPages: 0
    },
    filters: getAvailablePendingCollectionListFilters(),
    sortableColumns: SORTABLE_COLUMNS
  };
}

module.exports = {
  MAX_PAGE_SIZE,
  SORTABLE_COLUMNS,
  buildPagination,
  formatPendingCollectionListRow,
  buildPendingCollectionJobWhere,
  buildPendingCollectionListOrderBy,
  getAvailablePendingCollectionListFilters,
  buildEmptyPendingCollectionsResponse,
  PENDING_COLLECTION_JOB_INCLUDE: COLLECTION_LIST_JOB_INCLUDE
};
