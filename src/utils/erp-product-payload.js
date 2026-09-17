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

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EXCLUDED_ERP_PRODUCT_FIELDS = [
  "managestock",
  "manageStock",
  "isservice",
  "isService",
  "taxtypeid",
  "taxTypeId"
];

function normalizeErpProductPayload(data = {}) {
  const next = { ...data };

  EXCLUDED_ERP_PRODUCT_FIELDS.forEach((field) => {
    delete next[field];
  });

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

  if (next.groupId !== undefined && next.groupid === undefined) next.groupid = next.groupId;
  if (next.jobGroupId !== undefined && next.groupid === undefined) next.groupid = next.jobGroupId;
  delete next.groupId;
  delete next.jobGroupId;

  if (next.categoryId !== undefined && next.serviceid === undefined) next.serviceid = next.categoryId;
  if (next.jobCategoryId !== undefined && next.serviceid === undefined) next.serviceid = next.jobCategoryId;
  if (next.serviceId !== undefined && next.serviceid === undefined) next.serviceid = next.serviceId;
  delete next.categoryId;
  delete next.jobCategoryId;
  delete next.serviceId;

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

  if (next.groupid !== undefined) {
    next.groupid = parseOptionalInt(next.groupid);
  }

  if (next.serviceid !== undefined) {
    next.serviceid = parseOptionalInt(next.serviceid);
  }

  if (next.producttype != null && String(next.producttype).trim() !== "") {
    const type = String(next.producttype).trim().toLowerCase();
    if (type === "service" || type === "inventory") {
      next.producttype = type;
    }
  }

  return next;
}

function resolveErpProductType(product) {
  if (!product) return null;
  if (product.producttype) return String(product.producttype).toLowerCase();
  return null;
}

function erpProductGroupCategoryLabels(product = {}) {
  const groupid = product.groupid ?? product.jobgroups?.groupid ?? null;
  const serviceid = product.serviceid ?? product.jobcategories?.categoryid ?? null;
  const groupname = product.groupname ?? product.jobgroups?.name ?? null;
  const categoryname = product.categoryname ?? product.jobcategories?.name ?? null;

  return {
    groupid,
    serviceid,
    groupname,
    categoryname,
    groupId: groupid,
    categoryId: serviceid,
    groupName: groupname,
    categoryName: categoryname,
    jobGroupName: groupname,
    jobCategoryName: categoryname
  };
}

