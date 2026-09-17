const JOB_FORM_TYPES = ["admin", "distributor"];

const NON_HIDEABLE_FIELD_NAMES = new Set([
  "customerPhone",
  "customerName",
  "categoryId",
  "faultId"
]);

/**
 * Default complaint form field registry (Create New Complaint screen).
 * API field names are used as fieldName keys.
 */
const JOB_FORM_FIELD_DEFINITIONS = [
  { fieldName: "customerPhone", label: "Phone Number", section: "customer", sortNo: 1, isMandatory: true, isShow: true, isHideable: false },
  { fieldName: "customerName", label: "Customer Name", section: "customer", sortNo: 2, isMandatory: true, isShow: true, isHideable: false },
  { fieldName: "customerEmail", label: "Email", section: "customer", sortNo: 3, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "country", label: "Country", section: "customer", sortNo: 4, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "city", label: "City", section: "customer", sortNo: 5, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "area", label: "Area", section: "customer", sortNo: 6, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "street", label: "Street", section: "customer", sortNo: 7, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "categoryId", label: "Job Category", section: "customer", sortNo: 8, isMandatory: true, isShow: true, isHideable: false },
  { fieldName: "faultId", label: "Job Sub Category / Fault", section: "customer", sortNo: 9, isMandatory: true, isShow: true, isHideable: false },
  { fieldName: "manualjobno", label: "Manual Job #", section: "customer", sortNo: 10, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "jobTypeId", label: "Job Type", section: "customer", sortNo: 11, isMandatory: true, isShow: true, isHideable: true },
  { fieldName: "jobSourceId", label: "Job Source", section: "customer", sortNo: 12, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "complaintBy", label: "Complaint By", section: "customer", sortNo: 13, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "complaintDescription", label: "Complaint Description", section: "customer", sortNo: 14, isMandatory: false, isShow: true, isHideable: true },

  { fieldName: "date", label: "Date", section: "assignment", sortNo: 16, isMandatory: true, isShow: true, isHideable: true },
  { fieldName: "erpProductId", label: "ERP Product", section: "assignment", sortNo: 17, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "brandId", label: "Brand / Manufacturer", section: "assignment", sortNo: 18, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "productModel", label: "Product Model", section: "assignment", sortNo: 19, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "serialNumber", label: "Serial Number", section: "assignment", sortNo: 20, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "invoiceNumber", label: "Invoice Number", section: "assignment", sortNo: 21, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "isinwaranty", label: "In Warranty", section: "assignment", sortNo: 22, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "purchaseDate", label: "Purchase Date", section: "assignment", sortNo: 23, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "deliveryTypeId", label: "Delivery Type", section: "assignment", sortNo: 24, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "estimatedcompletedtime", label: "Estimated Time (minutes)", section: "assignment", sortNo: 25, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "priority", label: "Priority", section: "assignment", sortNo: 26, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "statusId", label: "Job Status", section: "assignment", sortNo: 27, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "assignedToId", label: "Assigned Technician", section: "assignment", sortNo: 28, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "serviceId", label: "Job Group", section: "assignment", sortNo: 29, isMandatory: false, isShow: true, isHideable: true },

  { fieldName: "serviceLines", label: "Service Detail", section: "lines", sortNo: 30, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "productLines", label: "Parts Detail", section: "lines", sortNo: 31, isMandatory: false, isShow: true, isHideable: true },

  { fieldName: "complaintNotes", label: "Complaint Notes", section: "notes", sortNo: 32, isMandatory: false, isShow: true, isHideable: true },
  { fieldName: "jobNotes", label: "Job Notes", section: "notes", sortNo: 33, isMandatory: false, isShow: true, isHideable: true }
];

/** Distributor form hides the assignment panel and line-item tables until enabled per branch. */
const DISTRIBUTOR_DEFAULT_HIDDEN_SECTIONS = new Set(["assignment", "lines"]);

/** Shown on distributor form even though other assignment fields are hidden by default. */
const DISTRIBUTOR_DEFAULT_VISIBLE_FIELDS = new Set(["erpProductId", "productModel"]);

function applyFormTypeDefaults(field, formType) {
  const base = { ...field, formType };

  if (formType === "admin") {
    return {
      ...base,
      isShow: true
    };
  }

  if (
    formType === "distributor" &&
    DISTRIBUTOR_DEFAULT_HIDDEN_SECTIONS.has(field.section) &&
    !DISTRIBUTOR_DEFAULT_VISIBLE_FIELDS.has(field.fieldName)
  ) {
    return {
      ...base,
      isShow: false,
      isMandatory: false
    };
  }

  return {
    ...base,
    isShow: true
  };
}

function normalizeFormType(value, fallback = "admin") {
  const text = String(value ?? fallback).trim().toLowerCase();
  return JOB_FORM_TYPES.includes(text) ? text : fallback;
}

function getDefaultJobFormFields(formType = "admin") {
  const normalized = normalizeFormType(formType);
  return JOB_FORM_FIELD_DEFINITIONS.map((field) =>
    applyFormTypeDefaults(field, normalized)
  ).sort((left, right) => left.sortNo - right.sortNo);
}

function getDefaultJobFormFieldsByName(formType = "admin") {
  return new Map(getDefaultJobFormFields(formType).map((field) => [field.fieldName, field]));
}

module.exports = {
  JOB_FORM_TYPES,
  NON_HIDEABLE_FIELD_NAMES,
  JOB_FORM_FIELD_DEFINITIONS,
  normalizeFormType,
  getDefaultJobFormFields,
  getDefaultJobFormFieldsByName
};
