const { PRODUCT_WITH_UNIT_INCLUDE } = require("./product-payload");
const {
  mapProductLineToForm,
  mapJobProductLines,
  productLineLabel,
  isProductLinePresent,
  stripLineScopeFields
} = require("./job-product-lines");

function buildJobServiceLineInclude() {
  return {
    orderBy: { lineno: "asc" },
    include: {
      products: PRODUCT_WITH_UNIT_INCLUDE,
      taxtypes: { select: { recno: true, name: true, taxpercent: true } }
    }
  };
}

/** Service lines reference products/taxtypes only (no erpproducts on jobservices). */
const JOB_SERVICE_LINE_INCLUDE = buildJobServiceLineInclude();

function mapServiceLineToForm(item) {
  return mapProductLineToForm(item);
}

function mapJobServiceLines(lines = []) {
  return mapJobProductLines(lines);
}

function pickServiceLines(data = {}) {
  return Array.isArray(data.serviceLines) ? data.serviceLines : [];
}

function serviceLineLabel(line) {
  return productLineLabel(line);
}

function isServiceLinePresent(line) {
  return isProductLinePresent(line);
}

function stripServiceLineScopeFields(row) {
  return stripLineScopeFields(row);
}

module.exports = {
  buildJobServiceLineInclude,
  JOB_SERVICE_LINE_INCLUDE,
  mapServiceLineToForm,
  mapJobServiceLines,
  pickServiceLines,
  serviceLineLabel,
  isServiceLinePresent,
  stripServiceLineScopeFields
};
