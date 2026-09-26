const { getAvailableOverviewFilters } = require("../utils/job-cpair-list");

function formatReportDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

const CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY = "cpair_received_not_issued";

const DEFAULT_CPAIR_RECEIVED_NOT_ISSUED_COLUMNS = [
  {
    columnName: "jobNo",
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
    columnName: "manualJobNo",
    columnDescription: "Manual Job No",
    isShow: true,
    sortable: false,
    sortNo: 2,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "partName",
    columnDescription: "Part Name",
    isShow: true,
    sortable: true,
    sortNo: 3,
    minWidth: 180,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "qtyPendingIssue",
    columnDescription: "Qty Pending Issue",
    isShow: true,
    sortable: true,
    sortNo: 4,
    minWidth: 140,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "lineQtyReceived",
    columnDescription: "Qty Received",
    isShow: true,
    sortable: true,
    sortNo: 5,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "lineIssueQty",
    columnDescription: "Qty Issued",
    isShow: true,
    sortable: true,
    sortNo: 6,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "qty",
    columnDescription: "C-pair Qty Expected",
    isShow: true,
    sortable: true,
    sortNo: 7,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "installedQty",
    columnDescription: "Installed Qty",
    isShow: true,
    sortable: true,
    sortNo: 8,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "wastageQty",
    columnDescription: "Wastage Qty",
    isShow: true,
    sortable: true,
    sortNo: 9,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "lineWastageReceived",
    columnDescription: "Wastage Received",
    isShow: true,
    sortable: true,
    sortNo: 10,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "receiveStatus",
    columnDescription: "Line Receive Status",
    isShow: true,
    sortable: true,
    sortNo: 11,
    minWidth: 150,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "issueStatus",
    columnDescription: "Line Issue Status",
    isShow: true,
    sortable: true,
    sortNo: 12,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "customerName",
    columnDescription: "Customer Name",
    isShow: true,
    sortable: true,
    sortNo: 13,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "technicianName",
    columnDescription: "Technician",
    isShow: true,
    sortable: true,
    sortNo: 14,
    minWidth: 150,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "faultName",
    columnDescription: "Fault",
    isShow: true,
    sortable: false,
    sortNo: 15,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "summaryReceiveStatus",
    columnDescription: "Summary Receive Status",
    isShow: true,
    sortable: true,
    sortNo: 16,
    minWidth: 170,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "summaryIssueStatus",
    columnDescription: "Summary Issue Status",
    isShow: true,
    sortable: true,
    sortNo: 17,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "partId",
    columnDescription: "Part Line Id",
    isShow: false,
    sortable: true,
    sortNo: 18,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "summaryId",
    columnDescription: "Summary Id",
    isShow: false,
    sortable: true,
    sortNo: 19,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "jobId",
    columnDescription: "Job Id",
    isShow: false,
    sortable: true,
    sortNo: 20,
    minWidth: 100,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "jobProductId",
    columnDescription: "Job Product Line Id",
    isShow: false,
    sortable: true,
    sortNo: 21,
    minWidth: 140,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "productId",
    columnDescription: "Product Id",
    isShow: false,
    sortable: true,
    sortNo: 22,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "customerId",
    columnDescription: "Customer Id",
    isShow: false,
    sortable: true,
    sortNo: 23,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "technicianId",
    columnDescription: "Technician Id",
    isShow: false,
    sortable: true,
    sortNo: 24,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "faultId",
    columnDescription: "Fault Id",
    isShow: false,
    sortable: true,
    sortNo: 25,
    minWidth: 100,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "createdAt",
    columnDescription: "Part Created At",
    isShow: true,
    sortable: true,
    sortNo: 26,
    minWidth: 150,
    columnFieldType: "date",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "remarks",
    columnDescription: "Remarks",
    isShow: false,
    sortable: false,
    sortNo: 27,
    minWidth: 180,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  }
];

const CPAIR_RECEIVED_NOT_ISSUED_SORT_FIELD_MAP = {
  jobNo: "jobNo",
  partName: "partName",
  qtyPendingIssue: "qtyPendingIssue",
  lineQtyReceived: "lineQtyReceived",
  lineIssueQty: "lineIssueQty",
  qty: "qty",
  customerName: "customerName",
  technicianName: "technicianName",
  receiveStatus: "receiveStatus",
  issueStatus: "issueStatus",
  summaryReceiveStatus: "summaryReceiveStatus",
  summaryIssueStatus: "summaryIssueStatus",
  createdAt: "createdAt",
  jobId: "jobId"
};

function isReceivedNotFullyIssuedRow(row = {}) {
  const received = Number(row.lineQtyReceived) || 0;
  const issued = Number(row.lineIssueQty) || 0;
  return received > 0 && issued < received;
}

function mapOverviewToReportRow(overviewRow = {}) {
  const lineQtyReceived = Number(overviewRow.lineQtyReceived) || 0;
  const lineIssueQty = Number(overviewRow.lineIssueQty) || 0;

  return {
    partId: overviewRow.partId ?? null,
    summaryId: overviewRow.summaryId ?? null,
    jobId: overviewRow.jobId ?? null,
    jobNo: overviewRow.jobNo ?? null,
    manualJobNo: overviewRow.manualJobNo ?? null,
    jobProductId: overviewRow.jobProductId ?? null,
    productId: overviewRow.productId ?? null,
    partName: overviewRow.partName ?? null,
    customerId: overviewRow.customerId ?? null,
    customerName: overviewRow.customerName ?? null,
    technicianId: overviewRow.technicianId ?? null,
    technicianName: overviewRow.technicianName ?? null,
    faultId: overviewRow.faultId ?? null,
    faultName: overviewRow.faultName ?? null,
    qty: overviewRow.qty ?? 0,
    installedQty: overviewRow.installedQty ?? 0,
    wastageQty: overviewRow.wastageQty ?? 0,
    lineQtyReceived,
    lineWastageReceived: overviewRow.lineWastageReceived ?? 0,
    lineIssueQty,
    qtyPendingIssue: Math.max(lineQtyReceived - lineIssueQty, 0),
    receiveStatus: overviewRow.receiveStatus ?? null,
    issueStatus: overviewRow.issueStatus ?? null,
    summaryReceiveStatus: overviewRow.summaryReceiveStatus ?? null,
    summaryIssueStatus: overviewRow.summaryIssueStatus ?? null,
    remarks: overviewRow.remarks ?? null,
    createdAt: formatReportDate(overviewRow.createdAt)
  };
}

function buildReportFilterMeta() {
  return getAvailableOverviewFilters().map((filter) => {
    if (filter.field === "lineIssueStatus") {
      return {
        ...filter,
        description:
          "Optional extra filter; report already includes received lines not fully issued."
      };
    }
    return filter;
  });
}

module.exports = {
  CPAIR_RECEIVED_NOT_ISSUED_REPORT_KEY,
  DEFAULT_CPAIR_RECEIVED_NOT_ISSUED_COLUMNS,
  CPAIR_RECEIVED_NOT_ISSUED_SORT_FIELD_MAP,
  isReceivedNotFullyIssuedRow,
  mapOverviewToReportRow,
  buildReportFilterMeta
};
