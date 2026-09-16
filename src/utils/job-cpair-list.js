const { buildCustomerRelationFilter } = require("./jobs-list-filters");
const { CP_AIR_RECEIVE_STATUSES, CP_AIR_ISSUE_STATUSES } = require("./job-cpair");
const { applyDirectCreatedByFilter, getCreatedByFilterMeta } = require("./list-filter");

const MAX_PAGE_SIZE = 100;

function parseIntFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function normalizeQuery(query = {}) {
  const next = { ...query };
  const aliases = {
    summaryId: "recno",
    technicianId: "technicianid",
    customerId: "customerid",
    faultId: "faultid",
    receiveStatus: "receivestatus",
    issueStatus: "issuestatus",
    lineReceiveStatus: "linereceivestatus",
    lineIssueStatus: "lineissuestatus",
    partReceiveStatus: "linereceivestatus",
    partIssueStatus: "lineissuestatus",
    productId: "productid",
    partName: "partname",
    jobProductId: "jobproductid"
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
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function buildSummaryListWhere(auth, query = {}, options = {}) {
  const q = normalizeQuery(query);
  const where = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };

  if (options.restrictToAssignee) {
    where.technicianid = Number(auth.userid);
  }

  const summaryId = parseIntFilter(q.recno ?? q.summaryId ?? q.summaryid);
  if (summaryId !== undefined) where.recno = summaryId;

  const jobId = parseIntFilter(q.jobId ?? q.jobid);
  if (jobId !== undefined) where.jobid = jobId;

  const technicianId = parseIntFilter(q.technicianid ?? q.technicianId);
  if (technicianId !== undefined && !options.restrictToAssignee) {
    where.technicianid = technicianId;
  }

  const customerId = parseIntFilter(q.customerid ?? q.customerId);
  if (customerId !== undefined) where.customerid = customerId;

  const faultId = parseIntFilter(q.faultid ?? q.faultId);
  if (faultId !== undefined) where.faultid = faultId;

  const receiveStatus = q.receivestatus ?? q.receiveStatus;
  if (receiveStatus && CP_AIR_RECEIVE_STATUSES.includes(String(receiveStatus))) {
    where.receivestatus = String(receiveStatus);
  }

  const issueStatus = q.issuestatus ?? q.issueStatus;
  if (issueStatus && CP_AIR_ISSUE_STATUSES.includes(String(issueStatus))) {
    where.issuestatus = String(issueStatus);
  }

  if (q.from || q.to) {
    where.createdat = where.createdat || {};
    if (q.from) where.createdat.gte = new Date(q.from);
    if (q.to) where.createdat.lte = new Date(q.to);
  }

  const customerName = q.customerName ?? q.customername;
  if (customerName != null && String(customerName).trim() !== "") {
    where.customername = { contains: String(customerName).trim(), mode: "insensitive" };
  }

  const technicianName = q.technicianName ?? q.technicianname;
  if (technicianName != null && String(technicianName).trim() !== "") {
    where.technicianname = { contains: String(technicianName).trim(), mode: "insensitive" };
  }

  const faultName = q.faultName ?? q.faultname;
  if (faultName != null && String(faultName).trim() !== "") {
    where.faultname = { contains: String(faultName).trim(), mode: "insensitive" };
  }

  const search = q.search ?? q.q ?? q.jobNo ?? q.jobno;
  if (search != null && String(search).trim() !== "") {
    where.job = {
      OR: [
        { code: { contains: String(search).trim(), mode: "insensitive" } },
        { manualjobno: { contains: String(search).trim(), mode: "insensitive" } }
      ]
    };
  }

  const customerFilter = buildCustomerRelationFilter(q);
  if (customerFilter) {
    where.job = { ...(where.job || {}), customers: customerFilter };
  }

  applyDirectCreatedByFilter(where, q);

  return where;
}

function buildSummaryOrderBy(query = {}) {
  const sortBy = query.sortBy ? String(query.sortBy) : null;
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const map = {
    date: "createdat",
    createdAt: "createdat",
    totalCpairQty: "totalcpairqty",
    totalQtyReceived: "totalqtyreceived",
    totalIssueQty: "totalissueqty",
    receiveStatus: "receivestatus",
    issueStatus: "issuestatus",
    customerName: "customername",
    technicianName: "technicianname",
    jobId: "jobid"
  };
  const field = map[sortBy] || "createdat";
  return { [field]: sortOrder };
}

function buildPartListWhere(auth, query = {}, options = {}) {
  const q = normalizeQuery(query);
  const partWhere = {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid),
    summary: buildSummaryListWhere(auth, query, options)
  };

  const summaryId = parseIntFilter(q.recno ?? q.summaryId ?? q.summaryid);
  if (summaryId !== undefined) partWhere.jobcpairsummaryid = summaryId;

  const productId = parseIntFilter(q.productid ?? q.productId);
  if (productId !== undefined) partWhere.productid = productId;

  const jobProductId = parseIntFilter(q.jobproductid ?? q.jobProductId);
  if (jobProductId !== undefined) partWhere.jobproductid = jobProductId;

  const partName = q.partname ?? q.partName;
  if (partName != null && String(partName).trim() !== "") {
    partWhere.partname = { contains: String(partName).trim(), mode: "insensitive" };
  }

  const lineReceiveStatus = q.linereceivestatus ?? q.lineReceiveStatus ?? q.partReceiveStatus;
  if (lineReceiveStatus === "pending") {
    partWhere.lineqtyreceived = 0;
    partWhere.qty = { gt: 0 };
  }

  const lineIssueStatus = q.lineissuestatus ?? q.lineIssueStatus ?? q.partIssueStatus;
  if (lineIssueStatus === "pending") {
    partWhere.lineissueqty = 0;
    partWhere.lineqtyreceived = { gt: 0 };
  }

  return partWhere;
}

