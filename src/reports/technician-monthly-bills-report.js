const {
  formatTechnicianAffiliationLabel
} = require("../utils/technician-affiliation");
const { jobMainEquipmentFields } = require("../utils/job-equipment");

const TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY = "technician_monthly_bills_summary";
const TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY = "technician_monthly_bills_detail";

const DEFAULT_SUMMARY_COLUMNS = [
  {
    columnName: "technicianName",
    columnDescription: "Technician",
    isShow: true,
    sortable: true,
    sortNo: 1,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "technicianAffiliationLabel",
    columnDescription: "Technician Affiliation",
    isShow: true,
    sortable: true,
    sortNo: 2,
    minWidth: 150,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "cashCollected",
    columnDescription: "Cash Collected",
    isShow: true,
    sortable: true,
    sortNo: 3,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "expenses",
    columnDescription: "Expenses",
    isShow: true,
    sortable: true,
    sortNo: 4,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "balance",
    columnDescription: "Balance (Cash - Expense)",
    isShow: true,
    sortable: true,
    sortNo: 5,
    minWidth: 170,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  }
];

const DEFAULT_DETAIL_COLUMNS = [
  {
    columnName: "activityDate",
    columnDescription: "Date",
    isShow: true,
    sortable: true,
    sortNo: 1,
    minWidth: 130,
    columnFieldType: "date",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "jobCode",
    columnDescription: "Job#",
    isShow: true,
    sortable: true,
    sortNo: 2,
    minWidth: 120,
    columnFieldType: "string",
    clickable: true,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "technicianName",
    columnDescription: "Technician",
    isShow: true,
    sortable: true,
    sortNo: 3,
    minWidth: 150,
    columnFieldType: "string",
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
    sortNo: 4,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "customerAddress",
    columnDescription: "Customer Address",
    isShow: true,
    sortable: false,
    sortNo: 5,
    minWidth: 200,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "customerPhone",
    columnDescription: "Customer Phone",
    isShow: true,
    sortable: false,
    sortNo: 6,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "jobDescription",
    columnDescription: "Job Description",
    isShow: true,
    sortable: false,
    sortNo: 7,
    minWidth: 200,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "invoiceNumber",
    columnDescription: "Invoice#",
    isShow: true,
    sortable: false,
    sortNo: 8,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "status",
    columnDescription: "Status",
    isShow: true,
    sortable: true,
    sortNo: 9,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "cashCollected",
    columnDescription: "Cash Collected",
    isShow: true,
    sortable: true,
    sortNo: 10,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "expenses",
    columnDescription: "Expenses",
    isShow: true,
    sortable: true,
    sortNo: 11,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "balance",
    columnDescription: "Balance (Cash - Expense)",
    isShow: true,
    sortable: true,
    sortNo: 12,
    minWidth: 170,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  }
];

const SUMMARY_SORT_FIELD_MAP = {
  technicianName: "technicianName",
  technicianAffiliationLabel: "technicianAffiliationLabel",
  cashCollected: "cashCollected",
  expenses: "expenses",
  balance: "balance"
};

const DETAIL_SORT_FIELD_MAP = {
  activityDate: "activityDate",
  jobCode: "jobCode",
  technicianName: "technicianName",
  customerName: "customerName",
  status: "status",
  cashCollected: "cashCollected",
  expenses: "expenses",
  balance: "balance"
};

function extractReportFilter(source = {}) {
  if (source.filter && typeof source.filter === "object") {
    return source.filter;
  }
  return source;
}

function parseReportDateRange(filter = {}) {
  const from = filter.from;
  const to = filter.to;

  if (from == null || String(from).trim() === "") {
    const err = new Error("filter.from is required for technician monthly bills reports");
    err.status = 400;
    throw err;
  }
  if (to == null || String(to).trim() === "") {
    const err = new Error("filter.to is required for technician monthly bills reports");
    err.status = 400;
    throw err;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime())) {
    const err = new Error("filter.from must be a valid date");
    err.status = 400;
    throw err;
  }
  if (Number.isNaN(toDate.getTime())) {
    const err = new Error("filter.to must be a valid date");
    err.status = 400;
    throw err;
  }
  if (fromDate > toDate) {
    const err = new Error("filter.from must be on or before filter.to");
    err.status = 400;
    throw err;
  }

  return { fromDate, toDate };
}

function assertTechnicianMonthlyBillsDateRange(source = {}) {
  parseReportDateRange(extractReportFilter(source));
}

function formatReportDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatCustomerAddress(job = {}) {
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] : job.jobdetails;
  const customer = job.customers;
  const parts = [
    detail?.address,
    customer?.address,
    job.areas?.name,
    job.cities?.name
  ]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function resolveJobDescription(job = {}) {
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] : job.jobdetails;
  const description = detail?.description ?? job.notes ?? null;
  return description != null && String(description).trim() !== "" ? String(description).trim() : null;
}

function resolveJobCode(job = {}) {
  return job.code ?? job.manualjobno ?? (job.recno != null ? String(job.recno) : null);
}

function resolveInvoiceNumber(job = {}) {
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] : job.jobdetails;
  return jobMainEquipmentFields(detail, job.brandid).invoiceNumber ?? null;
}

function buildTechnicianSnapshot(user = null) {
  if (!user) {
    return {
      technicianId: null,
      technicianName: "Unassigned",
      technicianAffiliation: null,
      technicianAffiliationLabel: null
    };
  }

  const affiliation = user.technicianaffiliation ?? null;
  return {
    technicianId: user.userid ?? null,
    technicianName: user.name ?? `User #${user.userid}`,
    technicianAffiliation: affiliation,
    technicianAffiliationLabel: formatTechnicianAffiliationLabel(affiliation)
  };
}

