/**
 * Canonical columns for product bulk upload (Excel template + column mapping).
 * `key` is the system field; `label` is the template header.
 */
const PRODUCT_BULK_COLUMNS = [
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
  { key: "managestock", label: "Manage Stock", required: false, type: "boolean" },
  {
    key: "enablecpairreceive",
    label: "Enable C-Pair Receive",
    required: false,
    type: "boolean",
    hint: "Allow this product in C-pair receive workflow"
  },
  { key: "isactive", label: "Is Active", required: false, type: "boolean" },
  { key: "unit", label: "Unit", required: false, type: "lookup", resolves: "unitid" },
  { key: "brand", label: "Brand", required: false, type: "lookup", resolves: "brandid" },
  {
    key: "createdat",
    label: "Created Date",
    required: false,
    type: "date",
    hint: "Optional; uses dateFormat from mapping step"
  }
];

const PRODUCT_BULK_TEMPLATE_ROW = [
  "Sample Product",
  "12345678",
  "8901234567890",
  "ERP-001",
  100,
  80,
  10,
  "%",
  "Part",
  "yes",
  "no",
  "yes",
  "Piece",
  "Sample Brand",
  "2026-01-15"
];

const PRODUCT_BULK_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const EXCEL_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = {
  name: ["name", "productname", "product", "title", "itemname"],
  hscode: ["hscode", "hs", "tariffcode"],
  barcode: ["barcode", "barcodeno", "upc", "ean"],
  erpcode: ["erpcode", "erp", "sku", "itemcode", "productcode"],
  salerate: ["salerate", "saleprice", "sellingprice", "price", "rate"],
  purchaserate: ["purchaserate", "purchaseprice", "cost", "costprice"],
  discountvalue: ["discountvalue", "discount", "discountamount"],
  discounttype: ["discounttype", "discountmode"],
  producttype: ["producttype", "type", "itemtype", "part", "service"],
  managestock: ["managestock", "stockmanagement", "trackstock"],
  enablecpairreceive: [
    "enablecpairreceive",
    "enablecpair",
    "cpairreceive",
    "enablecpairrcv"
  ],
  isactive: ["isactive", "active", "status"],
  unit: ["unit", "unitname", "uom", "measurementunit"],
  brand: ["brand", "brandname", "manufacturer"],
  createdat: ["createddate", "createdat", "datecreated", "creationdate"]
};

function getRequiredColumns() {
  return PRODUCT_BULK_COLUMNS.filter((col) => col.required).map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: true,
    hint: col.hint ?? null
  }));
}

function getAllTargetColumns() {
  return PRODUCT_BULK_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: col.required === true,
    hint: col.hint ?? null,
    values: col.values ?? null
  }));
}

function suggestColumnMapping(availableColumns = []) {
  const mapping = {};
  const used = new Set();

  availableColumns.forEach((header) => {
    const norm = normalizeHeader(header);
    if (!norm) return;

    for (const col of PRODUCT_BULK_COLUMNS) {
      if (mapping[col.key]) continue;
      const aliases = HEADER_ALIASES[col.key] || [normalizeHeader(col.label), col.key];
      if (aliases.includes(norm)) {
        mapping[col.key] = header;
        used.add(header);
        break;
      }
    }
  });

  return mapping;
}

module.exports = {
  PRODUCT_BULK_COLUMNS,
  PRODUCT_BULK_TEMPLATE_ROW,
  PRODUCT_BULK_SESSION_TTL_MS,
  EXCEL_EXTENSIONS,
  PDF_EXTENSIONS,
  getAllTargetColumns,
  getRequiredColumns,
  normalizeHeader,
  suggestColumnMapping
};
