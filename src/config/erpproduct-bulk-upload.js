const { suggestColumnMapping: suggestFromColumns } = require("../utils/bulk-upload-column-config");

/**
 * Canonical columns for ERP product bulk upload (Excel template + column mapping).
 */
const ERP_PRODUCT_BULK_COLUMNS = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "hscode", label: "HS Code", required: false, type: "string" },
  { key: "barcode", label: "Barcode", required: false, type: "string" },
  { key: "erpcode", label: "ERP Code", required: false, type: "string" },
  { key: "salerate", label: "Sale Rate", required: false, type: "number" },
  { key: "purchaserate", label: "Purchase Rate", required: false, type: "number" },
  { key: "discountvalue", label: "Discount Value", required: false, type: "number" },
  {
    key: "discounttype",
    label: "Discount Type",
    required: false,
    type: "enum",
    values: ["%", "@"],
    hint: "% = percent, @ = fixed amount"
  },
  {
    key: "producttype",
    label: "Product Type",
    required: false,
    type: "enum",
    values: ["Part", "Service"],
    hint: "Part or Service"
  },
  {
    key: "enablecpairreceive",
    label: "Enable C-Pair Receive",
    required: false,
    type: "boolean",
    hint: "Allow this ERP product in C-pair receive workflow"
  },
  { key: "isactive", label: "Is Active", required: false, type: "boolean" },
  { key: "unit", label: "Unit", required: false, type: "lookup", resolves: "unitid" },
  { key: "brand", label: "Brand", required: false, type: "lookup", resolves: "brandid" },
  {
    key: "jobgroup",
    label: "Job Group",
    required: false,
    type: "lookup",
    resolves: "groupid",
    hint: "Job group name or id"
  },
  {
    key: "jobcategory",
    label: "Job Category",
    required: false,
    type: "lookup",
    resolves: "serviceid",
    hint: "Job category name or id"
  },
  {
    key: "createdat",
    label: "Created Date",
    required: false,
    type: "date",
    hint: "Optional; uses dateFormat from mapping step"
  }
];

const ERP_PRODUCT_BULK_TEMPLATE_ROW = [
  "Sample ERP Product",
  "12345678",
  "8901234567890",
  "ERP-001",
  100,
  80,
  10,
  "%",
  "Part",
  "no",
  "yes",
  "Piece",
  "Sample Brand",
  "Sample Job Group",
  "Sample Job Category",
  "2026-01-15"
];

const HEADER_ALIASES = {
  name: ["name", "productname", "product", "title", "itemname"],
  hscode: ["hscode", "hs", "tariffcode"],
  barcode: ["barcode", "barcodeno", "upc", "ean", "sku"],
  erpcode: ["erpcode", "erp", "itemcode", "productcode", "olderpcode"],
  salerate: ["salerate", "saleprice", "sellingprice", "price", "rate"],
  purchaserate: ["purchaserate", "purchaseprice", "cost", "costprice"],
  discountvalue: ["discountvalue", "discount", "discountamount"],
  discounttype: ["discounttype", "discountmode"],
  producttype: ["producttype", "type", "itemtype", "part", "service"],
  enablecpairreceive: [
    "enablecpairreceive",
    "enablecpair",
    "cpairreceive",
    "enablecpairrcv"
  ],
  isactive: ["isactive", "active", "status"],
  unit: ["unit", "unitname", "uom", "measurementunit"],
  brand: ["brand", "brandname", "manufacturer"],
  jobgroup: ["jobgroup", "group", "groupname", "jobgroupname"],
  jobcategory: ["jobcategory", "category", "categoryname", "jobcategoryname", "service"],
  createdat: ["createddate", "createdat", "datecreated", "creationdate"]
};

function getRequiredColumns() {
  return ERP_PRODUCT_BULK_COLUMNS.filter((col) => col.required).map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: true,
    hint: col.hint ?? null
  }));
}

function getAllTargetColumns() {
  return ERP_PRODUCT_BULK_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: col.required === true,
    hint: col.hint ?? null,
    values: col.values ?? null
  }));
}

function suggestColumnMapping(availableColumns = []) {
  return suggestFromColumns(ERP_PRODUCT_BULK_COLUMNS, HEADER_ALIASES, availableColumns);
}

module.exports = {
  ERP_PRODUCT_BULK_COLUMNS,
  ERP_PRODUCT_BULK_TEMPLATE_ROW,
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
};