async function resolveErpProductForeignKeys(data = {}, auth) {
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

  if (next.groupid != null) {
    const group = await prisma.jobgroups.findFirst({
      where: { groupid: Number(next.groupid), tenantid }
    });
    if (!group) {
      const err = new Error(`groupid ${next.groupid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
    next.groupid = group.groupid;
  }

  if (next.serviceid != null) {
    const category = await prisma.jobcategories.findFirst({
      where: { categoryid: Number(next.serviceid), tenantid },
      select: { categoryid: true, groupid: true }
    });
    if (!category) {
      const err = new Error(`serviceid ${next.serviceid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
    next.serviceid = category.categoryid;

    if (next.groupid == null && category.groupid != null) {
      next.groupid = Number(category.groupid);
    } else if (
      next.groupid != null &&
      category.groupid != null &&
      Number(category.groupid) !== Number(next.groupid)
    ) {
      const err = new Error(
        `serviceid ${next.serviceid} does not belong to groupid ${next.groupid}`
      );
      err.status = 400;
      throw err;
    }
  }

  return next;
}

function erpProductUnitSnapshot(product) {
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
      producttype: null
    };
  }
  const producttype = resolveErpProductType(product);
  return {
    unitid: product.unitid ?? null,
    unitname: product.units?.name ?? null,
    unitsymbol: product.units?.symbol ?? null,
    brandid: product.brandid ?? null,
    brandname: product.brands?.name ?? null,
    hscode: product.hscode ?? null,
    barcode: product.barcode ?? null,
    erpcode: product.erpcode ?? null,
    producttype
  };
}

function enrichErpProductResponse(product) {
  if (!product) {
    return product;
  }

  return {
    ...product,
    ...erpProductGroupCategoryLabels(product),
    enableCPairReceive: product.enablecpairreceive === true
  };
}

function formatErpProductDropdownRow(product) {
  if (!product) {
    return null;
  }

  const brandId = product.brandid ?? product.brands?.recno ?? null;
  const groupCategory = erpProductGroupCategoryLabels(product);

  return {
    id: product.erpproductid,
    value: product.erpproductid,
    name: product.name ?? null,
    label: product.name || `erpproducts #${product.erpproductid}`,
    brandId,
    sku: product.barcode ?? null,
    barcode: product.barcode ?? null,
    oldErpCode: product.erpcode ?? null,
    saleRate: product.salerate ?? null,
    purchaseRate: product.purchaserate ?? null,
    salerate: product.salerate ?? null,
    purchaserate: product.purchaserate ?? null,
    erpcode: product.erpcode ?? null,
    producttype: resolveErpProductType(product),
    brandname: product.brands?.name ?? null,
    ...groupCategory
  };
}

const ERP_PRODUCT_DROPDOWN_SELECT = {
  erpproductid: true,
  name: true,
  hscode: true,
  barcode: true,
  erpcode: true,
  producttype: true,
  salerate: true,
  purchaserate: true,
  discountvalue: true,
  discounttype: true,
  enablecpairreceive: true,
  unitid: true,
  brandid: true,
  groupid: true,
  serviceid: true,
  units: { select: { recno: true, name: true, symbol: true } },
  brands: { select: { recno: true, name: true } },
  jobgroups: { select: { groupid: true, name: true } },
  jobcategories: { select: { categoryid: true, name: true, groupid: true } }
};

const ERP_PRODUCT_WITH_UNIT_INCLUDE = {
  include: {
    units: { select: { recno: true, name: true, symbol: true } },
    brands: { select: { recno: true, name: true } },
    jobgroups: { select: { groupid: true, name: true } },
    jobcategories: { select: { categoryid: true, name: true, groupid: true } }
  }
};

function formatJobErpProductFields(job = {}) {
  const catalog = job.erpproducts ?? null;
  const erpProductId = job.erpproductid ?? catalog?.erpproductid ?? null;

  if (erpProductId == null) {
    return {
      erpProductId: null,
      erpProductName: null,
      erpProductBrandId: null,
      erpProductSku: null,
      erpProductBarcode: null,
      erpProductOldErpCode: null,
      erpProductSaleRate: null,
      erpProductPurchaseRate: null
    };
  }

  const row = catalog ? formatErpProductDropdownRow(catalog) : null;

  return {
    erpProductId: Number(erpProductId),
    erpProductName: row?.name ?? null,
    erpProductBrandId: row?.brandId ?? catalog?.brandid ?? null,
    erpProductSku: row?.sku ?? catalog?.barcode ?? null,
    erpProductBarcode: row?.barcode ?? catalog?.barcode ?? null,
    erpProductOldErpCode: row?.oldErpCode ?? catalog?.erpcode ?? null,
    erpProductSaleRate: row?.saleRate ?? catalog?.salerate ?? null,
    erpProductPurchaseRate: row?.purchaseRate ?? catalog?.purchaserate ?? null
  };
}

const ERP_PRODUCT_BULK_INSERT_FIELDS = [
  "name",
  "hscode",
  "barcode",
  "erpcode",
  "salerate",
  "purchaserate",
  "discountvalue",
  "discounttype",
  "isactive",
  "enablecpairreceive",
  "producttype",
  "unitid",
  "brandid",
  "groupid",
  "serviceid",
  "createdat"
];

function pickErpProductInsertFields(data = {}) {
  const next = {};
  ERP_PRODUCT_BULK_INSERT_FIELDS.forEach((field) => {
    if (data[field] !== undefined) {
      next[field] = data[field];
    }
  });
  return next;
}

/**
 * Build a row for erpproducts bulk insert (same normalization/FKs as POST /api/erpproducts).
 */
async function buildErpProductBulkInsertData(resolved, auth, now) {
  const stripped = { ...resolved };
  Object.keys(stripped).forEach((key) => {
    if (key.startsWith("_")) {
      delete stripped[key];
    }
  });

  let data = normalizeErpProductPayload(stripped);
  data = await resolveErpProductForeignKeys(data, auth);
  data = pickErpProductInsertFields(data);

  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  if (tenantid == null || !Number.isFinite(tenantid)) {
    const err = new Error("JWT tenantid is required for ERP product import");
    err.status = 401;
    throw err;
  }

  const userid = auth?.userid != null ? Number(auth.userid) : null;
  const branchid = auth?.branchid != null ? Number(auth.branchid) : null;

  return {
    ...data,
    tenantid,
    ...(branchid != null && Number.isFinite(branchid) ? { branchid } : {}),
    createdby: userid,
    lastupdatedby: userid,
    createdat: data.createdat || now,
    lastupdatedat: now,
    isactive: data.isactive === undefined ? true : data.isactive
  };
}

module.exports = {
  normalizeErpProductPayload,
  resolveErpProductForeignKeys,
  resolveErpProductType,
  erpProductUnitSnapshot,
  erpProductGroupCategoryLabels,
  enrichErpProductResponse,
  formatErpProductDropdownRow,
  formatJobErpProductFields,
  buildErpProductBulkInsertData,
  pickErpProductInsertFields,
  ERP_PRODUCT_DROPDOWN_SELECT,
  ERP_PRODUCT_WITH_UNIT_INCLUDE
};
