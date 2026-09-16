const {
  suggestColumnMapping: suggestFromColumns
} = require("../utils/bulk-upload-column-config");

const JOB_SUBCATEGORY_BULK_COLUMNS = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "category", label: "Category", required: true, type: "lookup", resolves: "categoryid" },
  {
    key: "group",
    label: "Group",
    required: false,
    type: "lookup",
    resolves: "groupid",
    hint: "Required when Category does not exist and will be created on import"
  },
  { key: "color", label: "Color", required: false, type: "string", hint: "Optional (max 15 chars)" },
  { key: "isactive", label: "Is Active", required: false, type: "boolean" },
  {
    key: "createdat",
    label: "Created Date",
    required: false,
    type: "date",
    hint: "Optional; uses dateFormat from mapping step"
  }
];

const JOB_SUBCATEGORY_BULK_TEMPLATE_ROW = [
  "Sample Subcategory",
  "Sample Category",
  "Sample Group",
  "#336699",
  "yes",
  "2026-01-15"
];

const HEADER_ALIASES = {
  name: ["name", "subcategoryname", "subcategory", "faultname", "title"],
  category: ["category", "categoryname", "parentcategory", "service"],
  group: ["group", "groupname", "jobgroup", "jobgroupname"],
  color: ["color", "colour"],
  isactive: ["isactive", "active", "status"],
  createdat: ["createddate", "createdat", "datecreated"]
};

function getRequiredColumns() {
  return JOB_SUBCATEGORY_BULK_COLUMNS.filter((col) => col.required).map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: true,
    hint: col.hint ?? null
  }));
}

function getAllTargetColumns() {
  return JOB_SUBCATEGORY_BULK_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type,
    required: col.required === true,
    hint: col.hint ?? null,
    values: col.values ?? null
  }));
}

function suggestColumnMapping(availableColumns = []) {
  return suggestFromColumns(JOB_SUBCATEGORY_BULK_COLUMNS, HEADER_ALIASES, availableColumns);
}

module.exports = {
  JOB_SUBCATEGORY_BULK_COLUMNS,
  JOB_SUBCATEGORY_BULK_TEMPLATE_ROW,
  getAllTargetColumns,
  getRequiredColumns,
  suggestColumnMapping
};
