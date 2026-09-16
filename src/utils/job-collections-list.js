const { buildCustomerRelationFilter } = require("./jobs-list-filters");
const { buildJobHierarchyFields } = require("./job-response-labels");
const { buildAddressLabel } = require("./customer-address");
const {
  applyDirectCreatedByFilter,
  getCreatedByFilterMeta
} = require("./list-filter");

const MAX_PAGE_SIZE = 100;

const SORTABLE_COLUMNS = [
  "collectedAt",
  "date",
  "amount",
  "collectionAmount",
  "jobId",
  "jobNo",
  "technicianName",
  "customerName",
  "jobCategory",
  "jobFault",
  "assignedByName"
];

const SORT_COLUMN_MAP = {
  date: "collectedAt",
  collectionAmount: "amount",
  jobNo: "jobCode"
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

function normalizeQuery(query = {}) {
  const next = { ...query };
  const aliases = {
    technicianId: "assignedToId",
    technitianId: "assignedToId",
    jobNumber: "jobNo",
    collectionFrom: "from",
    collectionTo: "to",
    amountFrom: "minAmount",
    amountTo: "maxAmount"
  };
  Object.entries(aliases).forEach(([alias, target]) => {
    if (next[alias] !== undefined && next[target] === undefined) {
      next[target] = next[alias];
    }
  });
  return next;
}

function buildPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

function buildJobAddressLabel(job, detail) {
  const dto = {
    address: detail?.address ?? job?.customers?.address ?? null,
    areaName: job?.areas?.name ?? job?.customers?.areas?.name ?? null,
    cityName: job?.cities?.name ?? job?.customers?.cities?.name ?? null,
    countryName: job?.cities?.countries?.name ?? job?.customers?.countries?.name ?? null
  };
  return buildAddressLabel(dto);
}

function formatCollectionListRow(row) {
  const job = row.job ?? {};
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] ?? null : job.jobdetails ?? null;
  const hierarchy = buildJobHierarchyFields(job);
  const assignedByUser = detail?.users_jobdetails_assignedbyTousers ?? null;

  return {
    collectionId: row.recno,
    jobId: row.jobid,
    date: row.collectedat,
    collectedAt: row.collectedat,
    jobDate: job.date ?? null,
    jobNo: job.code ?? null,
    manualJobNo: job.manualjobno ?? null,
    technicianId: job.assignedto ?? null,
    technicianName: job.users?.name ?? null,
    collectedBy: row.collectedby,
    assignedBy: detail?.assignedby ?? null,
    assignedByName: assignedByUser?.name ?? null,
    collectionAmount: row.amount,
    amount: row.amount,
    customerId: job.customerid ?? job.customers?.customerid ?? null,
    customerName: job.customers?.name ?? null,
    customerAddress: buildJobAddressLabel(job, detail),
    jobFault: hierarchy.faultName,
    jobCategory: hierarchy.categoryName,
    jobServiceId: hierarchy.serviceId,
    jobServiceName: hierarchy.serviceName,
    remarks: row.remarks ?? null
  };
}

function buildCollectionListWhere(auth, query = {}, options = {}) {
  const q = normalizeQuery(query);
  const where = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };

  const collectionId = parseIntFilter(q.collectionId ?? q.recno);
  if (collectionId !== undefined) {
    where.recno = collectionId;
  }

  const jobId = parseIntFilter(q.jobId ?? q.jobid);
  if (jobId !== undefined) {
    where.jobid = jobId;
  }

  const collectedBy = parseIntFilter(q.collectedBy ?? q.collectedby);
  if (collectedBy !== undefined) {
    where.collectedby = collectedBy;
  }

  applyDirectCreatedByFilter(where, q);

  if (q.from || q.to) {
    where.collectedat = where.collectedat || {};
    if (q.from) where.collectedat.gte = new Date(q.from);
    if (q.to) where.collectedat.lte = new Date(q.to);
  }

  const minAmount = parseFloatFilter(q.minAmount);
  const maxAmount = parseFloatFilter(q.maxAmount);
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = where.amount || {};
    if (minAmount !== undefined) where.amount.gte = minAmount;
    if (maxAmount !== undefined) where.amount.lte = maxAmount;
  }

  const jobWhere = { ...(where.job || {}) };

  const assignedToId = parseIntFilter(q.assignedToId ?? q.technicianId ?? q.assignedto);
  if (assignedToId !== undefined) {
    jobWhere.assignedto = assignedToId;
  }

  const customerId = parseIntFilter(q.customerId ?? q.customerid);
  if (customerId !== undefined) {
    jobWhere.customerid = customerId;
  }

  const categoryId = parseIntFilter(q.categoryId ?? q.serviceid);
  if (categoryId !== undefined) {
    jobWhere.serviceid = categoryId;
  }

  const faultId = parseIntFilter(q.faultId ?? q.faultid);
  if (faultId !== undefined) {
    jobWhere.faultid = faultId;
  }

  const serviceId = parseIntFilter(q.serviceId ?? q.groupid);
  if (serviceId !== undefined) {
    jobWhere.groupid = serviceId;
  }

  if (q.jobFrom || q.jobTo) {
    jobWhere.date = jobWhere.date || {};
    if (q.jobFrom) jobWhere.date.gte = new Date(q.jobFrom);
    if (q.jobTo) jobWhere.date.lte = new Date(q.jobTo);
  }

  const search = q.search ?? q.q ?? q.keyword ?? q.jobNo ?? q.jobno ?? q.code;
  if (search != null && String(search).trim() !== "") {
    const term = String(search).trim();
    jobWhere.OR = [
      { code: { contains: term, mode: "insensitive" } },
      { manualjobno: { contains: term, mode: "insensitive" } }
    ];
  }

  const customerFilter = buildCustomerRelationFilter(q);
  if (customerFilter) {
    jobWhere.customers = customerFilter;
  }

  const technicianName = q.technicianName ?? q.assignedToName ?? q.assignedtoname;
  if (technicianName != null && String(technicianName).trim() !== "") {
    jobWhere.users = {
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
    jobWhere.jobdetails = { some: detailFilter };
  }

  if (options.restrictToAssignee) {
    jobWhere.assignedto = Number(auth.userid);
  }

  if (Object.keys(jobWhere).length) {
    where.job = jobWhere;
  }

  return where;
}