function filterOverviewRows(rows = [], query = {}) {
  const q = normalizeQuery(query);
  let next = rows;

  const lineReceiveStatus = q.linereceivestatus ?? q.lineReceiveStatus ?? q.partReceiveStatus;
  if (lineReceiveStatus && CP_AIR_RECEIVE_STATUSES.includes(String(lineReceiveStatus))) {
    if (lineReceiveStatus !== "pending") {
      next = next.filter((row) => row.receiveStatus === String(lineReceiveStatus));
    }
  }

  const lineIssueStatus = q.lineissuestatus ?? q.lineIssueStatus ?? q.partIssueStatus;
  if (lineIssueStatus && CP_AIR_ISSUE_STATUSES.includes(String(lineIssueStatus))) {
    if (lineIssueStatus !== "pending") {
      next = next.filter((row) => row.issueStatus === String(lineIssueStatus));
    }
  }

  return next;
}

function sortOverviewRows(rows = [], query = {}) {
  const sortBy = query.sortBy ? String(query.sortBy) : "createdAt";
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  const map = {
    createdAt: (row) => (row.createdAt ? new Date(row.createdAt).getTime() : 0),
    partName: (row) => row.partName ?? "",
    jobNo: (row) => row.jobNo ?? "",
    jobId: (row) => Number(row.jobId) || 0,
    customerName: (row) => row.customerName ?? "",
    technicianName: (row) => row.technicianName ?? "",
    qty: (row) => Number(row.qty) || 0,
    lineQtyReceived: (row) => Number(row.lineQtyReceived) || 0,
    lineIssueQty: (row) => Number(row.lineIssueQty) || 0,
    receiveStatus: (row) => row.receiveStatus ?? "",
    issueStatus: (row) => row.issueStatus ?? "",
    summaryReceiveStatus: (row) => row.summaryReceiveStatus ?? "",
    summaryIssueStatus: (row) => row.summaryIssueStatus ?? ""
  };
  const getter = map[sortBy] || map.createdAt;

  return [...rows].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);
    if (leftValue < rightValue) return -sortOrder;
    if (leftValue > rightValue) return sortOrder;
    return 0;
  });
}

function buildOverviewWhere(auth, query = {}, options = {}) {
  return { partWhere: buildPartListWhere(auth, query, options) };
}

function getAvailableSummaryFilters() {
  return [
    { field: "summaryId", type: "Int", description: "C-pair summary id (jobcpairsummary.recno)" },
    { field: "jobId", type: "Int" },
    { field: "technicianId", type: "Int" },
    { field: "customerId", type: "Int" },
    { field: "customerName", type: "String", operators: ["contains"] },
    { field: "customerPhone", type: "String", operators: ["contains"] },
    { field: "customerEmail", type: "String", operators: ["contains"] },
    { field: "technicianName", type: "String", operators: ["contains"] },
    { field: "faultId", type: "Int" },
    { field: "faultName", type: "String", operators: ["contains"] },
    { field: "receiveStatus", type: "Enum", values: CP_AIR_RECEIVE_STATUSES, description: "Summary-level receive status" },
    { field: "issueStatus", type: "Enum", values: CP_AIR_ISSUE_STATUSES, description: "Summary-level issue status" },
    { field: "from", type: "DateTime", description: "Summary created from" },
    { field: "to", type: "DateTime", description: "Summary created to" },
    { field: "search", type: "String", operators: ["contains"], description: "Job code or manual job number" },
    ...getCreatedByFilterMeta()
  ];
}

function getSummarySortableColumns() {
  return [
    "date",
    "createdAt",
    "jobId",
    "customerName",
    "technicianName",
    "totalCpairQty",
    "totalQtyReceived",
    "totalIssueQty",
    "receiveStatus",
    "issueStatus"
  ];
}

function getAvailableOverviewFilters() {
  return [
    ...getAvailableSummaryFilters(),
    { field: "productId", type: "Int", description: "Inventory product id on the part line" },
    { field: "jobProductId", type: "Int", description: "Job product line id (jobproducts.recno)" },
    { field: "partName", type: "String", operators: ["contains"] },
    {
      field: "lineReceiveStatus",
      type: "Enum",
      values: CP_AIR_RECEIVE_STATUSES,
      description: "Per-part receive status (aliases: partReceiveStatus)"
    },
    {
      field: "lineIssueStatus",
      type: "Enum",
      values: CP_AIR_ISSUE_STATUSES,
      description: "Per-part issue status (aliases: partIssueStatus)"
    }
  ];
}

function getOverviewSortableColumns() {
  return [
    "createdAt",
    "jobNo",
    "jobId",
    "partName",
    "customerName",
    "technicianName",
    "qty",
    "lineQtyReceived",
    "lineIssueQty",
    "receiveStatus",
    "issueStatus",
    "summaryReceiveStatus",
    "summaryIssueStatus"
  ];
}

module.exports = {
  MAX_PAGE_SIZE,
  buildPagination,
  buildSummaryListWhere,
  buildSummaryOrderBy,
  buildPartListWhere,
  buildOverviewWhere,
  filterOverviewRows,
  sortOverviewRows,
  getAvailableSummaryFilters,
  getAvailableOverviewFilters,
  getSummarySortableColumns,
  getOverviewSortableColumns
};