/**
 * @param {Array<{ technicianId: number, cashCollected?: number, expenses?: number, technician?: object }>} entries
 */
function aggregateSummaryRows(entries = []) {
  const byTech = new Map();

  entries.forEach((entry) => {
    const techId = entry.technicianId ?? -1;
    const existing = byTech.get(techId) || {
      ...buildTechnicianSnapshot(entry.technician),
      cashCollected: 0,
      expenses: 0
    };

    existing.cashCollected = roundMoney(existing.cashCollected + Number(entry.cashCollected || 0));
    existing.expenses = roundMoney(existing.expenses + Number(entry.expenses || 0));
    if (entry.technician && !existing.technicianName) {
      Object.assign(existing, buildTechnicianSnapshot(entry.technician));
    }

    byTech.set(techId, existing);
  });

  return [...byTech.values()].map((row) => ({
    technicianId: row.technicianId,
    technicianName: row.technicianName,
    technicianAffiliation: row.technicianAffiliation,
    technicianAffiliationLabel: row.technicianAffiliationLabel,
    cashCollected: row.cashCollected,
    expenses: row.expenses,
    balance: roundMoney(row.cashCollected - row.expenses)
  }));
}

/**
 * Merge cash collection and expense lines into detail rows keyed by job + technician.
 */
function buildDetailRowsFromActivity({ collections = [], expenses = [], jobsById = new Map(), usersById = new Map() }) {
  const rows = new Map();

  const ensureRow = (jobId, technicianId) => {
    const key = `${jobId}:${technicianId ?? "none"}`;
    if (!rows.has(key)) {
      const job = jobsById.get(jobId) || {};
      const technician = usersById.get(technicianId) || null;
      rows.set(key, {
        jobId,
        jobCode: resolveJobCode(job),
        ...buildTechnicianSnapshot(technician),
        customerName: job.customers?.name ?? null,
        customerAddress: formatCustomerAddress(job),
        customerPhone: job.customers?.contactno ?? null,
        jobDescription: resolveJobDescription(job),
        invoiceNumber: resolveInvoiceNumber(job),
        status: job.jobstatuses?.title ?? null,
        statusColor: job.jobstatuses?.color ?? null,
        activityDate: null,
        cashCollected: 0,
        expenses: 0
      });
    }
    return rows.get(key);
  };

  collections.forEach((collection) => {
    const row = ensureRow(collection.jobid, collection.collectedby);
    row.cashCollected = roundMoney(row.cashCollected + Number(collection.amount || 0));
    const collectedAt = collection.collectedat ? new Date(collection.collectedat) : null;
    if (collectedAt && !Number.isNaN(collectedAt.getTime())) {
      if (!row.activityDate || collectedAt > new Date(row.activityDate)) {
        row.activityDate = collectedAt.toISOString();
      }
    }
  });

  expenses.forEach((expense) => {
    const technicianId = expense.createdby ?? null;
    const row = ensureRow(expense.jobid, technicianId);
    row.expenses = roundMoney(row.expenses + Number(expense.amount || 0));
    const createdAt = expense.createdat ? new Date(expense.createdat) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      if (!row.activityDate || createdAt > new Date(row.activityDate)) {
        row.activityDate = createdAt.toISOString();
      }
    }
  });

  return [...rows.values()]
    .filter((row) => row.cashCollected !== 0 || row.expenses !== 0)
    .map((row) => ({
      ...row,
      activityDate: row.activityDate ? formatReportDate(row.activityDate) : null,
      balance: roundMoney(row.cashCollected - row.expenses)
    }));
}

function sortReportRows(rows, query = {}, sortFieldMap = {}) {
  const sortBy = query.sortBy ? String(query.sortBy) : null;
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  const field = sortBy && sortFieldMap[sortBy] ? sortFieldMap[sortBy] : sortBy;

  if (!field) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];

    if (field === "activityDate") {
      const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
      const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
      if (leftTime < rightTime) return -sortOrder;
      if (leftTime > rightTime) return sortOrder;
      return 0;
    }

    if (typeof leftValue === "number" || typeof rightValue === "number") {
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

function paginateRows(rows, query = {}) {
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

function buildTechnicianMonthlyBillsFilterMeta(baseFilters = []) {
  const extra = [
    {
      field: "from",
      type: "DateTime",
      operators: ["gte"],
      required: true,
      description: "Required. Cash collection / expense activity from (inclusive)."
    },
    {
      field: "to",
      type: "DateTime",
      operators: ["lte"],
      required: true,
      description: "Required. Cash collection / expense activity to (inclusive)."
    },
    {
      field: "technicianAffiliation",
      type: "String",
      operators: ["equals"],
      values: ["in_house", "third_party"],
      description: "Filter technicians by affiliation (In-House / Third-party)."
    },
    {
      field: "technicianId",
      type: "Int",
      operators: ["equals"],
      description: "Filter by technician user id (alias: assignedToId)."
    }
  ];

  const marked = baseFilters.filter(
    (filter) => filter.field !== "from" && filter.field !== "to"
  );

  return [...extra, ...marked];
}

module.exports = {
  TECHNICIAN_MONTHLY_BILLS_SUMMARY_KEY,
  TECHNICIAN_MONTHLY_BILLS_DETAIL_KEY,
  DEFAULT_SUMMARY_COLUMNS,
  DEFAULT_DETAIL_COLUMNS,
  SUMMARY_SORT_FIELD_MAP,
  DETAIL_SORT_FIELD_MAP,
  extractReportFilter,
  assertTechnicianMonthlyBillsDateRange,
  parseReportDateRange,
  aggregateSummaryRows,
  buildDetailRowsFromActivity,
  sortReportRows,
  paginateRows,
  buildTechnicianMonthlyBillsFilterMeta
};
