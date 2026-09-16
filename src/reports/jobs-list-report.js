const JOBS_LIST_REPORT_KEY = "jobs_list";

const DEFAULT_JOBS_LIST_REPORT_COLUMNS = [
  {
    columnName: "jobCode",
    columnDescription: "Job Code",
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
    columnName: "manualJobNo",
    columnDescription: "Manual Job No",
    isShow: true,
    sortable: true,
    sortNo: 2,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "jobDate",
    columnDescription: "Job Date",
    isShow: true,
    sortable: true,
    sortNo: 3,
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
    sortNo: 4,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "mobileNumber",
    columnDescription: "Mobile Number",
    isShow: true,
    sortable: false,
    sortNo: 5,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "invoiceNumber",
    columnDescription: "Invoice Number",
    isShow: true,
    sortable: false,
    sortNo: 6,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "invoiceDate",
    columnDescription: "Invoice Date",
    isShow: true,
    sortable: true,
    sortNo: 7,
    minWidth: 130,
    columnFieldType: "date",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "state",
    columnDescription: "State",
    isShow: true,
    sortable: true,
    sortNo: 8,
    minWidth: 120,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "area",
    columnDescription: "Area",
    isShow: true,
    sortable: true,
    sortNo: 9,
    minWidth: 120,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "productModel",
    columnDescription: "Product Model",
    isShow: true,
    sortable: false,
    sortNo: 10,
    minWidth: 140,
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
    sortNo: 11,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "priority",
    columnDescription: "Priority",
    isShow: true,
    sortable: true,
    sortNo: 12,
    minWidth: 110,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  }
];

const JOBS_LIST_REPORT_SORT_FIELD_MAP = {
  jobCode: "code",
  manualJobNo: "manualjobno",
  jobDate: "date",
  customerName: "customerName",
  invoiceDate: "purchaseDate",
  state: "cityName",
  area: "areaName",
  status: "statusName",
  priority: "priority"
};

function formatReportDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function extractJobsListReportFilter(source = {}) {
  if (source.filter && typeof source.filter === "object") {
    return source.filter;
  }
  return source;
}

function assertJobsListReportDateRange(source = {}) {
  const filter = extractJobsListReportFilter(source);
  const from = filter.from;
  const to = filter.to;

  if (from == null || String(from).trim() === "") {
    const err = new Error("filter.from is required for jobs list report");
    err.status = 400;
    throw err;
  }
  if (to == null || String(to).trim() === "") {
    const err = new Error("filter.to is required for jobs list report");
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
}

function markJobsListReportFilterMeta(filters = []) {
  return filters.map((filter) => {
    if (filter.field === "from") {
      return {
        ...filter,
        required: true,
        description: "Required. Job date from (inclusive)."
      };
    }
    if (filter.field === "to") {
      return {
        ...filter,
        required: true,
        description: "Required. Job date to (inclusive)."
      };
    }
    return filter;
  });
}

function mapSlimJobToReportRow(row) {
  if (!row) return null;

  return {
    jobId: row.recno,
    jobCode: row.code ?? null,
    manualJobNo: row.manualjobno ?? null,
    jobDate: formatReportDate(row.date),
    customerName: row.customerName ?? null,
    mobileNumber: row.phoneNo ?? row.contactno ?? null,
    invoiceNumber: row.invoiceNumber ?? null,
    invoiceDate: formatReportDate(row.purchaseDate),
    state: row.cityName ?? row.countryName ?? null,
    area: row.areaName ?? null,
    productModel: row.productModel ?? null,
    status: row.statusName ?? null,
    statusColor: row.statusColor ?? null,
    priority: row.priority ?? null
  };
}

module.exports = {
  JOBS_LIST_REPORT_KEY,
  DEFAULT_JOBS_LIST_REPORT_COLUMNS,
  JOBS_LIST_REPORT_SORT_FIELD_MAP,
  extractJobsListReportFilter,
  assertJobsListReportDateRange,
  markJobsListReportFilterMeta,
  mapSlimJobToReportRow
};
