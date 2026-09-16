const { productUnitSnapshot, PRODUCT_WITH_UNIT_INCLUDE } = require("./product-payload");

function buildJobProductLineInclude() {
  return {
    orderBy: { lineno: "asc" },
    include: {
      products: PRODUCT_WITH_UNIT_INCLUDE,
      taxtypes: { select: { recno: true, name: true, taxpercent: true } }
    }
  };
}

const JOB_PRODUCT_LINE_INCLUDE = buildJobProductLineInclude();

/**
 * Flat job product line for API responses (no nested products/taxtypes objects).
 */
function mapProductLineToForm(item) {
  if (!item) return null;

  const catalog = item.products;
  const tax = item.taxtypes;
  const unit = catalog ? productUnitSnapshot(catalog) : {};
  const {
    isservice: _catalogIsservice,
    brandid: _brandid,
    brandname: _brandname,
    ...unitFields
  } = unit;

  const producttype =
    unit.producttype ??
    (item.isserviceitem === true ? "service" : item.isserviceitem === false ? "inventory" : null);

  return {
    recno: item.recno ?? null,
    productid: item.productid ?? null,
    productname: catalog?.name ?? null,
    modelno: item.modelno ?? null,
    partno: item.partno ?? null,
    salerefrenceno: item.salerefrenceno ?? null,
    lineno: item.lineno ?? null,
    remarks: item.remarks ?? null,
    qty: item.qty ?? 0,
    price: item.price ?? 0,
    rate: item.price ?? 0,
    totalamount: item.totalamount ?? null,
    discounttype: item.discounttype ?? null,
    discountvalue: item.discountvalue ?? null,
    discountamount: item.discountamount ?? null,
    exclusiveamount: item.exclusiveamount ?? null,
    taxtypeid: item.taxtypeid ?? null,
    taxtypeName: tax?.name ?? null,
    taxpercent: item.taxpercent ?? tax?.taxpercent ?? null,
    taxamount: item.taxamount ?? null,
    tax: item.taxamount ?? null,
    inclusiveamount: item.inclusiveamount ?? null,
    amount: item.inclusiveamount ?? null,
    isserviceitem: item.isserviceitem === true,
    producttype,
    brandId: unit.brandid ?? null,
    ...unitFields
  };
}

function mapJobProductLines(lines = []) {
  return (lines || []).map(mapProductLineToForm).filter(Boolean);
}

function pickProductLines(data = {}) {
  return Array.isArray(data.productLines) ? data.productLines : [];
}

function productLineLabel(line) {
  return line.remarks || line.partService || line.label || line.name || line.serviceName || line.title || null;
}

function isProductLinePresent(line) {
  if (!line || typeof line !== "object") return false;
  const qty = Number(line.qty ?? 0);
  const price = Number(line.price ?? line.rate ?? 0);
  const productid =
    line.productid != null && line.productid !== "" ? Number(line.productid) : null;
  return Boolean(
    (productid != null && Number.isFinite(productid)) ||
      productLineLabel(line) ||
      (line.modelno && String(line.modelno).trim()) ||
      (line.partno && String(line.partno).trim()) ||
      qty ||
      price
  );
}

function stripLineScopeFields(row) {
  const { jobid, tenantid, branchid, ...rest } = row;
  return rest;
}

module.exports = {
  buildJobProductLineInclude,
  JOB_PRODUCT_LINE_INCLUDE,
  mapProductLineToForm,
  mapJobProductLines,
  pickProductLines,
  productLineLabel,
  isProductLinePresent,
  stripLineScopeFields
};