function buildCollectionListOrderBy(query = {}) {
  const rawSortBy = query.sortBy ? String(query.sortBy) : null;
  const sortBy = rawSortBy ? SORT_COLUMN_MAP[rawSortBy] || rawSortBy : null;
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  if (!sortBy || !SORTABLE_COLUMNS.includes(sortBy)) {
    return { createdat: "desc" };
  }

  switch (sortBy) {
    case "collectedAt":
      return { collectedat: sortOrder };
    case "amount":
      return { amount: sortOrder };
    case "jobId":
      return { jobid: sortOrder };
    case "jobCode":
      return { job: { code: sortOrder } };
    case "technicianName":
      return { job: { users: { name: sortOrder } } };
    case "customerName":
      return { job: { customers: { name: sortOrder } } };
    case "jobCategory":
      return { job: { jobcategories: { name: sortOrder } } };
    case "jobFault":
      return { job: { jobsubcategories: { name: sortOrder } } };
    case "assignedByName":
      return { collectedat: sortOrder };
    default:
      return { createdat: "desc" };
  }
}

function getAvailableCollectionListFilters() {
  return [
    { field: "from", type: "DateTime", operators: ["gte"], description: "Collection date from (collectedAt)" },
    { field: "to", type: "DateTime", operators: ["lte"], description: "Collection date to (collectedAt)" },
    { field: "jobFrom", type: "DateTime", operators: ["gte"], description: "Job date from" },
    { field: "jobTo", type: "DateTime", operators: ["lte"], description: "Job date to" },
    { field: "jobId", type: "Int", operators: ["equals"] },
    { field: "search", type: "String", operators: ["contains"], description: "Job code or manual job number" },
    { field: "technicianId", type: "Int", operators: ["equals"], description: "Assigned technician (job.assignedto)" },
    { field: "technicianName", type: "String", operators: ["contains"] },
    { field: "collectedBy", type: "Int", operators: ["equals"], description: "User who recorded collection" },
    { field: "assignedBy", type: "Int", operators: ["equals"] },
    { field: "assignedByName", type: "String", operators: ["contains"] },
    { field: "customerId", type: "Int", operators: ["equals"] },
    { field: "customerName", type: "String", operators: ["contains"] },
    { field: "customerPhone", type: "String", operators: ["contains"] },
    { field: "customerAddress", type: "String", operators: ["contains"] },
    { field: "serviceId", type: "Int", operators: ["equals"], description: "Job group id" },
    { field: "categoryId", type: "Int", operators: ["equals"], description: "Job category id" },
    { field: "faultId", type: "Int", operators: ["equals"], description: "Job fault/subcategory id" },
    { field: "minAmount", type: "Float", operators: ["gte"] },
    { field: "maxAmount", type: "Float", operators: ["lte"] },
    ...getCreatedByFilterMeta()
  ];
}

const COLLECTION_LIST_JOB_INCLUDE = {
  customers: {
    include: {
      countries: { select: { recno: true, name: true } },
      cities: { select: { recno: true, name: true } },
      areas: { select: { recno: true, name: true } }
    }
  },
  users: { select: { userid: true, name: true } },
  jobgroups: { select: { groupid: true, name: true } },
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
      countries: { select: { recno: true, name: true } }
    }
  },
  areas: { select: { recno: true, name: true } },
  jobdetails: {
    orderBy: { recno: "asc" },
    take: 1,
    select: {
      assignedby: true,
      address: true,
      users_jobdetails_assignedbyTousers: { select: { userid: true, name: true } }
    }
  }
};

module.exports = {
  MAX_PAGE_SIZE,
  SORTABLE_COLUMNS,
  normalizeQuery,
  buildPagination,
  buildJobAddressLabel,
  formatCollectionListRow,
  buildCollectionListWhere,
  buildCollectionListOrderBy,
  getAvailableCollectionListFilters,
  COLLECTION_LIST_JOB_INCLUDE
};
