const prisma = require("../database/prisma");

function trimOptionalCode(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function parseBooleanFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return defaultValue;
}

/**
 * Normalize product create/update payloads: producttype (inventory|service) and isservice.
 */
function normalizeProductPayload(data = {}) {
  const next = { ...data };

  if (next.enableCPairReceive !== undefined && next.enablecpairreceive === undefined) {
    next.enablecpairreceive = next.enableCPairReceive;
  }
  delete next.enableCPairReceive;

  if (next.enablecpairreceive !== undefined) {
    next.enablecpairreceive = parseBooleanFlag(next.enablecpairreceive, false);
  }

  if (next.hsCode !== undefined && next.hscode === undefined) next.hscode = next.hsCode;
  if (next.HSCode !== undefined && next.hscode === undefined) next.hscode = next.HSCode;
  if (next.erpCode !== undefined && next.erpcode === undefined) next.erpcode = next.erpCode;
  delete next.hsCode;
  delete next.HSCode;
  delete next.erpCode;

  ["hscode", "barcode", "erpcode"].forEach((field) => {
    if (next[field] !== undefined) {
      next[field] = trimOptionalCode(next[field]);
    }
  });

  if (next.unitid !== undefined && next.unitid !== null && next.unitid !== "") {
    const uid = Number(next.unitid);
    next.unitid = Number.isFinite(uid) ? uid : null;
  }

  if (next.brandid !== undefined && next.brandid !== null && next.brandid !== "") {
    const bid = Number(next.brandid);
    next.brandid = Number.isFinite(bid) && bid > 0 ? bid : null;
  }

  let type =
    next.producttype != null && String(next.producttype).trim() !== ""
      ? String(next.producttype).trim().toLowerCase()
      : null;

  if (type === "service" || type === "inventory") {
    next.producttype = type;
    next.isservice = type === "service";
    if (next.managestock === undefined) {
      next.managestock = type === "inventory";
    }
    return next;
  }

  if (next.isservice !== undefined && next.isservice !== null && next.isservice !== "") {
    const isSvc =
      next.isservice === true ||
      next.isservice === 1 ||
      String(next.isservice).toLowerCase() === "true" ||
      String(next.isservice).toLowerCase() === "yes";
    next.isservice = isSvc;
    next.producttype = isSvc ? "service" : "inventory";
  }

  return next;
}

function resolveProductType(product) {
  if (!product) return null;
  if (product.producttype) return String(product.producttype).toLowerCase();
  if (product.isservice === true) return "service";
  if (product.isservice === false) return "inventory";
  return null;
}

async function resolveProductForeignKeys(data = {}, auth) {
  const next = { ...data };
  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  if (tenantid == null || !Number.isFinite(tenantid)) {
    return next;
  }

  if (next.brandid != null) {
    const brand = await prisma.brands.findFirst({
      where: { recno: Number(next.brandid), tenantid }
    });
    if (!brand) {
      const err = new Error(`brandid ${next.brandid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
    next.brandid = brand.recno;
  }

  if (next.taxtypeid != null) {
    const taxType = await prisma.taxtypes.findFirst({
      where: { recno: Number(next.taxtypeid), tenantid }
    });
    if (!taxType) {
      const err = new Error(`taxtypeid ${next.taxtypeid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
    next.taxtypeid = taxType.recno;
  }

  if (next.unitid != null) {
    const unit = await prisma.units.findFirst({
      where: { recno: Number(next.unitid), tenantid }
    });
    if (!unit) {
      const err = new Error(`unitid ${next.unitid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
    next.unitid = unit.recno;
  }

  return next;
}

function productUnitSnapshot(product) {
  if (!product) {
    return {
      unitid: null,
      unitname: null,
      unitsymbol: null,
      brandid: null,
      brandname: null,
      hscode: null,
      barcode: null,
      erpcode: null,
      producttype: null,
      isservice: null
    };
  }
  const producttype = resolveProductType(product);
  return {
    unitid: product.unitid ?? null,
    unitname: product.units?.name ?? null,
    unitsymbol: product.units?.symbol ?? null,
    brandid: product.brandid ?? null,
    brandname: product.brands?.name ?? null,
    hscode: product.hscode ?? null,
    barcode: product.barcode ?? null,
    erpcode: product.erpcode ?? null,
    producttype,
    isservice: product.isservice ?? (producttype === "service")
  };
}

function formatProductTaxInfo(product) {
  if (!product) {
    return null;
  }

  const linkedTax = product.taxtypes ?? null;
  const taxtypeid = product.taxtypeid ?? linkedTax?.recno ?? null;
  const taxtypeName = linkedTax?.name ?? null;
  const taxpercent =
    product.taxpercent ?? linkedTax?.taxpercent ?? null;

  if (taxtypeid == null && taxtypeName == null && taxpercent == null) {
    return null;
  }

  return {
    taxtypeid,
    taxtypeName,
    taxpercent
  };
}

function enrichProductResponse(product) {
  if (!product) {
    return product;
  }

  return {
    ...product,
    enableCPairReceive: product.enablecpairreceive === true
  };
}

function formatProductDropdownRow(product) {
  if (!product) {
    return null;
  }

  const unit = productUnitSnapshot(product);
  const producttype = unit.producttype ?? resolveProductType(product);

  return enrichProductResponse({
    value: product.productid,
    label: product.name || `products #${product.productid}`,
    producttype,
    isservice: product.isservice ?? (producttype === "service"),
    hscode: unit.hscode,
    barcode: unit.barcode,
    erpcode: unit.erpcode,
    salerate: product.salerate ?? null,
    saleRate: product.salerate ?? null,
    purchaserate: product.purchaserate ?? null,
    purchaseRate: product.purchaserate ?? null,
    discountvalue: product.discountvalue ?? null,
    discountValue: product.discountvalue ?? null,
    discounttype: product.discounttype ?? null,
    discountType: product.discounttype ?? null,
    managestock: product.managestock ?? null,
    enablecpairreceive: product.enablecpairreceive ?? false,
    unitid: unit.unitid,
    unitname: unit.unitname,
    unitsymbol: unit.unitsymbol,
    brandid: unit.brandid,
    brandname: unit.brandname,
    tax: formatProductTaxInfo(product)
  });
}

const PRODUCT_DROPDOWN_SELECT = {
  productid: true,
  name: true,
  hscode: true,
  barcode: true,
  erpcode: true,
  producttype: true,
  isservice: true,
  salerate: true,
  purchaserate: true,
  discountvalue: true,
  discounttype: true,
  managestock: true,
  enablecpairreceive: true,
  unitid: true,
  brandid: true,
  taxtypeid: true,
  units: { select: { recno: true, name: true, symbol: true } },
  brands: { select: { recno: true, name: true } },
  taxtypes: { select: { recno: true, name: true, taxpercent: true } }
};

const PRODUCT_WITH_UNIT_INCLUDE = {
  include: {
    units: { select: { recno: true, name: true, symbol: true } },
    brands: { select: { recno: true, name: true } }
  }
};

module.exports = {
  normalizeProductPayload,
  resolveProductForeignKeys,
  resolveProductType,
  productUnitSnapshot,
  formatProductTaxInfo,
  enrichProductResponse,
  formatProductDropdownRow,
  PRODUCT_WITH_UNIT_INCLUDE,
  PRODUCT_DROPDOWN_SELECT
};
