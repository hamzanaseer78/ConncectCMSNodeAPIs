const { pickProductLines, isProductLinePresent } = require("./job-product-lines");
const { pickServiceLines, isServiceLinePresent } = require("./job-service-lines");

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasNumber(value) {
  if (value === undefined || value === null || value === "") return false;
  return Number.isFinite(Number(value));
}

function readJobFormFieldValue(data = {}, fieldName) {
  switch (fieldName) {
    case "customerPhone":
      return data.customer?.contactno ?? data.customer?.phone ?? data.customerPhone ?? null;
    case "customerName":
      return data.customer?.name ?? data.customerName ?? null;
    case "customerEmail":
      return data.customer?.email ?? data.customerEmail ?? null;
    case "country":
      return data.customer?.country ?? data.country ?? null;
    case "city":
      return data.customer?.city ?? data.city ?? null;
    case "area":
      return data.customer?.area ?? data.area ?? null;
    case "street":
      return data.customer?.address ?? data.address ?? data.customerAddress ?? data.siteAddress ?? data.street ?? null;
    case "categoryId":
      return data.categoryId ?? data.serviceid ?? null;
    case "serviceId":
      return data.serviceId ?? data.groupid ?? null;
    case "faultId":
      return data.faultId ?? data.faultid ?? null;
    case "complaintDescription":
      return data.complaintDescription ?? data.description ?? null;
    case "complaintNotes":
      return data.complaintNotes ?? data.notes ?? null;
    case "deliveryTypeId":
      return data.deliveryTypeId ?? data.deliverytype ?? null;
    case "statusId":
      return data.statusId ?? data.statusid ?? null;
    case "assignedToId":
      return data.assignedToId ?? data.assignedto ?? null;
    case "erpProductId":
      return data.erpProductId ?? data.erpproductid ?? null;
    case "brandId":
      return data.brandId ?? data.brandid ?? null;
    case "jobTypeId":
      return data.jobTypeId ?? data.jobtypeid ?? null;
    case "jobSourceId":
      return data.jobSourceId ?? data.jobsourceid ?? null;
    case "serviceLines":
      return pickServiceLines(data).filter(isServiceLinePresent);
    case "productLines":
      return pickProductLines(data).filter(isProductLinePresent);
    default:
      return data[fieldName] ?? null;
  }
}

function isJobFormFieldEmpty(data, fieldName) {
  const value = readJobFormFieldValue(data, fieldName);

  if (fieldName === "serviceLines" || fieldName === "productLines") {
    return !Array.isArray(value) || value.length === 0;
  }

  if (fieldName === "isinwaranty") {
    return value === undefined || value === null;
  }

  if (
    [
      "categoryId",
      "serviceId",
      "faultId",
      "faultComplaint",
      "country",
      "city",
      "area",
      "deliveryTypeId",
      "statusId",
      "assignedToId",
      "erpProductId",
      "brandId",
      "jobTypeId",
      "jobSourceId"
    ].includes(fieldName)
  ) {
    return !hasNumber(value);
  }

  return !hasText(value);
}

function validateJobAgainstFormSettings(data = {}, fields = []) {
  const issues = [];
  const visibleFields = fields.filter((field) => field.isShow !== false);

  visibleFields.forEach((field) => {
    if (field.isMandatory !== true) return;
    if (isJobFormFieldEmpty(data, field.fieldName)) {
      issues.push(`${field.label || field.fieldName} is required`);
    }
  });

  if (issues.length) {
    const err = new Error(issues[0]);
    err.status = 400;
    err.issues = issues;
    throw err;
  }
}

function buildVisibleFieldMap(fields = []) {
  return new Map(
    fields
      .filter((field) => field.isShow !== false)
      .map((field) => [field.fieldName, field])
  );
}

module.exports = {
  readJobFormFieldValue,
  isJobFormFieldEmpty,
  validateJobAgainstFormSettings,
  buildVisibleFieldMap
};
