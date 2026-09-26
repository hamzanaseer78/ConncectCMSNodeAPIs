const {
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta
} = require("./jobs-list-report");

function formatReportDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

const JOB_REVENUE_REPORT_KEY = "job_revenue";

const DEFAULT_JOB_REVENUE_REPORT_COLUMNS = [
  {
    columnName: "jobCode",
    columnDescription: "Job#",
    isShow: true,
    sortable: true,
    sortNo: 1,
    minWidth: 120,
    columnFieldType: "string",
    clickable: true,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "jobDate",
    columnDescription: "Job Date",
    isShow: true,
    sortable: true,
    sortNo: 2,
    minWidth: 130,
    columnFieldType: "date",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "customerName",
    columnDescription: "Customer Name",
    isShow: true,
    sortable: true,
    sortNo: 3,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "assignedToName",
    columnDescription: "Technician",
    isShow: true,
    sortable: true,
    sortNo: 4,
    minWidth: 150,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "status",
    columnDescription: "Status",
    isShow: true,
    sortable: true,
    sortNo: 5,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "amountToCollect",
    columnDescription: "Amount To Be Collected",
    isShow: true,
    sortable: true,
    sortNo: 6,
    minWidth: 170,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "collectedAmount",
    columnDescription: "Collected Amount",
    isShow: true,
    sortable: true,
    sortNo: 7,
    minWidth: 150,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "outstandingBalance",
    columnDescription: "Outstanding (To Collect - Collected)",
    isShow: true,
    sortable: true,
    sortNo: 8,
    minWidth: 190,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "collectedAt",
    columnDescription: "Collected Date",
    isShow: true,
    sortable: true,
    sortNo: 9,
    minWidth: 140,
    columnFieldType: "date",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  }
];

const JOB_REVENUE_REPORT_SORT_FIELD_MAP = {
  jobCode: "code",
  manualJobNo: "manualjobno",
  jobDate: "date",
  customerName: "customerName",
  assignedToName: "assignedToName",
  status: "statusName",
  amountToCollect: "totalcost",
  collectedAmount: "collectedAmount",
  outstandingBalance: "outstandingBalance",
  collectedAt: "collectedAt"
};

const MEMORY_SORT_FIELDS = new Set([
  "collectedAmount",
  "outstandingBalance",
  "collectedAt"
]);

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function resolveCollectionStatus(amountToCollect, collectedAmount) {
  if (collectedAmount <= 0) return "pending";
  if (amountToCollect <= 0) return collectedAmount > 0 ? "collected" : "pending";
  if (collectedAmount >= amountToCollect) return "collected";
  return "partial";
}

function mapJobToRevenueReportRow(job) {
  if (!job) return null;

  const amountToCollect = roundMoney(job.totalcost ?? 0);
  const collectedAmount = roundMoney(job.jobcollections?.amount ?? 0);

  return {
    jobId: job.recno,
    jobCode: job.code ?? null,
    manualJobNo: job.manualjobno ?? null,
    jobDate: formatReportDate(job.date),
    customerName: job.customers?.name ?? null,
    customerPhone: job.customers?.contactno ?? null,
    assignedToId: job.assignedto ?? job.users?.userid ?? null,
    assignedToName: job.users?.name ?? null,
    status: job.jobstatuses?.title ?? null,
    statusColor: job.jobstatuses?.color ?? null,
    amountToCollect,
    collectedAmount,
    outstandingBalance: roundMoney(amountToCollect - collectedAmount),
    collectedAt: formatReportDate(job.jobcollections?.collectedat),
    collectionStatus: resolveCollectionStatus(amountToCollect, collectedAmount)
  };
}

function sortRevenueReportRows(rows, query = {}) {
  const sortBy = query.sortBy ? String(query.sortBy) : "jobDate";
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    let leftValue = left[sortBy];
    let rightValue = right[sortBy];

    if (sortBy === "jobDate" || sortBy === "collectedAt") {
      const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
      const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
      if (leftTime < rightTime) return -sortOrder;
      if (leftTime > rightTime) return sortOrder;
      return 0;
    }

    if (["amountToCollect", "collectedAmount", "outstandingBalance"].includes(sortBy)) {
      const ln = Number(leftValue) || 0;
      const rn = Number(rightValue) || 0;
      if (ln < rn) return -sortOrder;
      if (ln > rn) return sortOrder;
      return 0;
    }

    const leftText = String(leftValue ?? "").toLowerCase();
    const rightText = String(rightValue ?? "").toLowerCase();
    if (leftText < rightText) return -sortOrder;
    if (leftText > rightText) return sortOrder;
    return 0;
  });
}

function paginateRevenueRows(rows, query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const total = rows.length;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  const start = (page - 1) * pageSize;

  return {
    data: rows.slice(start, start + pageSize),
    pageInfo: {
      page,
      pageSize,
      total,
      totalPages
    }
  };
}

module.exports = {
  JOB_REVENUE_REPORT_KEY,
  DEFAULT_JOB_REVENUE_REPORT_COLUMNS,
  JOB_REVENUE_REPORT_SORT_FIELD_MAP,
  MEMORY_SORT_FIELDS,
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta,
  mapJobToRevenueReportRow,
  sortRevenueReportRows,
  paginateRevenueRows
};
