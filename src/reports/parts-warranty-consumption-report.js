const { buildJobHierarchyFields } = require("../utils/job-response-labels");
const { jobMainEquipmentFields } = require("../utils/job-equipment");

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

const PARTS_WARRANTY_CONSUMPTION_REPORT_KEY = "parts_warranty_consumption";

const DEFAULT_PARTS_WARRANTY_CONSUMPTION_COLUMNS = [
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
    columnName: "productName",
    columnDescription: "Part / Product",
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
    columnName: "qty",
    columnDescription: "Qty Used",
    isShow: true,
    sortable: true,
    sortNo: 4,
    minWidth: 100,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "modelNo",
    columnDescription: "Model No",
    isShow: true,
    sortable: true,
    sortNo: 5,
    minWidth: 120,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "partNo",
    columnDescription: "Part / Serial No",
    isShow: true,
    sortable: true,
    sortNo: 6,
    minWidth: 130,
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
    sortNo: 7,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "assignedToName",
    columnDescription: "Technician",
    isShow: true,
    sortable: true,
    sortNo: 8,
    minWidth: 150,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "inWarranty",
    columnDescription: "In Warranty",
    isShow: true,
    sortable: false,
    sortNo: 9,
    minWidth: 110,
    columnFieldType: "boolean",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  },
  {
    columnName: "price",
    columnDescription: "Unit Price",
    isShow: true,
    sortable: true,
    sortNo: 10,
    minWidth: 110,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "inclusiveAmount",
    columnDescription: "Line Amount",
    isShow: true,
    sortable: true,
    sortNo: 11,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "status",
    columnDescription: "Job Status",
    isShow: true,
    sortable: true,
    sortNo: 12,
    minWidth: 130,
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
    sortable: true,
    sortNo: 13,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "categoryName",
    columnDescription: "Job Category",
    isShow: true,
    sortable: true,
    sortNo: 14,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "serviceName",
    columnDescription: "Job Group",
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
    columnName: "productModel",
    columnDescription: "Equipment Model",
    isShow: true,
    sortable: false,
    sortNo: 16,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "serialNumber",
    columnDescription: "Equipment Serial",
    isShow: true,
    sortable: false,
    sortNo: 17,
    minWidth: 140,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "manualJobNo",
    columnDescription: "Manual Job No",
    isShow: false,
    sortable: true,
    sortNo: 18,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "jobProductLineId",
    columnDescription: "Job Product Line Id",
    isShow: false,
    sortable: true,
    sortNo: 19,
    minWidth: 140,
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
    columnName: "productId",
    columnDescription: "Catalog Product Id",
    isShow: false,
    sortable: true,
    sortNo: 21,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "barcode",
    columnDescription: "Product Barcode",
    isShow: false,
    sortable: false,
    sortNo: 22,
    minWidth: 130,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  },
  {
    columnName: "lineNo",
    columnDescription: "Line No",
    isShow: false,
    sortable: true,
    sortNo: 23,
    minWidth: 90,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: false
  },
  {
    columnName: "remarks",
    columnDescription: "Line Remarks",
    isShow: false,
    sortable: false,
    sortNo: 24,
    minWidth: 160,
    columnFieldType: "string",
    clickable: false,
    isRigtAligned: false,
    color: "",
    isMandatory: false
  }
];

const PARTS_WARRANTY_CONSUMPTION_SORT_FIELD_MAP = {
  jobCode: "jobCode",
  manualJobNo: "manualJobNo",
  jobDate: "jobDate",
  productName: "productName",
  qty: "qty",
  modelNo: "modelNo",
  partNo: "partNo",
  customerName: "customerName",
  assignedToName: "assignedToName",
  price: "price",
  inclusiveAmount: "inclusiveAmount",
  status: "status",
  faultName: "faultName",
  categoryName: "categoryName",
  lineNo: "lineNo"
};

function mapJobProductLineToReportRow(line) {
  if (!line) return null;

  const job = line.job;
  if (!job || job.isinwaranty !== true) return null;

  const qty = Number(line.qty) || 0;
  if (qty <= 0) return null;
  if (line.isserviceitem === true) return null;

  const hierarchy = buildJobHierarchyFields(job);
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] : job.jobdetails;
  const equipment = jobMainEquipmentFields(detail, job.brandid);

  const productName =
    line.products?.name ??
    line.modelno ??
    line.partno ??
    line.remarks ??
    (line.productid != null ? `Product #${line.productid}` : "Part");

  return {
    jobProductLineId: line.recno,
    jobId: job.recno,
    jobCode: job.code ?? null,
    manualJobNo: job.manualjobno ?? null,
    jobDate: formatReportDate(job.date),
    productId: line.productid ?? null,
    productName,
    barcode: line.products?.barcode ?? null,
    modelNo: line.modelno ?? null,
    partNo: line.partno ?? null,
    saleReferenceNo: line.salerefrenceno ?? null,
    lineNo: line.lineno ?? null,
    qty: roundMoney(qty),
    price: roundMoney(line.price ?? 0),
    totalAmount: roundMoney(line.totalamount ?? 0),
    inclusiveAmount: roundMoney(line.inclusiveamount ?? line.totalamount ?? 0),
    taxAmount: roundMoney(line.taxamount ?? 0),
    customerId: job.customerid ?? job.customers?.customerid ?? null,
    customerName: job.customers?.name ?? null,
    customerPhone: job.customers?.contactno ?? null,
    assignedToId: job.assignedto ?? job.users?.userid ?? null,
    assignedToName: job.users?.name ?? null,
    inWarranty: true,
    status: job.jobstatuses?.title ?? null,
    statusColor: job.jobstatuses?.color ?? null,
    ...hierarchy,
    productModel: equipment.productModel ?? null,
    serialNumber: equipment.serialNumber ?? null,
    invoiceNumber: equipment.invoiceNumber ?? null,
    remarks: line.remarks ?? null
  };
}

function buildReportFilterMeta() {
  const { getAvailableJobFilters } = require("../services/jobs-list.service");
  const base = getAvailableJobFilters().filter(
    (filter) => filter.field !== "isInWarranty" && filter.field !== "isinwaranty"
  );

  return [
    {
      field: "inWarranty",
      type: "Boolean",
      operators: ["equals"],
      values: ["true"],
      description: "Fixed to warranty jobs only (job.isinwaranty = true)."
    },
    ...base
  ];
}

module.exports = {
  PARTS_WARRANTY_CONSUMPTION_REPORT_KEY,
  DEFAULT_PARTS_WARRANTY_CONSUMPTION_COLUMNS,
  PARTS_WARRANTY_CONSUMPTION_SORT_FIELD_MAP,
  mapJobProductLineToReportRow,
  buildReportFilterMeta
};
