const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { resolveGeoHierarchy } = require("../utils/generic-payload");
const {
  JOB_PRODUCT_LINE_INCLUDE,
  mapProductLineToForm,
  mapJobProductLines,
  pickProductLines,
  productLineLabel,
  isProductLinePresent,
  stripLineScopeFields
} = require("../utils/job-product-lines");
const {
  JOB_SERVICE_LINE_INCLUDE,
  mapServiceLineToForm,
  mapJobServiceLines,
  pickServiceLines,
  serviceLineLabel,
  isServiceLinePresent,
  stripServiceLineScopeFields
} = require("../utils/job-service-lines");
const { optionalJobservicesInclude, jobservicesSupported } = require("../utils/prisma-jobservices");
const { ERP_PRODUCT_WITH_UNIT_INCLUDE, formatJobErpProductFields } = require("../utils/erp-product-payload");
const { modelHasRelation } = require("../utils/prisma-model-support");
const jobApprovalService = require("./job-approval.service");
const jobQuotationSettingsService = require("./job-quotation-settings.service");
const jobFormSettingsService = require("./job-form-settings.service");
const { validateJobAgainstFormSettings } = require("../utils/job-form-validation");
const { normalizeFormType } = require("../config/job-form-fields.registry");
const { parseOptionalText } = require("../utils/job-quotation-text");
const {
  pickStartLocation,
  pickStopLocation,
  pickRemarks,
  locationFromPayload
} = require("../utils/location-payload");
const {
  jobMainEquipmentFields,
  mergeJobdetailsRemarks,
  pickEquipmentBrandId,
  brandIdProvidedInPayload,
  normalizeJobRequestBody
} = require("../utils/job-equipment");
const {
  resolveInitialJobStatusId,
  syncJobStatusWithAssignment,
  applyCompletedJobStatus
} = require("../utils/job-assignment-status");
const {
  enrichJobApiRow,
  loadDeliveryTypeMap,
  loadJobListEnrichmentContext,
  ensureJobCategoryLoaded
} = require("../utils/job-response-enrichment");
const { buildJobHierarchyFields } = require("../utils/job-response-labels");
const {
  QUOTATION_STATUS,
  normalizeQuotationStatus,
  parseOptionalQuotationStatus,
  quotationRemarksRequired,
  listQuotationStatusOptions,
  formatQuotationStatusFields,
  formatQuotationQuotedFields,
  parseQuotedById,
  parseQuotedAt,
  formatQuotationStatusLogRow
} = require("../utils/quotation-status");
const {
  parseCustomerFeedbackInput,
  formatCustomerFeedbackRow
} = require("../utils/job-customer-feedback");
const { formatJobAttachmentRow, JOB_ATTACHMENT_INCLUDE } = require("../utils/job-attachments-payload");
const { formatJobStatusLogRow, JOB_STATUS_LOG_INCLUDE } = require("../utils/job-status-log");
const {
  JOB_ASSIGNMENT_LOG_INCLUDE,
  JOB_TRAVEL_HISTORY_INCLUDE,
  JOB_WORK_HISTORY_INCLUDE,
  JOB_DETAIL_CREATED_SELECT,
  buildJobCreatedEvent,
  buildAssignmentEvent,
  buildStatusChangedEvent,
  buildQuotationStatusChangedEvent,
  buildTravelEvent,
  buildWorkEvent,
  buildAttachmentEvent
} = require("../utils/job-timeline");
const pushDispatch = require("./push-dispatch.service");
const userActivityLogService = require("./user-activity-log.service");
const {
  isJobAdmin,
  canManageBranchJobs,
  applyTechnicianJobScope,
  ensureAssignedTechnicianOrAdmin
} = require("../utils/job-access");
const {
  ensureCustomerAddressFromJob,
  resolveJobCustomerAddress
} = require("./customer-addresses.service");
const {
  normalizeCustomerPhone,
  assertCustomerPhoneAvailable
} = require("../utils/customer-phone");

function logJobWorkflow(auth, action, job, extra = {}) {
  return userActivityLogService.logSafe(auth, {
    module: "jobs",
    action,
    entityName: job?.code ? `Job ${job.code}` : extra.entityName ?? null,
    entityCode: job?.code ?? null,
    jobId: job?.recno ?? job?.jobid ?? null,
    entityId: job?.recno ?? job?.jobid ?? null,
    ...extra
  });
}

const QUOTATION_STATUS_LOG_QUERY = {
  orderBy: { changedat: "desc" },
  include: {
    changedbyuser: { select: { userid: true, name: true, email: true } },
    quotedbyuser: { select: { userid: true, name: true, email: true } }
  }
};

const QUOTATION_JOB_USER_SELECT = {
  quotationquotedbyuser: { select: { userid: true, name: true, email: true } }
};

function buildJobFormInclude() {
  const include = {
    customers: true,
    users: {
      select: {
        userid: true,
        name: true,
        technicianaffiliation: true,
        companyname: true
      }
    },
    followupbyuser: {
      select: {
        userid: true,
        name: true,
        usertype: true
      }
    },
    jobgroups: { select: { groupid: true, name: true } },
    jobtypes: { select: { recno: true, name: true } },
    jobsources: { select: { recno: true, name: true, description: true } },
    jobcategories: {
      select: {
        categoryid: true,
        name: true,
        groupid: true,
        jobgroups: { select: { groupid: true, name: true } }
      }
    },
    jobsubcategories: {
      select: {
        subcategoryid: true,
        name: true,
        categoryid: true,
        jobcategories: {
          select: {
            categoryid: true,
            name: true,
            groupid: true,
            jobgroups: { select: { groupid: true, name: true } }
          }
        }
      }
    },
    jobdetails: { orderBy: { recno: "asc" }, take: 1 },
    jobproducts: JOB_PRODUCT_LINE_INCLUDE,
    ...optionalJobservicesInclude()
  };

  if (modelHasRelation(prisma, "job", "erpproducts")) {
    include.erpproducts = ERP_PRODUCT_WITH_UNIT_INCLUDE;
  }

  return include;
}

function jobNotFoundError() {
  const err = new Error("Job not found");
  err.status = 404;
  return err;
}

const JOB_MUTABLE_FIELDS = [
  "code", "date", "assignedto", "followupby", "city", "area", "groupid", "serviceid", "faultid", "customerid",
  "isinwaranty", "statusid", "priority", "deliverytype", "jobtypeid", "jobsourceid", "manualjobno",
  "complaintby", "estimatedcompletedtime", "isacknowledged", "qualityassuerd"
];

function toNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Map camelCase API fields to DB column names on create/update bodies. */
function applyJobFieldAliases(data = {}) {
  const next = { ...data };
  const pairs = [
    ["assignedToId", "assignedto"],
    ["followUpById", "followupby"],
    ["followUpBy", "followupby"],
    ["customerId", "customerid"],
    ["statusId", "statusid"],
    ["serviceId", "groupid"],
    ["categoryId", "serviceid"],
    ["faultId", "faultid"],
    ["jobTypeId", "jobtypeid"],
    ["jobSourceId", "jobsourceid"],
    ["deliveryTypeId", "deliverytype"],
    ["complaintBy", "complaintby"],
    ["erpProductId", "erpproductid"]
  ];
  pairs.forEach(([camel, db]) => {
    if (next[camel] !== undefined && next[db] === undefined) {
      next[db] = next[camel];
    }
  });
  return next;
}

/** jobproducts.taxtypeid → taxtypes.recno for this tenant; null if missing/invalid. */
async function resolveTaxTypeId(tx, tenantid, rawId) {
  const id = toNumber(rawId);
  if (id == null || id <= 0) return null;
  const row = await tx.taxtypes.findFirst({
    where: { recno: id, tenantid: Number(tenantid) }
  });
  return row ? row.recno : null;
}

async function recalculateJobTotalCost(tx, scope, jobId) {
  const where = { jobid: Number(jobId), ...scope };
  const productAgg = await tx.jobproducts.aggregate({
    where,
    _sum: { inclusiveamount: true }
  });
  const serviceAgg = jobservicesSupported()
    ? await tx.jobservices.aggregate({ where, _sum: { inclusiveamount: true } })
    : { _sum: { inclusiveamount: null } };
  const total =
    (Number(productAgg._sum.inclusiveamount) || 0) +
    (Number(serviceAgg._sum.inclusiveamount) || 0);

  await tx.job.update({
    where: { recno: Number(jobId) },
    data: { totalcost: total }
  });

  return total;
}

/** job line productid → products.productid for this tenant; null if missing/invalid. */
async function resolveJobLineProductId(tx, tenantid, rawId) {
  const id = toNumber(rawId);
  if (id == null || id <= 0) return null;
  const row = await tx.products.findFirst({
    where: { productid: id, tenantid: Number(tenantid) }
  });
  return row ? row.productid : null;
}

function isServiceCatalogProduct(product) {
  if (!product) return false;
  return (
    product.isservice === true ||
    String(product.producttype || "").toLowerCase() === "service"
  );
}

async function loadJobLineProduct(tx, tenantid, productid) {
  if (!productid) return null;
  return tx.products.findFirst({
    where: { productid: Number(productid), tenantid: Number(tenantid) },
    select: { productid: true, name: true, isservice: true, producttype: true }
  });
}

async function assertServiceCatalogProduct(tx, tenantid, productid) {
  if (!productid) return;
  const product = await loadJobLineProduct(tx, tenantid, productid);
  if (!product) return;

  if (!isServiceCatalogProduct(product)) {
    const err = new Error(
      `productid ${productid} is not a service product; only products with type service belong in serviceLines`
    );
    err.status = 400;
    throw err;
  }
}

async function resolveJobLineServiceProductId(tx, tenantid, rawId) {
  const productid = await resolveJobLineProductId(tx, tenantid, rawId);
  if (!productid) return null;
  await assertServiceCatalogProduct(tx, tenantid, productid);
  return productid;
}

function toBoolean(value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toTimelineIso(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveJobCreatedAt(job, detail) {
  if (detail?.createdat) return detail.createdat;
  return job?.date ?? null;
}

function sliceStr(value, maxLen) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/** Accepts plain numbers or labels like "60 Minutes" for job.estimatedcompletedtime. */
function parseEstimatedMinutes(value) {
  const n = toNumber(value);
  if (n !== undefined) return n;
  if (value == null || value === "") return undefined;
  const m = String(value).match(/\d+/);
  if (!m) return undefined;
  const parsed = Number(m[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasJobDetailInput(data = {}) {
  return [
    "description",
    "complaintDescription",
    "notes",
    "complaintNotes",
    "address",
    "customerAddress",
    "siteAddress",
    "latitude",
    "longitude",
    "lat",
    "lng",
    "longitutde",
    "detailRemarks",
    "jobdetailsRemarks",
    "productModel",
    "serialNumber",
    "invoiceNumber",
    "purchaseDate"
  ].some((key) => data[key] !== undefined);
}

function buildJobDetailsPatch(data = {}, existingRemarks = null) {
  const patch = {};

  if (data.description !== undefined || data.complaintDescription !== undefined) {
    patch.description = data.description ?? data.complaintDescription ?? null;
  }
  if (data.notes !== undefined || data.complaintNotes !== undefined) {
    patch.notes = data.notes ?? data.complaintNotes ?? null;
  }
  if (
    data.detailRemarks !== undefined ||
    data.jobdetailsRemarks !== undefined ||
    data.productModel !== undefined ||
    data.serialNumber !== undefined ||
    data.invoiceNumber !== undefined ||
    data.purchaseDate !== undefined
  ) {
    patch.remarks = mergeJobdetailsRemarks(data, existingRemarks);
  }
  if (data.address !== undefined || data.customerAddress !== undefined || data.siteAddress !== undefined) {
    const addr = data.address ?? data.customerAddress ?? data.siteAddress ?? null;
    patch.address = sliceStr(addr, 50);
  }
  if (data.latitude !== undefined || data.lat !== undefined) {
    patch.latitude = sliceStr(data.latitude ?? data.lat, 50);
  }
  if (data.longitude !== undefined || data.lng !== undefined || data.longitutde !== undefined) {
    patch.longitutde = sliceStr(data.longitude ?? data.lng ?? data.longitutde, 50);
  }

  return patch;
}

async function resolveIsserviceitem(tx, tenantid, line, productid) {
  if (line.isserviceitem === true || line.isserviceitem === false) {
    return line.isserviceitem === true;
  }
  if (!productid) {
    return line.isserviceitem !== false;
  }
  const product = await tx.products.findFirst({
    where: { productid, tenantid: Number(tenantid) },
    select: { isservice: true, producttype: true }
  });
  if (!product) return false;
  return product.isservice === true || String(product.producttype || "").toLowerCase() === "service";
}

async function resolveJobErpProductId(tx, tenantid, rawId, useErpProducts, options = {}) {
  const hasInput =
    options.inputProvided === true ||
    (rawId !== undefined && rawId !== null && rawId !== "");

  if (!useErpProducts) {
    if (hasInput && rawId != null && rawId !== "") {
      const err = new Error("erpProductId is only allowed when useERPProducts is enabled");
      err.status = 400;
      throw err;
    }
    return null;
  }

  if (rawId == null || rawId === "") {
    return null;
  }

  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("erpProductId must be a positive integer");
    err.status = 400;
    throw err;
  }

  const row = await tx.erpproducts.findFirst({
    where: { erpproductid: id, tenantid: Number(tenantid) },
    select: { erpproductid: true }
  });
  if (!row) {
    const err = new Error(`erpProductId ${id} is not valid for this organization`);
    err.status = 400;
    throw err;
  }
  return row.erpproductid;
}

async function loadUseErpProducts(tx, scope) {
  const settings = await tx.jobquotationsettings.findFirst({
    where: { tenantid: Number(scope.tenantid), branchid: Number(scope.branchid) },
    select: { useerpproducts: true }
  });
  return settings?.useerpproducts === true;
}

async function applyJobErpProductId(tx, scope, data, payload, useErpProducts) {
  const rawId =
    data.erpProductId !== undefined
      ? data.erpProductId
      : data.erpproductid !== undefined
        ? data.erpproductid
        : payload.erpproductid;

  if (rawId === undefined) {
    return payload;
  }

  payload.erpproductid = await resolveJobErpProductId(tx, scope.tenantid, rawId, useErpProducts, {
    inputProvided: true
  });
  return payload;
}

async function mapProductLineToDb(tx, scope, jobId, line, index) {
  const qty = Number(line.qty ?? 0) || 0;
  const price = Number(line.price ?? line.rate ?? 0) || 0;
  const taxamount = Number(line.taxamount ?? line.tax ?? line.vat ?? 0) || 0;
  const lineNet = qty * price;
  const inclusive = Number(line.inclusiveamount ?? line.amount ?? lineNet + taxamount) || 0;
  const productid = await resolveJobLineProductId(tx, scope.tenantid, line.productid);
  const isserviceitem = await resolveIsserviceitem(tx, scope.tenantid, line, productid);

  return {
    jobid: jobId,
    ...scope,
    productid,
    modelno: sliceStr(line.modelno || line.productModel, 50),
    partno: sliceStr(line.partno || line.serialNumber, 50),
    salerefrenceno: sliceStr(line.salerefrenceno || line.invoiceNumber, 50),
    qty,
    price,
    totalamount: Number(line.totalamount ?? lineNet) || 0,
    discounttype: line.discounttype || null,
    discountvalue: Number(line.discountvalue || 0),
    discountamount: Number(line.discountamount || 0),
    exclusiveamount: Number(line.exclusiveamount ?? lineNet) || 0,
    taxtypeid: await resolveTaxTypeId(tx, scope.tenantid, line.taxtypeid),
    taxpercent: Number(line.taxpercent || 0),
    taxamount,
    inclusiveamount: inclusive,
    isserviceitem,
    lineno: toNumber(line.lineno) || index + 1,
    remarks: line.remarks || productLineLabel(line) || null
  };
}

async function mapServiceLineToDb(tx, scope, jobId, line, index) {
  const qty = Number(line.qty ?? 0) || 0;
  const price = Number(line.price ?? line.rate ?? 0) || 0;
  const taxamount = Number(line.taxamount ?? line.tax ?? line.vat ?? 0) || 0;
  const lineNet = qty * price;
  const inclusive = Number(line.inclusiveamount ?? line.amount ?? lineNet + taxamount) || 0;
  const productid = await resolveJobLineServiceProductId(tx, scope.tenantid, line.productid);

  return {
    jobid: jobId,
    ...scope,
    productid,
    modelno: sliceStr(line.modelno || line.productModel, 50),
    partno: sliceStr(line.partno || line.serialNumber, 50),
    salerefrenceno: sliceStr(line.salerefrenceno || line.invoiceNumber, 50),
    qty,
    price,
    totalamount: Number(line.totalamount ?? lineNet) || 0,
    discounttype: line.discounttype || null,
    discountvalue: Number(line.discountvalue || 0),
    discountamount: Number(line.discountamount || 0),
    exclusiveamount: Number(line.exclusiveamount ?? lineNet) || 0,
    taxtypeid: await resolveTaxTypeId(tx, scope.tenantid, line.taxtypeid),
    taxpercent: Number(line.taxpercent || 0),
    taxamount,
    inclusiveamount: inclusive,
    isserviceitem: true,
    lineno: toNumber(line.lineno) || index + 1,
    remarks: line.remarks || serviceLineLabel(line) || null
  };
}

/** Single remark text from POST body (remarks, comment, note, notes). */
function remarkTextFromPayload(payload = {}) {
  const raw =
    payload.remarks ??
    payload.comment ??
    payload.note ??
    (typeof payload.notes === "string" ? payload.notes : undefined);
  if (raw == null || Array.isArray(raw)) return null;
  const text = String(raw).trim();
  return text === "" ? null : text;
}

/** Multiple remark strings from body (remarks array, remarkEntries, or one string field). */
function remarkTextsFromPayload(payload = {}) {
  const texts = [];
  const single = remarkTextFromPayload(payload);
  if (single) texts.push(single);
  for (const key of ["remarkEntries", "remarksList", "comments"]) {
    const arr = payload[key];
    if (Array.isArray(arr)) {
      arr.forEach((item) => {
        if (item == null) return;
        const t = typeof item === "string" ? item : item.remarks ?? item.comment ?? item.text;
        if (t != null && String(t).trim() !== "") texts.push(String(t).trim());
      });
    }
  }
  if (Array.isArray(payload.remarks)) {
    payload.remarks.forEach((item) => {
      if (item == null) return;
      const t = typeof item === "string" ? item : item.remarks ?? item.comment;
      if (t != null && String(t).trim() !== "") texts.push(String(t).trim());
    });
  }
  return [...new Set(texts)];
}

/** Initial complaint notes saved as separate remark rows on job create. */
function collectInitialCreateRemarks(data = {}) {
  const texts = [];
  const desc = data.description || data.complaintDescription;
  if (desc != null && String(desc).trim() !== "") texts.push(String(desc).trim());
  const notes = data.notes || data.complaintNotes;
  if (notes != null && String(notes).trim() !== "") {
    const n = String(notes).trim();
    if (!texts.includes(n)) texts.push(n);
  }
  remarkTextsFromPayload(data).forEach((t) => {
    if (!texts.includes(t)) texts.push(t);
  });
  return texts;
}

function formatJobRemarkRow(row) {
  if (!row) return null;
  return {
    recno: row.recno,
    jobid: row.jobid,
    tenantid: row.tenantid,
    branchid: row.branchid,
    remarks: row.remarks,
    addedby: row.addedby,
    addedat: row.addedat,
    addedByName: row.users?.name ?? null,
    addedByEmail: row.users?.email ?? null
  };
}

const JOB_REMARK_INCLUDE = {
  orderBy: { addedat: "desc" },
  include: {
    users: { select: { userid: true, name: true, email: true } }
  }
};

const JOB_CUSTOMER_FEEDBACK_INCLUDE = {
  include: {
    users: { select: { userid: true, name: true, email: true } }
  }
};

async function upsertJobCustomerFeedback(tx, auth, scope, jobId, body) {
  const parsed = parseCustomerFeedbackInput(body || {});
  if (!parsed) return null;

  const now = utcNow();
  const data = {
    jobid: Number(jobId),
    ...scope,
    rating: parsed.rating,
    comments: parsed.comments,
    recordedby: Number(auth.userid),
    recordedat: now
  };

  return tx.jobcustomerfeedback.upsert({
    where: { jobid: Number(jobId) },
    create: data,
    update: {
      rating: parsed.rating,
      comments: parsed.comments,
      recordedby: Number(auth.userid),
      recordedat: now
    }
  });
}

async function appendJobRemark(tx, auth, scope, jobId, remarksText) {
  const text = remarksText != null ? String(remarksText).trim() : "";
  if (!text) return null;
  return tx.jobcustomerremarkslog.create({
    data: {
      jobid: Number(jobId),
      ...scope,
      remarks: text,
      addedby: Number(auth.userid),
      addedat: utcNow()
    }
  });
}

async function upsertCustomerFromInput(tx, auth, scope, c) {
  if (!c || typeof c !== "object") return null;
  const contactno = normalizeCustomerPhone(c.contactno ?? c.phone) ?? null;
  const name = c.name != null ? String(c.name).trim() : null;
  const email = c.email != null ? String(c.email).trim() : null;
  if (!contactno && !name) return null;

  const uid = Number(auth.userid);
  const now = utcNow();
  let existing = null;
  if (contactno) {
    existing = await tx.customers.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid, contactno }
    });
  }
  if (!existing && name && !contactno) {
    existing = await tx.customers.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid, name }
    });
  }

  const geo = await resolveGeoHierarchy(
    "customers",
    {
      country: c.country ?? c.countryid,
      city: c.city ?? c.cityid,
      area: c.area ?? c.areaid,
      countryname: c.countryname,
      cityname: c.cityname,
      areaname: c.areaname
    },
    { tenantid: scope.tenantid }
  );
  const address =
    c.address != null && String(c.address).trim() !== "" ? String(c.address).trim() : null;

  if (existing) {
    await tx.customers.update({
      where: { customerid: existing.customerid },
      data: {
        name: name || existing.name,
        email: email ?? existing.email,
        contactno: contactno || existing.contactno,
        address: address ?? existing.address,
        city: geo.city ?? existing.city,
        area: geo.area ?? existing.area,
        country: geo.country ?? existing.country,
        lastupdatedat: now,
        lastupdatedby: uid
      }
    });
    return existing.customerid;
  }

  await assertCustomerPhoneAvailable(tx, contactno, scope);

  const created = await tx.customers.create({
    data: {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      name: name || contactno || "Customer",
      email: email || null,
      contactno: contactno || null,
      address,
      city: geo.city || null,
      area: geo.area || null,
      country: geo.country || null,
      isactive: true,
      createdby: uid,
      createdat: now
    }
  });
  return created.customerid;
}

function buildJobPayload(data = {}) {
  const input = applyJobFieldAliases(data);
  const payload = {};
  JOB_MUTABLE_FIELDS.forEach((field) => {
    if (input[field] !== undefined) payload[field] = input[field];
  });
  if (payload.faultid === undefined) {
    const subId = toNumber(input.faultId);
    if (subId !== undefined) payload.faultid = subId;
  }
  if (brandIdProvidedInPayload(input)) {
    const picked = pickEquipmentBrandId(input);
    payload.brandid = picked == null ? null : picked;
  }
  ["assignedto", "followupby", "city", "area", "groupid", "serviceid", "faultid", "customerid", "statusid", "deliverytype", "jobtypeid", "jobsourceid"].forEach((field) => {
    if (payload[field] !== undefined) {
      if (payload[field] === null) {
        payload[field] = null;
      } else {
        const n = toNumber(payload[field]);
        payload[field] = n === undefined ? null : n;
      }
    }
  });
  if (payload.brandid !== undefined && payload.brandid !== null) {
    payload.brandid = toNumber(payload.brandid);
  }
  if (payload.assignedto !== undefined && payload.assignedto !== null && payload.assignedto <= 0) {
    payload.assignedto = null;
  }
  if (payload.followupby !== undefined && payload.followupby !== null && payload.followupby <= 0) {
    payload.followupby = null;
  }
  if (payload.estimatedcompletedtime !== undefined) {
    const mins = parseEstimatedMinutes(payload.estimatedcompletedtime);
    if (mins !== undefined) payload.estimatedcompletedtime = mins;
    else delete payload.estimatedcompletedtime;
  }
  if (payload.date !== undefined) payload.date = toDate(payload.date);
  if (input.isinwaranty !== undefined) {
    const b = toBoolean(input.isinwaranty);
    if (b !== undefined) payload.isinwaranty = b;
    else if (typeof input.isinwaranty === "boolean") payload.isinwaranty = input.isinwaranty;
  }
  if (input.isacknowledged !== undefined) {
    const b = toBoolean(input.isacknowledged);
    if (b !== undefined) payload.isacknowledged = b;
    else if (typeof input.isacknowledged === "boolean") payload.isacknowledged = input.isacknowledged;
  }
  if (input.qualityassuerd !== undefined) {
    const b = toBoolean(input.qualityassuerd);
    if (b !== undefined) payload.qualityassuerd = b;
    else if (typeof input.qualityassuerd === "boolean") payload.qualityassuerd = input.qualityassuerd;
  }
  if (payload.complaintby !== undefined) {
    const raw = payload.complaintby;
    payload.complaintby =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
  }
  const quotationRaw =
    input.quotationStatus !== undefined ? input.quotationStatus : input.quotationstatus;
  if (quotationRaw !== undefined) {
    payload.quotationstatus = parseOptionalQuotationStatus(quotationRaw);
  }

  const notesRaw = input.quotationNotes ?? input.quotationnotes;
  const termsRaw =
    input.quotationTermsAndConditions ??
    input.quotationTerms ??
    input.quotationtermsandconditions ??
    input.quotationterms;
  if (notesRaw !== undefined) {
    payload.quotationnotes = parseOptionalText(notesRaw);
  }
  if (termsRaw !== undefined) {
    payload.quotationterms = parseOptionalText(termsRaw);
  }

  const jobNotesRaw = input.jobNotes ?? input.jobnotes;
  if (jobNotesRaw !== undefined) {
    payload.notes = parseOptionalText(jobNotesRaw);
  }

  const jobTermsRaw =
    input.jobTermsAndConditions ??
    input.jobtermsandconditions ??
    input.termsAndConditions ??
    input.termsandconditions ??
    input.terms;
  if (jobTermsRaw !== undefined) {
    payload.termsandconditions = parseOptionalText(jobTermsRaw);
  }

  if (payload.code !== undefined && payload.code !== null) {
    const trimmed = String(payload.code).trim();
    payload.code = trimmed || null;
  }

  return payload;
}

function jobToFormPayload(job, detail, customer, products = [], services = [], options = {}) {
  const equipmentMain = jobMainEquipmentFields(detail, job.brandid);
  const { serviceId, serviceName, categoryId, categoryName, faultId, faultName } =
    buildJobHierarchyFields(job);
  return {
    recno: job.recno,
    code: job.code,
    date: job.date,
    assignedToId: job.assignedto ?? null,
    assignedToName: job.users?.name ?? null,
    assignedToAffiliation: job.users?.technicianaffiliation ?? null,
    assignedToCompanyName: job.users?.companyname ?? null,
    followUpById: job.followupby ?? job.followupbyuser?.userid ?? null,
    followUpByName: job.followupbyuser?.name ?? null,
    city: job.city,
    area: job.area,
    serviceId,
    serviceName,
    categoryId,
    categoryName,
    faultId,
    faultName,
    customerId: job.customerid ?? null,
    customer: customer
      ? {
          name: customer.name,
          email: customer.email,
          contactno: customer.contactno,
          phone: customer.contactno,
          country: customer.country,
          city: customer.city,
          area: customer.area
        }
      : undefined,
    isinwaranty: job.isinwaranty,
    statusId: job.statusid ?? null,
    priority: job.priority,
    deliveryTypeId: job.deliverytype ?? null,
    deliveryTypeName: options.deliveryTypeName ?? null,
    jobTypeId: job.jobtypes?.recno ?? job.jobtypeid ?? null,
    jobTypeName: job.jobtypes?.name ?? null,
    jobSourceId: job.jobsources?.recno ?? job.jobsourceid ?? null,
    jobSourceName: job.jobsources?.name ?? null,
    jobSourceDescription: job.jobsources?.description ?? null,
    ...formatQuotationStatusFields(job.quotationstatus),
    manualjobno: job.manualjobno,
    complaintBy: job.complaintby ?? null,
    estimatedcompletedtime: job.estimatedcompletedtime,
    isacknowledged: job.isacknowledged,
    qualityassuerd: job.qualityassuerd,
    description: detail?.description ?? null,
    complaintDescription: detail?.description ?? null,
    notes: detail?.notes ?? null,
    complaintNotes: detail?.notes ?? null,
    address: detail?.address ?? null,
    customerAddress: detail?.address ?? null,
    siteAddress: detail?.address ?? null,
    latitude: detail?.latitude ?? null,
    longitude: detail?.longitutde ?? null,
    lat: detail?.latitude != null ? Number(detail.latitude) || detail.latitude : null,
    lng: detail?.longitutde != null ? Number(detail.longitutde) || detail.longitutde : null,
    ...equipmentMain,
    brandId: job.brandid ?? equipmentMain.brandId ?? null,
    productLines: mapJobProductLines(products),
    serviceLines: mapJobServiceLines(services),
    totalCost: job.totalcost ?? null,
    quotationNotes: job.quotationnotes ?? null,
    quotationTermsAndConditions: job.quotationterms ?? null,
    jobNotes: job.notes ?? null,
    termsAndConditions: job.termsandconditions ?? null,
    ...formatJobErpProductFields(job)
  };
}

/**
 * job.serviceid stores category id; job.faultid stores subcategory id.
 */
async function resolveJobForeignKeys(tx, scope, data, payload) {
  const tenantid = scope.tenantid;
  const requestedServiceGroupId = payload.groupid != null
    ? Number(payload.groupid)
    : toNumber(data.serviceId);

  if (requestedServiceGroupId != null) {
    const group = await tx.jobgroups.findFirst({
      where: { groupid: Number(requestedServiceGroupId), tenantid }
    });
    if (!group) {
      const err = new Error(`serviceId ${requestedServiceGroupId} is not a valid job group for this organization`);
      err.status = 400;
      throw err;
    }
    payload.groupid = Number(requestedServiceGroupId);
  }

  if (payload.serviceid) {
    const category = await tx.jobcategories.findFirst({
      where: { categoryid: Number(payload.serviceid), tenantid }
    });
    if (!category) {
      const err = new Error(
        `categoryId ${payload.serviceid} is not a valid job category for this organization`
      );
      err.status = 400;
      throw err;
    }
    if (
      requestedServiceGroupId != null &&
      category.groupid != null &&
      Number(category.groupid) !== Number(requestedServiceGroupId)
    ) {
      const err = new Error(
        `categoryId ${payload.serviceid} does not belong to serviceId (group) ${requestedServiceGroupId}`
      );
      err.status = 400;
      throw err;
    }
  }

  let faultId = payload.faultid;
  if (faultId === undefined || faultId === null) {
    delete payload.faultid;
    return payload;
  }

  let sub = await tx.jobsubcategories.findFirst({
    where: { subcategoryid: Number(faultId), tenantid }
  });

  if (!sub && payload.serviceid) {
    sub = await tx.jobsubcategories.findFirst({
      where: {
        tenantid,
        categoryid: Number(payload.serviceid),
        subcategoryid: Number(faultId)
      }
    });
  }

  if (!sub) {
    const catAsFault = await tx.jobcategories.findFirst({
      where: { categoryid: Number(faultId), tenantid }
    });
    if (catAsFault) {
      const err = new Error(
        `faultId ${faultId} is a job category id; use categoryId for category and faultId for sub category`
      );
      err.status = 400;
      throw err;
    }
  }

  const faultName = data.faultName ?? data.faultname;
  if (!sub && faultName && String(faultName).trim() !== "") {
    sub = await tx.jobsubcategories.findFirst({
      where: {
        tenantid,
        name: String(faultName).trim(),
        ...(payload.serviceid ? { categoryid: Number(payload.serviceid) } : {})
      }
    });
  }

  if (!sub) {
    const err = new Error(
      `faultId ${faultId} is not a valid job sub category id`
    );
    err.status = 400;
    throw err;
  }

  if (
    payload.serviceid &&
    sub.categoryid != null &&
    Number(sub.categoryid) !== Number(payload.serviceid)
  ) {
    const err = new Error(
      `faultId ${sub.subcategoryid} does not belong to categoryId ${payload.serviceid}`
    );
    err.status = 400;
    throw err;
  }

  payload.faultid = sub.subcategoryid;
  if (!payload.serviceid && sub.categoryid) {
    payload.serviceid = sub.categoryid;
  }

  if (payload.serviceid != null) {
    const category = await tx.jobcategories.findFirst({
      where: { categoryid: Number(payload.serviceid), tenantid },
      select: { groupid: true }
    });
    if (payload.groupid == null && category?.groupid != null) {
      payload.groupid = Number(category.groupid);
    } else if (payload.groupid != null && category?.groupid != null && Number(category.groupid) !== Number(payload.groupid)) {
      const err = new Error(
        `categoryId ${payload.serviceid} does not belong to serviceId (group) ${payload.groupid}`
      );
      err.status = 400;
      throw err;
    }
  }

  for (const [field, delegate] of [
    ["city", "cities"],
    ["area", "areas"]
  ]) {
    if (payload[field] == null) continue;
    const row = await tx[delegate].findFirst({
      where: { recno: Number(payload[field]), tenantid }
    });
    if (!row) {
      delete payload[field];
    }
  }

  if (payload.deliverytype != null) {
    const dt = await tx.deliverytypes.findFirst({
      where: { recno: Number(payload.deliverytype), tenantid }
    });
    if (!dt) {
      delete payload.deliverytype;
    }
  }

  if (payload.jobtypeid != null) {
    const jt = await tx.jobtypes.findFirst({
      where: { recno: Number(payload.jobtypeid), tenantid }
    });
    if (!jt) {
      const err = new Error(`jobTypeId ${payload.jobtypeid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.jobsourceid != null) {
    const js = await tx.jobsources.findFirst({
      where: { recno: Number(payload.jobsourceid), tenantid }
    });
    if (!js) {
      const err = new Error(`jobSourceId ${payload.jobsourceid} is not valid for this organization`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.statusid != null) {
    const st = await tx.jobstatuses.findFirst({
      where: { recno: Number(payload.statusid), tenantid }
    });
    if (!st) {
      delete payload.statusid;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedto")) {
    const uid = payload.assignedto;
    if (uid == null || Number(uid) <= 0) {
      payload.assignedto = null;
    } else {
      const member = await tx.userorganizations.findFirst({
        where: {
          userid: Number(uid),
          tenantid,
          branchid: scope.branchid,
          isblocked: false
        }
      });
      if (!member) {
        const err = new Error(
          `assignedToId ${uid} is not a valid user for this branch`
        );
        err.status = 400;
        throw err;
      }
      payload.assignedto = Number(uid);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "followupby")) {
    const uid = payload.followupby;
    if (uid == null || Number(uid) <= 0) {
      payload.followupby = null;
    } else {
      const member = await tx.userorganizations.findFirst({
        where: {
          userid: Number(uid),
          tenantid,
          branchid: scope.branchid,
          isblocked: false
        }
      });
      if (!member) {
        const err = new Error(
          `followUpById ${uid} is not a valid user for this branch`
        );
        err.status = 400;
        throw err;
      }
      payload.followupby = Number(uid);
    }
  }

  if (brandIdProvidedInPayload(data)) {
    const brandId = pickEquipmentBrandId(data);
    if (brandId != null) {
      const brand = await tx.brands.findFirst({
        where: { recno: brandId, tenantid }
      });
      if (!brand) {
        const err = new Error(`brandId ${brandId} is not valid for this organization`);
        err.status = 400;
        throw err;
      }
    }
  }

  return payload;
}

function buildJobRelationConnectData({ payload, scope, customerid, assignedto, statusid }) {
  const relations = {
    organizations: { connect: { tenantid: Number(scope.tenantid) } },
    branches: { connect: { branchid: Number(scope.branchid) } },
    customers: { connect: { customerid: Number(customerid) } }
  };

  if (assignedto != null) relations.users = { connect: { userid: Number(assignedto) } };
  if (payload.followupby != null) {
    relations.followupbyuser = { connect: { userid: Number(payload.followupby) } };
  }
  if (payload.city != null) relations.cities = { connect: { recno: Number(payload.city) } };
  if (payload.area != null) relations.areas = { connect: { recno: Number(payload.area) } };
  if (payload.serviceid != null) relations.jobcategories = { connect: { categoryid: Number(payload.serviceid) } };
  if (payload.faultid != null) relations.jobsubcategories = { connect: { subcategoryid: Number(payload.faultid) } };
  if (payload.statusid != null || statusid != null) {
    relations.jobstatuses = { connect: { recno: Number(payload.statusid ?? statusid) } };
  }
  if (payload.brandid != null) relations.brands = { connect: { recno: Number(payload.brandid) } };
  if (payload.groupid != null) relations.jobgroups = { connect: { groupid: Number(payload.groupid) } };
  if (payload.jobtypeid != null) relations.jobtypes = { connect: { recno: Number(payload.jobtypeid) } };
  if (payload.jobsourceid != null) relations.jobsources = { connect: { recno: Number(payload.jobsourceid) } };
  if (payload.erpproductid != null) {
    relations.erpproducts = { connect: { erpproductid: Number(payload.erpproductid) } };
  }

  return relations;
}

function stripJobRelationScalarFields(data = {}) {
  const next = { ...data };
  [
    "tenantid",
    "branchid",
    "customerid",
    "assignedto",
    "followupby",
    "city",
    "area",
    "serviceid",
    "faultid",
    "statusid",
    "brandid",
    "groupid",
    "jobtypeid",
    "jobsourceid",
    "erpproductid"
  ].forEach((key) => {
    delete next[key];
  });
  return next;
}

/**
 * Next numeric job `code` for tenant (6-digit zero-padded), after `pg_advisory_xact_lock`.
 * Unique per organization (tenantid), shared across all branches in that org.
 * Caller must run inside a transaction; lock is released at transaction end.
 */
async function computeNextJobCodeAfterLock(tx, tenantid) {
  const rows = await tx.$queryRaw`
    SELECT MAX(code) AS max_code
    FROM job
    WHERE tenantid = ${tenantid} AND code IS NOT NULL
  `;
  const maxCode = rows?.[0]?.max_code != null ? String(rows[0].max_code) : null;
  const maxNum = maxCode && /^\d+$/.test(maxCode) ? Number(maxCode) : 0;
  const nextNum = maxNum + 1;
  const nextCode = String(nextNum).padStart(6, "0");
  return { maxCode, maxNum, nextCode, nextNum };
}

async function acquireJobCodeLock(tx, tenantid) {
  const lockKey = BigInt(900000000) + BigInt(tenantid);
  // pg_advisory_xact_lock returns void — must use $executeRaw, not $queryRaw.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
}

async function assertJobCodeUniqueInTenant(tx, tenantid, code, excludeJobId = null) {
  const trimmed = code == null ? "" : String(code).trim();
  if (!trimmed) return;

  const existing = await tx.job.findFirst({
    where: {
      tenantid: Number(tenantid),
      code: trimmed,
      ...(excludeJobId != null ? { recno: { not: Number(excludeJobId) } } : {})
    },
    select: { recno: true, branchid: true }
  });

  if (existing) {
    const err = new Error(`Job code "${trimmed}" already exists in this organization`);
    err.status = 409;
    throw err;
  }
}

async function nextJobCodeInTransaction(tx, tenantid) {
  await acquireJobCodeLock(tx, tenantid);
  const { nextCode } = await computeNextJobCodeAfterLock(tx, tenantid);
  return nextCode;
}

class JobsWorkflowService {
  buildScope(auth) {
    return { tenantid: Number(auth.tenantid), branchid: Number(auth.branchid) };
  }

  /**
   * Preview max numeric job code and the next code for this organization (tenant).
   * Omit `code` on job create to allocate the next code in the same transaction as insert (recommended).
   */
  async getNextJobCode(auth) {
    const tenantid = Number(auth.tenantid);
    return prisma.$transaction(async (tx) => {
      await acquireJobCodeLock(tx, tenantid);
      return computeNextJobCodeAfterLock(tx, tenantid);
    });
  }

  async jobAccessWhere(auth, extra = {}) {
    const where = { ...this.buildScope(auth), ...extra };
    return applyTechnicianJobScope(auth, where);
  }

  async getScopedJob(auth, id, include = undefined) {
    const row = await prisma.job.findFirst({
      where: await this.jobAccessWhere(auth, { recno: Number(id) }),
      include
    });
    if (!row) throw jobNotFoundError();
    return row;
  }

  async assertQuotedByUser(auth, quotedById) {
    const member = await prisma.userorganizations.findFirst({
      where: {
        userid: Number(quotedById),
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid),
        isblocked: false
      }
    });
    if (!member) {
      const err = new Error(`quotedById ${quotedById} is not a valid user for this branch`);
      err.status = 400;
      throw err;
    }
  }

  async isAdmin(auth) {
    return isJobAdmin(auth);
  }

  async ensureAdmin(auth) {
    const admin = await this.isAdmin(auth);
    if (!admin) throw new Error("Admin approval required");
  }

  async ensureAssignedUser(auth, job) {
    return ensureAssignedTechnicianOrAdmin(auth, job);
  }

  /** One jobdetails row per job — find the canonical record (oldest recno if legacy duplicates exist). */
  async findJobDetail(tx, scope, jobId) {
    return tx.jobdetails.findFirst({
      where: { jobid: Number(jobId), ...scope },
      orderBy: { recno: "asc" }
    });
  }

  /** Update the single job detail row, or create it if missing. */
  async patchJobDetail(tx, auth, scope, jobId, patch = {}) {
    if (!patch || !Object.keys(patch).length) {
      return null;
    }

    const now = utcNow();
    const jobid = Number(jobId);
    const existing = await this.findJobDetail(tx, scope, jobid);

    if (existing) {
      return tx.jobdetails.update({
        where: { recno: existing.recno },
        data: {
          ...patch,
          lastupdatedby: Number(auth.userid),
          lastupdatedat: now
        }
      });
    }

    return tx.jobdetails.create({
      data: {
        jobid,
        ...scope,
        createdby: Number(auth.userid),
        createdat: now,
        lastupdatedby: Number(auth.userid),
        lastupdatedat: now,
        ...patch
      }
    });
  }

  async createAttachmentsFromAction(tx, auth, scope, jobId, payload, contextLabel) {
    const items = payload?._attachmentItems || [];
    if (!items.length) {
      return [];
    }

    const now = utcNow();
    const defaultRemarks = contextLabel ? `Uploaded on ${contextLabel}` : null;
    const created = [];

    for (const item of items) {
      const row = await tx.jobattachments.create({
        data: {
          jobid: Number(jobId),
          ...scope,
          addedby: Number(auth.userid),
          addedat: now,
          attachmentname: item.attachmentname || null,
          url: item.url,
          remarks: item.remarks ?? defaultRemarks
        }
      });
      created.push(row);
    }

    return created;
  }

  async loadJobFormPayload(auth, id) {
    const scope = this.buildScope(auth);
    const job = await prisma.job.findFirst({
      where: await this.jobAccessWhere(auth, { recno: Number(id) }),
      include: buildJobFormInclude()
    });
    if (!job) throw jobNotFoundError();
    const deliveryTypeMap = await loadDeliveryTypeMap(auth, [job]);
    const deliveryRow =
      job.deliverytype != null ? deliveryTypeMap.get(Number(job.deliverytype)) : null;
    const detail = job.jobdetails?.[0] || null;
    const payload = jobToFormPayload(
      job,
      detail,
      job.customers,
      job.jobproducts || [],
      job.jobservices || [],
      {
        deliveryTypeName: deliveryRow?.name ?? null
      }
    );
    payload.approval = await jobApprovalService.getApprovalForJob(auth, job);
    const settings = await jobQuotationSettingsService.loadSettingsRow(scope);
    Object.assign(payload, jobQuotationSettingsService.buildResolvedQuotationFields(job, settings));
    payload.formSettings = await jobFormSettingsService.getSettings(auth, "admin");
    payload.distributorFormSettings = await jobFormSettingsService.getSettings(auth, "distributor");
    return payload;
  }

  async getById(auth, id) {
    return this.loadJobFormPayload(auth, id);
  }

  async create(auth, rawData) {
    const data = normalizeJobRequestBody(rawData);
    const now = utcNow();
    const scope = this.buildScope(auth);
    const formType = normalizeFormType(data.formType ?? data.formtype);
    const formFields = await jobFormSettingsService.getResolvedFields(auth, formType);
    validateJobAgainstFormSettings(data, formFields);

    const payload = buildJobPayload(data);

    const quotationSettings = await jobQuotationSettingsService.loadSettingsRow(scope);
    const payloadWithQuotationDefaults = jobQuotationSettingsService.applyQuotationTextDefaults(
      payload,
      quotationSettings
    );

    const created = await prisma.$transaction(async (tx) => {
      await resolveJobForeignKeys(tx, scope, data, payloadWithQuotationDefaults);
      await applyJobErpProductId(
        tx,
        scope,
        data,
        payloadWithQuotationDefaults,
        quotationSettings?.useerpproducts === true
      );

      let customerid = toNumber(payloadWithQuotationDefaults.customerid);
      if (!customerid && data.customer) {
        customerid = await upsertCustomerFromInput(tx, auth, scope, data.customer);
      }
      if (!customerid) {
        throw new Error("customerid or customer (contactno/phone or name) is required");
      }

      const defaultSubCategory = payloadWithQuotationDefaults.faultid
        ? await tx.jobsubcategories.findFirst({
            where: { subcategoryid: Number(payloadWithQuotationDefaults.faultid), tenantid: scope.tenantid }
          })
        : null;
      const autoAssignedTo =
        payloadWithQuotationDefaults.assignedto || defaultSubCategory?.defaultuser || undefined;

      const statusid = await resolveInitialJobStatusId(tx, scope.tenantid, {
        assignedto: autoAssignedTo,
        explicitStatusId: payloadWithQuotationDefaults.statusid
      });

      const jobFields = { ...payloadWithQuotationDefaults };
      delete jobFields.customerid;
      if (jobFields.code == null || String(jobFields.code).trim() === "") {
        jobFields.code = await nextJobCodeInTransaction(tx, scope.tenantid);
      } else {
        await assertJobCodeUniqueInTenant(tx, scope.tenantid, jobFields.code);
      }

      const jobScalarData = stripJobRelationScalarFields({
        ...jobFields,
        date: payloadWithQuotationDefaults.date || now
      });
      const jobRelationData = buildJobRelationConnectData({
        payload: payloadWithQuotationDefaults,
        scope,
        customerid,
        assignedto: autoAssignedTo,
        statusid
      });

      const job = await tx.job.create({
        data: {
          ...jobScalarData,
          ...jobRelationData
        }
      });

      const addr =
        data.address ?? data.customerAddress ?? data.siteAddress ?? data.customer?.address ?? null;
      const latRaw = data.latitude ?? data.lat ?? data.customer?.latitude ?? null;
      const lngRaw = data.longitude ?? data.lng ?? data.longitutde ?? data.customer?.longitude ?? null;

      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          createdby: Number(auth.userid),
          createdat: now,
          description: data.description || data.complaintDescription || null,
          notes: data.notes || data.complaintNotes || null,
          remarks: mergeJobdetailsRemarks(data),
          address: sliceStr(addr, 50),
          latitude: sliceStr(latRaw, 50),
          longitutde: sliceStr(lngRaw, 50),
          assignedby: autoAssignedTo ? Number(auth.userid) : null,
          assignedat: autoAssignedTo ? now : null,
          assignedremarks: autoAssignedTo ? "Auto/initial assignment" : null
        }
      });

      if (autoAssignedTo) {
        await tx.jobassignmentlog.create({
          data: {
            jobid: job.recno,
            ...scope,
            userid: Number(autoAssignedTo),
            assignedby: Number(auth.userid),
            assignedat: now,
            remarks: "Assigned on complaint creation"
          }
        });
      }

      const productLines = pickProductLines(data).filter(isProductLinePresent);
      if (productLines.length) {
        const rows = await Promise.all(
          productLines.map((line, index) => mapProductLineToDb(tx, scope, job.recno, line, index))
        );
        await tx.jobproducts.createMany({ data: rows });
      }

      const serviceLines = pickServiceLines(data).filter(isServiceLinePresent);
      if (serviceLines.length) {
        if (!jobservicesSupported()) {
          const err = new Error(
            "serviceLines are not available until Prisma client is regenerated (run: npm run db:generate)"
          );
          err.status = 503;
          throw err;
        }
        const rows = await Promise.all(
          serviceLines.map((line, index) => mapServiceLineToDb(tx, scope, job.recno, line, index))
        );
        await tx.jobservices.createMany({ data: rows });
      }

      await recalculateJobTotalCost(tx, scope, job.recno);

      const initialRemarks = collectInitialCreateRemarks(data);
      for (const text of initialRemarks) {
        await appendJobRemark(tx, auth, scope, job.recno, text);
      }

      const jobAddressInput = await resolveJobCustomerAddress(data, payload, auth, scope.tenantid);
      if (jobAddressInput) {
        await ensureCustomerAddressFromJob(tx, {
          customerid,
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          addressInput: jobAddressInput,
          auth
        });
      }

      return job;
    });

    const result = await this.loadJobFormPayload(auth, created.recno);
    await logJobWorkflow(auth, "create", { recno: created.recno, code: result?.code ?? result?.jobNo });
    return result;
  }

  async syncJobProductLines(tx, scope, jobId, data) {
    if (!Object.prototype.hasOwnProperty.call(data, "productLines")) {
      return;
    }

    const jobRecno = Number(jobId);
    const lines = pickProductLines(data).filter(isProductLinePresent);
    const existingRows = await tx.jobproducts.findMany({
      where: { jobid: jobRecno, ...scope },
      select: { recno: true }
    });
    const existingIds = new Set(existingRows.map((row) => row.recno));
    const keptIds = new Set();

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const recno = toNumber(line.recno);
      const rowData = await mapProductLineToDb(tx, scope, jobRecno, line, index);
      const productid = rowData.productid;
      await this.ensureStockIfManaged(scope, productid, rowData.qty);

      if (recno && existingIds.has(recno)) {
        await tx.jobproducts.update({
          where: { recno },
          data: stripLineScopeFields(rowData)
        });
        keptIds.add(recno);
        continue;
      }

      const created = await tx.jobproducts.create({ data: rowData });
      keptIds.add(created.recno);
    }

    const removeIds = [...existingIds].filter((recno) => !keptIds.has(recno));
    if (removeIds.length) {
      await tx.jobproducts.deleteMany({
        where: { recno: { in: removeIds }, jobid: jobRecno, ...scope }
      });
    }
  }

  async syncJobServiceLines(tx, scope, jobId, data) {
    if (!jobservicesSupported()) {
      if (
        Object.prototype.hasOwnProperty.call(data, "serviceLines") &&
        pickServiceLines(data).filter(isServiceLinePresent).length
      ) {
        const err = new Error(
          "serviceLines are not available until Prisma client is regenerated (run: npm run db:generate)"
        );
        err.status = 503;
        throw err;
      }
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(data, "serviceLines")) {
      return;
    }

    const jobRecno = Number(jobId);
    const lines = pickServiceLines(data).filter(isServiceLinePresent);
    const existingRows = await tx.jobservices.findMany({
      where: { jobid: jobRecno, ...scope },
      select: { recno: true }
    });
    const existingIds = new Set(existingRows.map((row) => row.recno));
    const keptIds = new Set();

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const recno = toNumber(line.recno);
      const rowData = await mapServiceLineToDb(tx, scope, jobRecno, line, index);

      if (recno && existingIds.has(recno)) {
        await tx.jobservices.update({
          where: { recno },
          data: stripServiceLineScopeFields(rowData)
        });
        keptIds.add(recno);
        continue;
      }

      const created = await tx.jobservices.create({ data: rowData });
      keptIds.add(created.recno);
    }

    const removeIds = [...existingIds].filter((recno) => !keptIds.has(recno));
    if (removeIds.length) {
      await tx.jobservices.deleteMany({
        where: { recno: { in: removeIds }, jobid: jobRecno, ...scope }
      });
    }
  }

  async upsertJobDetailsOnUpdate(tx, auth, scope, jobId, data) {
    if (!hasJobDetailInput(data)) {
      return;
    }

    const existing = await this.findJobDetail(tx, scope, jobId);
    const patch = buildJobDetailsPatch(data, existing?.remarks ?? null);
    if (!Object.keys(patch).length) {
      return;
    }

    await this.patchJobDetail(tx, auth, scope, jobId, patch);
  }

  async update(auth, id, rawData) {
    const data = normalizeJobRequestBody(rawData);
    const jobId = Number(id);
    const existingJob = await this.getScopedJob(auth, jobId);
    const scope = this.buildScope(auth);
    const payload = buildJobPayload(data);
    const quotationSettings = await jobQuotationSettingsService.loadSettingsRow(scope);

    await prisma.$transaction(async (tx) => {
      await resolveJobForeignKeys(tx, scope, data, payload);
      await applyJobErpProductId(
        tx,
        scope,
        data,
        payload,
        quotationSettings?.useerpproducts === true
      );

      if (data.customer) {
        const customerid = await upsertCustomerFromInput(tx, auth, scope, data.customer);
        if (customerid) {
          payload.customerid = customerid;
        }
      }

      const jobUpdate = { ...payload };
      Object.keys(jobUpdate).forEach((key) => {
        if (jobUpdate[key] === undefined) delete jobUpdate[key];
      });
      const jobUpdateScalarData = stripJobRelationScalarFields(jobUpdate);
      const jobUpdateRelationData = {};
      if (jobUpdate.assignedto !== undefined) {
        jobUpdateRelationData.users =
          jobUpdate.assignedto == null
            ? { disconnect: true }
            : { connect: { userid: Number(jobUpdate.assignedto) } };
      }
      if (jobUpdate.followupby !== undefined) {
        jobUpdateRelationData.followupbyuser =
          jobUpdate.followupby == null
            ? { disconnect: true }
            : { connect: { userid: Number(jobUpdate.followupby) } };
      }
      if (jobUpdate.city !== undefined) {
        jobUpdateRelationData.cities =
          jobUpdate.city == null ? { disconnect: true } : { connect: { recno: Number(jobUpdate.city) } };
      }
      if (jobUpdate.area !== undefined) {
        jobUpdateRelationData.areas =
          jobUpdate.area == null ? { disconnect: true } : { connect: { recno: Number(jobUpdate.area) } };
      }
      if (jobUpdate.serviceid !== undefined) {
        jobUpdateRelationData.jobcategories =
          jobUpdate.serviceid == null
            ? { disconnect: true }
            : { connect: { categoryid: Number(jobUpdate.serviceid) } };
      }
      if (jobUpdate.faultid !== undefined) {
        jobUpdateRelationData.jobsubcategories =
          jobUpdate.faultid == null
            ? { disconnect: true }
            : { connect: { subcategoryid: Number(jobUpdate.faultid) } };
      }
      if (jobUpdate.statusid !== undefined) {
        jobUpdateRelationData.jobstatuses =
          jobUpdate.statusid == null
            ? { disconnect: true }
            : { connect: { recno: Number(jobUpdate.statusid) } };
      }
      if (jobUpdate.customerid !== undefined) {
        jobUpdateRelationData.customers =
          jobUpdate.customerid == null
            ? { disconnect: true }
            : { connect: { customerid: Number(jobUpdate.customerid) } };
      }
      if (jobUpdate.brandid !== undefined) {
        jobUpdateRelationData.brands =
          jobUpdate.brandid == null
            ? { disconnect: true }
            : { connect: { recno: Number(jobUpdate.brandid) } };
      }
      if (jobUpdate.groupid !== undefined) {
        jobUpdateRelationData.jobgroups =
          jobUpdate.groupid == null
            ? { disconnect: true }
            : { connect: { groupid: Number(jobUpdate.groupid) } };
      }
      if (jobUpdate.jobtypeid !== undefined) {
        jobUpdateRelationData.jobtypes =
          jobUpdate.jobtypeid == null
            ? { disconnect: true }
            : { connect: { recno: Number(jobUpdate.jobtypeid) } };
      }
      if (jobUpdate.jobsourceid !== undefined) {
        jobUpdateRelationData.jobsources =
          jobUpdate.jobsourceid == null
            ? { disconnect: true }
            : { connect: { recno: Number(jobUpdate.jobsourceid) } };
      }
      if (jobUpdate.erpproductid !== undefined) {
        jobUpdateRelationData.erpproducts =
          jobUpdate.erpproductid == null
            ? { disconnect: true }
            : { connect: { erpproductid: Number(jobUpdate.erpproductid) } };
      }
      if (jobUpdate.code !== undefined) {
        await assertJobCodeUniqueInTenant(tx, scope.tenantid, jobUpdate.code, jobId);
      }

      if (Object.keys(jobUpdateScalarData).length || Object.keys(jobUpdateRelationData).length) {
        await tx.job.update({
          where: { recno: jobId },
          data: {
            ...jobUpdateScalarData,
            ...jobUpdateRelationData
          }
        });
      }

      await this.upsertJobDetailsOnUpdate(tx, auth, scope, jobId, data);
      await this.syncJobProductLines(tx, scope, jobId, data);
      await this.syncJobServiceLines(tx, scope, jobId, data);

      await recalculateJobTotalCost(tx, scope, jobId);
      await syncJobStatusWithAssignment(tx, scope.tenantid, jobId);
    });

    return this.loadJobFormPayload(auth, jobId);
  }

  formatJobDetailsResponse(row, enrichmentContext = {}) {
    if (!row) return row;
    const remarkRows = row.jobcustomerremarkslog || [];
    const remarks = remarkRows.map(formatJobRemarkRow).filter(Boolean);
    const productLines = mapJobProductLines(row.jobproducts);
    const serviceLines = mapJobServiceLines(row.jobservices);
    const detail = Array.isArray(row.jobdetails)
      ? row.jobdetails[0] ?? null
      : row.jobdetails ?? null;
    const equipmentMain = jobMainEquipmentFields(detail, row.brandid);

    const customerFeedback = formatCustomerFeedbackRow(row.jobcustomerfeedback);

    return {
      ...enrichJobApiRow(row, enrichmentContext),
      brandId: row.brandid ?? equipmentMain.brandId ?? null,
      brandName: row.brands?.name ?? null,
      ...equipmentMain,
      productLines,
      serviceLines,
      totalCost: row.totalcost ?? null,
      remarks,
      remarksTotal: remarks.length,
      customerFeedback,
      jobcustomerfeedback: row.jobcustomerfeedback ?? null,
      jobcustomerremarkslog: remarkRows,
      jobDetail: detail,
      jobdetails: detail ? [detail] : [],
      jobattachments: (row.jobattachments || []).map(formatJobAttachmentRow).filter(Boolean),
      jobassignmentlog: row.jobassignmentlog,
      jobstatuslog: row.jobstatuslog,
      jobtravelhistory: row.jobtravelhistory,
      jobworklhistory: row.jobworklhistory,
      quotationStatusOptions: listQuotationStatusOptions(),
      jobNotes: row.notes ?? null,
      termsAndConditions: row.termsandconditions ?? null,
      ...formatJobErpProductFields(row)
    };
  }

  async details(auth, id) {
    const row = await prisma.job.findFirst({
      where: await this.jobAccessWhere(auth, { recno: Number(id) }),
      include: {
        customers: {
          include: {
            countries: { select: { recno: true, name: true } },
            cities: { select: { recno: true, name: true } },
            areas: { select: { recno: true, name: true } }
          }
        },
        users: true,
        jobstatuses: true,
        jobgroups: { select: { groupid: true, name: true } },
        jobtypes: { select: { recno: true, name: true } },
        jobsources: { select: { recno: true, name: true, description: true } },
        jobcategories: {
          select: {
            categoryid: true,
            name: true,
            groupid: true,
            jobgroups: { select: { groupid: true, name: true } }
          }
        },
        jobsubcategories: {
          select: {
            subcategoryid: true,
            name: true,
            categoryid: true,
            jobcategories: {
              select: {
                categoryid: true,
                name: true,
                groupid: true,
                jobgroups: { select: { groupid: true, name: true } }
              }
            }
          }
        },
        brands: { select: { recno: true, name: true } },
        cities: {
          select: {
            recno: true,
            name: true,
            countryid: true,
            countries: { select: { recno: true, name: true } }
          }
        },
        areas: true,
        jobdetails: { orderBy: { recno: "asc" }, take: 1 },
        jobproducts: JOB_PRODUCT_LINE_INCLUDE,
        ...optionalJobservicesInclude(),
        jobattachments: JOB_ATTACHMENT_INCLUDE,
        jobassignmentlog: { orderBy: { assignedat: "desc" } },
        jobstatuslog: { orderBy: { changedat: "desc" } },
        jobcustomerremarkslog: JOB_REMARK_INCLUDE,
        jobcustomerfeedback: JOB_CUSTOMER_FEEDBACK_INCLUDE,
        jobtravelhistory: true,
        jobworklhistory: true,
        jobquotationstatuslog: QUOTATION_STATUS_LOG_QUERY
      }
    });
    if (!row) throw jobNotFoundError();
    const enrichedRow = await ensureJobCategoryLoaded(auth, row);
    const enrichmentContext = await loadJobListEnrichmentContext(auth, [enrichedRow]);
    const formatted = this.formatJobDetailsResponse(enrichedRow, enrichmentContext);
    const settings = await jobQuotationSettingsService.loadSettingsRow(this.buildScope(auth));
    Object.assign(
      formatted,
      jobQuotationSettingsService.buildResolvedQuotationFields(enrichedRow, settings)
    );
    formatted.quotationStatusHistory = (enrichedRow.jobquotationstatuslog || []).map(
      formatQuotationStatusLogRow
    );
    const jobCashService = require("./job-cash.service");
    Object.assign(formatted, await jobCashService.buildDetailsCashSummary(auth, id));
    return formatted;
  }

  async quotationDetails(auth, id) {
    const job = await prisma.job.findFirst({
      where: await this.jobAccessWhere(auth, { recno: Number(id) }),
      include: {
        customers: true,
        ...QUOTATION_JOB_USER_SELECT,
        jobdetails: { orderBy: { recno: "desc" }, take: 1, select: { remarks: true } },
        jobproducts: JOB_PRODUCT_LINE_INCLUDE,
        ...optionalJobservicesInclude(),
        jobquotationstatuslog: QUOTATION_STATUS_LOG_QUERY
      }
    });
    if (!job) throw jobNotFoundError();

    const productLines = mapJobProductLines(job.jobproducts);
    const serviceLines = mapJobServiceLines(job.jobservices);
    const equipmentMain = jobMainEquipmentFields(job.jobdetails?.[0], job.brandid);
    const allLines = [...productLines, ...serviceLines];
    const subtotal = allLines.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0);
    const totalTax = allLines.reduce((sum, item) => sum + (item.taxamount || 0), 0);
    const totalDiscount = allLines.reduce(
      (sum, item) => sum + (item.discountamount || 0),
      0
    );
    const grandTotal = allLines.reduce((sum, item) => sum + (item.inclusiveamount || 0), 0);
    const statusHistory = (job.jobquotationstatuslog || []).map(formatQuotationStatusLogRow);
    const settings = await jobQuotationSettingsService.loadSettingsRow(this.buildScope(auth));
    const quotationText = jobQuotationSettingsService.buildResolvedQuotationFields(job, settings);

    return {
      job: {
        recno: job.recno,
        code: job.code,
        manualjobno: job.manualjobno,
        date: job.date,
        customer: job.customers,
        brandId: job.brandid ?? equipmentMain.brandId ?? null,
        totalCost: job.totalcost ?? grandTotal,
        ...formatQuotationStatusFields(job.quotationstatus),
        ...formatQuotationQuotedFields(job),
        ...equipmentMain,
        quotationNotes: quotationText.quotationNotes,
        quotationTermsAndConditions: quotationText.quotationTermsAndConditions,
        jobQuotationNotes: quotationText.jobQuotationNotes,
        jobQuotationTermsAndConditions: quotationText.jobQuotationTermsAndConditions
      },
      defaults: {
        notes: quotationText.defaultQuotationNotes,
        termsAndConditions: quotationText.defaultQuotationTermsAndConditions
      },
      quotationStatusOptions: listQuotationStatusOptions(),
      quotationStatusHistory: statusHistory,
      productLines,
      serviceLines,
      totals: { subtotal, totalTax, totalDiscount, grandTotal }
    };
  }

  listQuotationStatusOptions() {
    return listQuotationStatusOptions();
  }

  async getQuotationStatus(auth, id) {
    const job = await this.getScopedJob(auth, id, QUOTATION_JOB_USER_SELECT);
    const logs = await prisma.jobquotationstatuslog.findMany({
      where: { ...this.buildScope(auth), jobid: Number(id) },
      ...QUOTATION_STATUS_LOG_QUERY
    });
    return {
      jobid: job.recno,
      ...formatQuotationStatusFields(job.quotationstatus),
      ...formatQuotationQuotedFields(job),
      options: listQuotationStatusOptions(),
      history: logs.map(formatQuotationStatusLogRow)
    };
  }

  async listQuotationStatusLogs(auth, id) {
    await this.getScopedJob(auth, id);
    const logs = await prisma.jobquotationstatuslog.findMany({
      where: { ...this.buildScope(auth), jobid: Number(id) },
      ...QUOTATION_STATUS_LOG_QUERY
    });
    return logs.map(formatQuotationStatusLogRow);
  }

  async changeQuotationStatus(auth, id, payload = {}) {
    const toStatus = normalizeQuotationStatus(
      payload.quotationStatus ?? payload.quotationstatus ?? payload.status
    );
    const remarks = payload.remarks != null ? String(payload.remarks).trim() : "";
    const parsedQuotedBy = parseQuotedById(payload);
    if (parsedQuotedBy === null) {
      const err = new Error("quotedById must be a valid user id");
      err.status = 400;
      throw err;
    }
    const quotedById =
      parsedQuotedBy === undefined ? Number(auth.userid) : parsedQuotedBy;
    const quotedAt = parseQuotedAt(payload, utcNow());

    if (quotedById == null) {
      const err = new Error("quotedById must be a valid user id");
      err.status = 400;
      throw err;
    }
    if (quotedAt === undefined) {
      const err = new Error("quotedDate must be a valid date/time");
      err.status = 400;
      throw err;
    }

    if (quotationRemarksRequired(toStatus) && !remarks) {
      const err = new Error(
        "remarks are required when quotation status is Quotation Rejected"
      );
      err.status = 400;
      throw err;
    }

    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id, QUOTATION_JOB_USER_SELECT);
    await this.assertQuotedByUser(auth, quotedById);
    const fromStatus = job.quotationstatus ?? null;

    if (fromStatus === toStatus) {
      return {
        message: "Quotation status unchanged",
        jobid: job.recno,
        ...formatQuotationStatusFields(toStatus),
        ...formatQuotationQuotedFields(job),
        log: null
      };
    }

    const log = await prisma.$transaction(async (tx) => {
      const created = await tx.jobquotationstatuslog.create({
        data: {
          jobid: job.recno,
          ...scope,
          fromstatus: fromStatus,
          tostatus: toStatus,
          remarks: remarks || null,
          changedby: Number(auth.userid),
          changedat: now,
          quotedby: quotedById,
          quotedat: quotedAt
        },
        include: QUOTATION_STATUS_LOG_QUERY.include
      });
      await tx.job.update({
        where: { recno: job.recno },
        data: {
          quotationstatus: toStatus,
          quotationquotedby: quotedById,
          quotationquotedat: quotedAt
        }
      });
      return created;
    });

    return {
      message: "Quotation status updated",
      jobid: job.recno,
      ...formatQuotationStatusFields(toStatus),
      ...formatQuotationQuotedFields(log),
      log: formatQuotationStatusLogRow(log)
    };
  }

  async timeline(auth, id) {
    await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    const jobId = Number(id);
    const [job, detail, assignment, statusLog, quotationLog, travel, work, attachments] = await Promise.all([
      prisma.job.findUnique({ where: { recno: jobId } }),
      prisma.jobdetails.findFirst({
        where: { ...scope, jobid: jobId },
        orderBy: { createdat: "asc" },
        select: JOB_DETAIL_CREATED_SELECT
      }),
      prisma.jobassignmentlog.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { assignedat: "asc" },
        ...JOB_ASSIGNMENT_LOG_INCLUDE
      }),
      prisma.jobstatuslog.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { changedat: "asc" },
        ...JOB_STATUS_LOG_INCLUDE
      }),
      prisma.jobquotationstatuslog.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { changedat: "asc" },
        ...QUOTATION_STATUS_LOG_QUERY
      }),
      prisma.jobtravelhistory.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { startedat: "asc" },
        ...JOB_TRAVEL_HISTORY_INCLUDE
      }),
      prisma.jobworklhistory.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { startedat: "asc" },
        ...JOB_WORK_HISTORY_INCLUDE
      }),
      prisma.jobattachments.findMany({
        where: { ...scope, jobid: jobId },
        orderBy: { addedat: "asc" },
        include: JOB_ATTACHMENT_INCLUDE.include
      })
    ]);

    const events = [];
    const createdAt = resolveJobCreatedAt(job, detail);
    const createdEvent = buildJobCreatedEvent(detail, createdAt, toTimelineIso);
    if (createdEvent) {
      events.push(createdEvent);
    }

    assignment.forEach((x) => events.push(buildAssignmentEvent(x, toTimelineIso)));
    statusLog.forEach((x) => {
      const event = buildStatusChangedEvent(x, formatJobStatusLogRow(x), toTimelineIso);
      if (event) events.push(event);
    });
    quotationLog.forEach((x) => {
      const event = buildQuotationStatusChangedEvent(
        x,
        formatQuotationStatusLogRow(x),
        toTimelineIso
      );
      if (event) events.push(event);
    });
    travel.forEach((x) => {
      const started = buildTravelEvent("TRAVEL_STARTED", x, x.startedat, toTimelineIso);
      const stopped = buildTravelEvent("TRAVEL_STOPPED", x, x.stopedat, toTimelineIso);
      if (started) events.push(started);
      if (stopped) events.push(stopped);
    });
    work.forEach((x) => {
      const started = buildWorkEvent("JOB_WORK_STARTED", x, x.startedat, toTimelineIso);
      const stopped = buildWorkEvent("JOB_WORK_STOPPED", x, x.stopedat, toTimelineIso);
      if (started) events.push(started);
      if (stopped) events.push(stopped);
    });
    attachments.forEach((x) => {
      const event = buildAttachmentEvent(x, toTimelineIso);
      if (event) events.push(event);
    });

    return events.sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  async assignTechnician(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    const assignedTo = toNumber(payload.assignedto ?? payload.assignedToId);
    if (!assignedTo) throw new Error("assignedto is required");

    await prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { recno: job.recno }, data: { assignedto: assignedTo } });
      await tx.jobassignmentlog.create({
        data: {
          jobid: job.recno,
          ...scope,
          userid: assignedTo,
          assignedby: Number(auth.userid),
          assignedat: now,
          remarks: payload.remarks || "Technician assigned"
        }
      });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        assignedat: now,
        assignedby: Number(auth.userid),
        assignedremarks: payload.remarks || "Technician assigned"
      });
    });

    pushDispatch.onJobAssigned({ ...job, assignedto: assignedTo }, assignedTo, auth);

    await logJobWorkflow(auth, "assign", job, {
      summary: `Assigned technician to job ${job.code || job.recno}`,
      metadata: { assignedTo }
    });

    return { message: "Technician assigned successfully", jobid: job.recno, assignedto: assignedTo };
  }

  async assignFollowUpBy(auth, id, payload = {}) {
    if (!(await canManageBranchJobs(auth))) {
      const err = new Error("Only an admin or manager can assign follow-up by");
      err.status = 403;
      throw err;
    }

    const job = await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    const hasFollowUpInput =
      Object.prototype.hasOwnProperty.call(payload, "followUpById") ||
      Object.prototype.hasOwnProperty.call(payload, "followupby") ||
      Object.prototype.hasOwnProperty.call(payload, "followUpBy") ||
      Object.prototype.hasOwnProperty.call(payload, "userid");

    if (!hasFollowUpInput) {
      const err = new Error("followUpById is required");
      err.status = 400;
      throw err;
    }

    const rawFollowUp =
      payload.followUpById ?? payload.followupby ?? payload.followUpBy ?? payload.userid;
    const followUpPayload = { followupby: undefined };
    if (rawFollowUp === null || rawFollowUp === "") {
      followUpPayload.followupby = null;
    } else {
      followUpPayload.followupby = toNumber(rawFollowUp);
      if (!followUpPayload.followupby) {
        const err = new Error("followUpById must be a positive integer or null");
        err.status = 400;
        throw err;
      }
    }

    await prisma.$transaction(async (tx) => {
      await resolveJobForeignKeys(tx, scope, payload, followUpPayload);
      await tx.job.update({
        where: { recno: job.recno },
        data: { followupby: followUpPayload.followupby ?? null }
      });
    });

    const followUpBy = followUpPayload.followupby ?? null;

    await logJobWorkflow(auth, followUpBy ? "assign" : "unassign", job, {
      summary: followUpBy
        ? `Assigned follow-up user to job ${job.code || job.recno}`
        : `Cleared follow-up user on job ${job.code || job.recno}`,
      metadata: { followUpBy }
    });

    return {
      message: followUpBy
        ? "Follow-up user assigned successfully"
        : "Follow-up user cleared successfully",
      jobid: job.recno,
      followUpById: followUpBy
    };
  }

  async startTravel(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await ensureAssignedTechnicianOrAdmin(auth, job);
    const scope = this.buildScope(auth);
    const startLoc = pickStartLocation(payload || {});
    const row = await prisma.jobtravelhistory.create({
      data: {
        jobid: job.recno,
        ...scope,
        traveledby: Number(auth.userid),
        startedat: now,
        ...startLoc,
        remarks: pickRemarks(payload, "Travel started")
      }
    });

    pushDispatch.onTravelStarted(job, auth);

    return {
      message: "Travel started",
      jobid: job.recno,
      travelHistoryId: row.recno,
      ...locationFromPayload(payload || {}),
      remarks: row.remarks
    };
  }

  async stopTravel(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const jobId = Number(id);
    const job = await this.getScopedJob(auth, jobId);
    await ensureAssignedTechnicianOrAdmin(auth, job);
    const stopLoc = pickStopLocation(payload || {});
    const travelWhere = { ...scope, jobid: jobId, stopedat: null };
    if (!(await this.isAdmin(auth))) {
      travelWhere.traveledby = Number(auth.userid);
    }
    const open = await prisma.jobtravelhistory.findFirst({
      where: travelWhere,
      orderBy: { recno: "desc" }
    });
    if (!open) throw new Error("No active travel session found");
    const updated = await prisma.jobtravelhistory.update({
      where: { recno: open.recno },
      data: {
        stopedat: now,
        ...stopLoc,
        remarks: pickRemarks(payload, open.remarks)
      }
    });

    pushDispatch.onTravelStopped(job, auth);

    return {
      message: "Travel stopped",
      jobid: jobId,
      travelHistoryId: open.recno,
      ...locationFromPayload(payload || {}),
      remarks: updated.remarks
    };
  }

  async startJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAssignedUser(auth, job);
    const scope = this.buildScope(auth);
    const startLoc = pickStartLocation(payload || {});
    let attachmentRows = [];
    let workHistoryId = null;

    await prisma.$transaction(async (tx) => {
      const open = await tx.jobworklhistory.findFirst({
        where: {
          ...scope,
          jobid: job.recno,
          workedby: Number(auth.userid),
          stopedat: null
        },
        orderBy: { recno: "desc" }
      });
      if (open) {
        const err = new Error(
          "An active work session is already in progress. Stop it before starting again."
        );
        err.status = 409;
        throw err;
      }

      const workRow = await tx.jobworklhistory.create({
        data: {
          jobid: job.recno,
          ...scope,
          workedby: Number(auth.userid),
          startedat: now,
          ...startLoc,
          remarks: pickRemarks(payload, "Job started")
        }
      });
      workHistoryId = workRow.recno;

      if (job.isfirstresponse !== true) {
        await tx.job.update({
          where: { recno: job.recno },
          data: { isfirstresponse: true }
        });
        await this.patchJobDetail(tx, auth, scope, job.recno, {
          firstresponseby: Number(auth.userid),
          firstresponseat: now,
          firstresponseremarks: payload.remarks || "Job started"
        });
      }

      attachmentRows = await this.createAttachmentsFromAction(
        tx,
        auth,
        scope,
        job.recno,
        payload,
        "job start"
      );
    });

    const attachments = attachmentRows.map(formatJobAttachmentRow);
    pushDispatch.onJobStarted(job, auth);
    attachmentRows.forEach((row) =>
      pushDispatch.onJobAttachment(job, auth, row.attachmentname)
    );

    return {
      message: "Job work started",
      jobid: job.recno,
      workHistoryId,
      ...locationFromPayload(payload || {}),
      remarks: pickRemarks(payload, "Job started"),
      attachments,
      attachmentsTotal: attachments.length
    };
  }

  async stopJob(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const jobId = Number(id);
    const job = await this.getScopedJob(auth, jobId);
    await ensureAssignedTechnicianOrAdmin(auth, job);
    const stopLoc = pickStopLocation(payload || {});
    const adminActor = await this.isAdmin(auth);
    let attachmentRows = [];
    let updated = null;

    await prisma.$transaction(async (tx) => {
      const workWhere = { ...scope, jobid: jobId, stopedat: null };
      if (!adminActor) {
        workWhere.workedby = Number(auth.userid);
      }
      const open = await tx.jobworklhistory.findFirst({
        where: workWhere,
        orderBy: { recno: "desc" }
      });
      if (!open) {
        const err = new Error("No active work session found");
        err.status = 409;
        throw err;
      }

      updated = await tx.jobworklhistory.update({
        where: { recno: open.recno },
        data: {
          stopedat: now,
          ...stopLoc,
          remarks: pickRemarks(payload, open.remarks || "Job stopped")
        }
      });

      attachmentRows = await this.createAttachmentsFromAction(
        tx,
        auth,
        scope,
        jobId,
        payload,
        "job stop"
      );
    });

    const attachments = attachmentRows.map(formatJobAttachmentRow);
    pushDispatch.onJobWorkStopped(job, auth, pickRemarks(payload, updated.remarks));
    attachmentRows.forEach((row) =>
      pushDispatch.onJobAttachment(job, auth, row.attachmentname)
    );

    return {
      message: "Job work stopped",
      jobid: jobId,
      workHistoryId: updated.recno,
      ...locationFromPayload(payload || {}),
      remarks: updated.remarks,
      attachments,
      attachmentsTotal: attachments.length
    };
  }

  async completeJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAssignedUser(auth, job);
    const scope = this.buildScope(auth);
    const stopLoc = pickStopLocation(payload || {});
    const feedbackInput = parseCustomerFeedbackInput(payload || {});
    let feedbackRecno = null;
    let attachmentRows = [];

    const adminActor = await this.isAdmin(auth);
    let statusChange = null;
    const completionRemarks = pickRemarks(payload, "Job completed");
    await prisma.$transaction(async (tx) => {
      const workWhere = { ...scope, jobid: job.recno, stopedat: null };
      if (!adminActor) {
        workWhere.workedby = Number(auth.userid);
      }
      const open = await tx.jobworklhistory.findFirst({
        where: workWhere,
        orderBy: { recno: "desc" }
      });
      if (open) {
        await tx.jobworklhistory.update({
          where: { recno: open.recno },
          data: { stopedat: now, ...stopLoc, remarks: pickRemarks(payload, open.remarks) }
        });
      }
      await tx.job.update({ where: { recno: job.recno }, data: { iscompleted: true } });
      statusChange = await applyCompletedJobStatus(tx, scope, job, auth, {
        changedAt: now,
        remarks: completionRemarks
      });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        completedby: Number(auth.userid),
        completedat: now,
        completedremarks: payload.remarks || "Job completed"
      });
      if (feedbackInput) {
        const fb = await upsertJobCustomerFeedback(tx, auth, scope, job.recno, payload || {});
        feedbackRecno = fb?.recno ?? null;
      }
      attachmentRows = await this.createAttachmentsFromAction(
        tx,
        auth,
        scope,
        job.recno,
        payload,
        "job complete"
      );
    });

    let customerFeedback = null;
    if (feedbackRecno) {
      const row = await prisma.jobcustomerfeedback.findFirst({
        where: { recno: feedbackRecno, jobid: job.recno },
        ...JOB_CUSTOMER_FEEDBACK_INCLUDE
      });
      customerFeedback = formatCustomerFeedbackRow(row);
    }

    const attachments = attachmentRows.map(formatJobAttachmentRow);

    pushDispatch.onJobWorkStopped(job, auth, completionRemarks, customerFeedback);
    if (statusChange) {
      pushDispatch.onJobStatusChanged(
        job,
        auth,
        statusChange.fromStatus,
        statusChange.toStatus,
        completionRemarks
      );
    }
    pushDispatch.onJobCompleted(job, auth, customerFeedback);
    attachmentRows.forEach((row) =>
      pushDispatch.onJobAttachment(job, auth, row.attachmentname)
    );

    let cpairAutoReceive = null;
    try {
      const jobCpairService = require("./job-cpair.service");
      cpairAutoReceive = await jobCpairService.tryAutoReceiveOnJobComplete(auth, job.recno);
    } catch (err) {
      cpairAutoReceive = { enabled: true, error: err.message };
    }

    await logJobWorkflow(auth, "complete", job, {
      summary: `Completed job ${job.code || job.recno}`
    });

    return {
      message: "Job completed",
      jobid: job.recno,
      ...locationFromPayload(payload || {}),
      remarks: pickRemarks(payload, "Job completed"),
      customerFeedback,
      attachments,
      attachmentsTotal: attachments.length,
      cpairAutoReceive
    };
  }

  async resolveJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAssignedUser(auth, job);
    const scope = this.buildScope(auth);
    let attachmentRows = [];

    await prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { recno: job.recno }, data: { isresolved: true } });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        resolvedby: Number(auth.userid),
        resolvedat: now,
        resolvedremarks: payload.remarks || "Job resolved"
      });
      attachmentRows = await this.createAttachmentsFromAction(
        tx,
        auth,
        scope,
        job.recno,
        payload,
        "job resolve"
      );
    });

    const attachments = attachmentRows.map(formatJobAttachmentRow);

    pushDispatch.onJobResolved(job, auth);
    attachmentRows.forEach((row) =>
      pushDispatch.onJobAttachment(job, auth, row.attachmentname)
    );

    await logJobWorkflow(auth, "resolve", job, {
      summary: `Resolved job ${job.code || job.recno}`
    });

    return {
      message: "Job resolved",
      jobid: job.recno,
      remarks: pickRemarks(payload, "Job resolved"),
      attachments,
      attachmentsTotal: attachments.length
    };
  }

  async closeJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: job.recno },
        data: {
          iscompleted: true,
          isresolved: true,
          qualityassuerd: true,
          isacknowledged: true
        }
      });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        qualityassuerdby: Number(auth.userid),
        qualityassuerdat: now,
        qualityassuerdremarks: payload.qualityRemarks || payload.remarks || "Quality assured",
        acknowledgedby: Number(auth.userid),
        acknowledgedat: now,
        acknowledgedremarks: payload.acknowledgeRemarks || payload.remarks || "Job closed"
      });
    });

    let cpairAutoReceive = null;
    try {
      const jobCpairService = require("./job-cpair.service");
      cpairAutoReceive = await jobCpairService.tryAutoReceiveOnJobComplete(auth, job.recno);
    } catch (err) {
      cpairAutoReceive = { enabled: true, error: err.message };
    }

    return { message: "Job closed", jobid: job.recno, cpairAutoReceive };
  }

  async listAttachments(auth, id) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const data = await prisma.jobattachments.findMany({
      where: {
        ...scope,
        jobid: Number(job.recno)
      },
      ...JOB_ATTACHMENT_INCLUDE
    });
    const formatted = data.map(formatJobAttachmentRow).filter(Boolean);
    return { jobid: Number(job.recno), total: formatted.length, data: formatted };
  }

  async getAttachment(auth, id, attachmentId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const row = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      },
      include: JOB_ATTACHMENT_INCLUDE.include
    });
    if (!row) throw new Error("Attachment not found");
    return formatJobAttachmentRow(row);
  }

  async createAttachment(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    if (!payload?.attachmentname && !payload?.url) {
      throw new Error("attachmentname or url is required");
    }

    const row = await prisma.jobattachments.create({
      data: {
        jobid: Number(job.recno),
        ...scope,
        addedby: Number(auth.userid),
        addedat: utcNow(),
        attachmentname: payload.attachmentname || null,
        url: payload.url || null,
        remarks: payload.remarks || null
      },
      include: JOB_ATTACHMENT_INCLUDE.include
    });

    pushDispatch.onJobAttachment(job, auth, row.attachmentname || payload.url);

    return formatJobAttachmentRow(row);
  }

  async updateAttachment(auth, id, attachmentId, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      }
    });
    if (!existing) throw new Error("Attachment not found");

    const row = await prisma.jobattachments.update({
      where: { recno: Number(attachmentId) },
      data: {
        attachmentname: payload.attachmentname !== undefined ? payload.attachmentname : existing.attachmentname,
        url: payload.url !== undefined ? payload.url : existing.url,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
      },
      include: JOB_ATTACHMENT_INCLUDE.include
    });
    return formatJobAttachmentRow(row);
  }

  async deleteAttachment(auth, id, attachmentId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      }
    });
    if (!existing) throw new Error("Attachment not found");

    await prisma.jobattachments.delete({
      where: { recno: Number(attachmentId) }
    });
    return { message: "Attachment deleted", recno: Number(attachmentId), jobid: Number(job.recno) };
  }

  async listAssignments(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobassignmentlog.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async createAssignment(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const assignedTo = toNumber(payload.userid || payload.assignedto);
    if (!assignedTo) throw new Error("userid is required");

    const result = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { assignedto: assignedTo }
      });
      return tx.jobassignmentlog.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          userid: assignedTo,
          assignedby: Number(auth.userid),
          assignedat: now,
          remarks: payload.remarks || null
        }
      });
    });

    pushDispatch.onJobAssigned({ ...job, assignedto: assignedTo }, assignedTo, auth);

    return result;
  }

  async updateAssignment(auth, id, assignmentId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobassignmentlog.findFirst({
      where: { ...scope, recno: Number(assignmentId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Assignment log not found");

    const userid = payload.userid !== undefined ? toNumber(payload.userid) : existing.userid;
    const assignedat = payload.assignedat !== undefined ? toDate(payload.assignedat) : existing.assignedat;

    const updated = await prisma.jobassignmentlog.update({
      where: { recno: Number(assignmentId) },
      data: {
        userid,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks,
        assignedat
      }
    });

    if (userid) {
      await prisma.job.update({
        where: { recno: Number(id) },
        data: { assignedto: userid }
      });
    }
    return updated;
  }

  async deleteAssignment(auth, id, assignmentId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobassignmentlog.findFirst({
      where: { ...scope, recno: Number(assignmentId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Assignment log not found");
    await prisma.jobassignmentlog.delete({ where: { recno: Number(assignmentId) } });
    return { message: "Assignment log deleted", recno: Number(assignmentId) };
  }

  async listStatusLogs(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobstatuslog.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async createStatusLog(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const tostatus = toNumber(payload.tostatus || payload.statusid);
    if (!tostatus) throw new Error("tostatus is required");

    const fromStatus = toNumber(payload.fromstatus) || job.statusid || null;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.jobstatuslog.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          fromstatus: fromStatus,
          tostatus,
          remarks: payload.remarks || null,
          changedby: Number(auth.userid),
          changedat: now
        }
      });
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { statusid: tostatus }
      });
      await syncJobStatusWithAssignment(tx, scope.tenantid, job.recno);
      return row;
    });

    pushDispatch.onJobStatusChanged(job, auth, fromStatus, tostatus, payload.remarks);

    return created;
  }

  async updateStatusLog(auth, id, statusLogId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobstatuslog.findFirst({
      where: { ...scope, recno: Number(statusLogId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Status log not found");

    const tostatus = payload.tostatus !== undefined ? toNumber(payload.tostatus) : existing.tostatus;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.jobstatuslog.update({
        where: { recno: Number(statusLogId) },
        data: {
          fromstatus: payload.fromstatus !== undefined ? toNumber(payload.fromstatus) : existing.fromstatus,
          tostatus,
          remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
        }
      });

      if (tostatus) {
        await tx.job.update({
          where: { recno: Number(id) },
          data: { statusid: tostatus }
        });
      }

      await syncJobStatusWithAssignment(tx, scope.tenantid, id);
      return row;
    });
    return updated;
  }

  async deleteStatusLog(auth, id, statusLogId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobstatuslog.findFirst({
      where: { ...scope, recno: Number(statusLogId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Status log not found");
    await prisma.jobstatuslog.delete({ where: { recno: Number(statusLogId) } });
    return { message: "Status log deleted", recno: Number(statusLogId) };
  }

  async listTravelHistory(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobtravelhistory.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async listWorkHistory(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobworklhistory.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async ensureStockIfManaged(scope, productid, qty) {
    if (!productid || !qty || qty <= 0) return;
    const product = await prisma.products.findFirst({
      where: { ...scope, productid: Number(productid) },
      select: { productid: true, name: true, managestock: true }
    });
    if (!product || product.managestock !== true) return;

    // No inventory master table exists in current schema; use consumed quantity guard baseline.
    const consumed = await prisma.jobproducts.aggregate({
      where: { ...scope, productid: Number(productid) },
      _sum: { qty: true }
    });
    const consumedQty = Number(consumed._sum.qty || 0);
    const availableStock = toNumber(process.env.DEFAULT_MANAGED_STOCK_QTY || 0);
    if (availableStock > 0 && consumedQty + Number(qty) > availableStock) {
      throw new Error(`Insufficient stock for managed product: ${product.name || product.productid}`);
    }
  }

  async listProducts(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const rows = await prisma.jobproducts.findMany({
      where: { ...scope, jobid: Number(id) },
      ...JOB_PRODUCT_LINE_INCLUDE
    });
    return mapJobProductLines(rows);
  }

  async createProduct(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const qty = Number(payload.qty || 0);

    return prisma.$transaction(async (tx) => {
      const productid = await resolveJobLineProductId(tx, scope.tenantid, payload.productid);
      await this.ensureStockIfManaged(scope, productid, qty);

      const lineCount = await tx.jobproducts.count({ where: { jobid: Number(job.recno), ...scope } });
      const created = await tx.jobproducts.create({
        data: await mapProductLineToDb(tx, scope, Number(job.recno), payload, lineCount)
      });
      await recalculateJobTotalCost(tx, scope, job.recno);
      const withRelations = await tx.jobproducts.findFirst({
        where: { recno: created.recno },
        ...JOB_PRODUCT_LINE_INCLUDE
      });
      return mapProductLineToForm(withRelations || created);
    });
  }

  async updateProduct(auth, id, productLineId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobproducts.findFirst({
      where: { ...scope, recno: Number(productLineId), jobid: Number(id) },
      ...JOB_PRODUCT_LINE_INCLUDE
    });
    if (!existing) throw new Error("Job product line not found");

    const merged = {
      ...mapProductLineToForm(existing),
      ...payload,
      productid: payload.productid !== undefined ? payload.productid : existing.productid,
      lineno: payload.lineno !== undefined ? payload.lineno : existing.lineno
    };
    const qty = merged.qty !== undefined ? Number(merged.qty || 0) : Number(existing.qty || 0);

    return prisma.$transaction(async (tx) => {
      const productid = await resolveJobLineProductId(tx, scope.tenantid, merged.productid);
      await this.ensureStockIfManaged(scope, productid, qty);

      const data = await mapProductLineToDb(tx, scope, Number(id), merged, (merged.lineno || 1) - 1);
      delete data.jobid;
      delete data.tenantid;
      delete data.branchid;

      const row = await tx.jobproducts.update({
        where: { recno: Number(productLineId) },
        data
      });
      await recalculateJobTotalCost(tx, scope, Number(id));
      const withRelations = await tx.jobproducts.findFirst({
        where: { recno: row.recno },
        ...JOB_PRODUCT_LINE_INCLUDE
      });
      return mapProductLineToForm(withRelations || row);
    });
  }

  async deleteProduct(auth, id, productLineId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobproducts.findFirst({
      where: { ...scope, recno: Number(productLineId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Job product line not found");
    await prisma.$transaction(async (tx) => {
      await tx.jobproducts.delete({ where: { recno: Number(productLineId) } });
      await recalculateJobTotalCost(tx, scope, job.recno);
    });
    return { message: "Job product deleted", recno: Number(productLineId) };
  }

  async listServices(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const rows = await prisma.jobservices.findMany({
      where: { ...scope, jobid: Number(id) },
      ...JOB_SERVICE_LINE_INCLUDE
    });
    return mapJobServiceLines(rows);
  }

  async createService(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);

    return prisma.$transaction(async (tx) => {
      const lineCount = await tx.jobservices.count({ where: { jobid: Number(job.recno), ...scope } });
      const created = await tx.jobservices.create({
        data: await mapServiceLineToDb(tx, scope, Number(job.recno), payload, lineCount)
      });
      await recalculateJobTotalCost(tx, scope, job.recno);
      const withRelations = await tx.jobservices.findFirst({
        where: { recno: created.recno },
        ...JOB_SERVICE_LINE_INCLUDE
      });
      return mapServiceLineToForm(withRelations || created);
    });
  }

  async updateService(auth, id, serviceLineId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobservices.findFirst({
      where: { ...scope, recno: Number(serviceLineId), jobid: Number(id) },
      ...JOB_SERVICE_LINE_INCLUDE
    });
    if (!existing) throw new Error("Job service line not found");

    const merged = {
      ...mapServiceLineToForm(existing),
      ...payload,
      productid: payload.productid !== undefined ? payload.productid : existing.productid,
      lineno: payload.lineno !== undefined ? payload.lineno : existing.lineno
    };

    return prisma.$transaction(async (tx) => {
      const data = await mapServiceLineToDb(tx, scope, Number(id), merged, (merged.lineno || 1) - 1);
      delete data.jobid;
      delete data.tenantid;
      delete data.branchid;

      const row = await tx.jobservices.update({
        where: { recno: Number(serviceLineId) },
        data
      });
      await recalculateJobTotalCost(tx, scope, Number(id));
      const withRelations = await tx.jobservices.findFirst({
        where: { recno: row.recno },
        ...JOB_SERVICE_LINE_INCLUDE
      });
      return mapServiceLineToForm(withRelations || row);
    });
  }

  async deleteService(auth, id, serviceLineId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobservices.findFirst({
      where: { ...scope, recno: Number(serviceLineId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Job service line not found");
    await prisma.$transaction(async (tx) => {
      await tx.jobservices.delete({ where: { recno: Number(serviceLineId) } });
      await recalculateJobTotalCost(tx, scope, job.recno);
    });
    return { message: "Job service deleted", recno: Number(serviceLineId) };
  }

  async listJobRemarks(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const rows = await prisma.jobcustomerremarkslog.findMany({
      where: { ...scope, jobid: Number(id) },
      ...JOB_REMARK_INCLUDE
    });
    return rows.map(formatJobRemarkRow);
  }

  async listCustomerRemarks(auth, id) {
    return this.listJobRemarks(auth, id);
  }

  async createJobRemark(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const texts = remarkTextsFromPayload(payload);
    if (!texts.length) {
      throw new Error("remarks (or comment) is required");
    }
    const created = [];
    await prisma.$transaction(async (tx) => {
      for (const text of texts) {
        const row = await appendJobRemark(tx, auth, scope, job.recno, text);
        if (row) created.push(row);
      }
    });
    const withUsers = await prisma.jobcustomerremarkslog.findMany({
      where: { recno: { in: created.map((r) => r.recno) } },
      ...JOB_REMARK_INCLUDE
    });
    const formatted = withUsers.map(formatJobRemarkRow);

    texts.forEach((text) => pushDispatch.onJobComment(job, auth, text));

    return formatted.length === 1 ? formatted[0] : formatted;
  }

  async createCustomerRemark(auth, id, payload) {
    return this.createJobRemark(auth, id, payload);
  }

  async updateCustomerRemark(auth, id, remarkId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobcustomerremarkslog.findFirst({
      where: { ...scope, recno: Number(remarkId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Customer remark not found");
    const text = remarkTextFromPayload(payload) ?? payload.remarks;
    const updated = await prisma.jobcustomerremarkslog.update({
      where: { recno: Number(remarkId) },
      data: {
        remarks: text !== undefined && text !== null ? text : existing.remarks
      },
      ...JOB_REMARK_INCLUDE
    });
    return formatJobRemarkRow(updated);
  }

  async updateJobRemark(auth, id, remarkId, payload) {
    return this.updateCustomerRemark(auth, id, remarkId, payload);
  }

  async deleteCustomerRemark(auth, id, remarkId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobcustomerremarkslog.findFirst({
      where: { ...scope, recno: Number(remarkId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Customer remark not found");
    await prisma.jobcustomerremarkslog.delete({ where: { recno: Number(remarkId) } });
    return { message: "Remark deleted", recno: Number(remarkId) };
  }

  async deleteJobRemark(auth, id, remarkId) {
    return this.deleteCustomerRemark(auth, id, remarkId);
  }

  async getCustomerFeedback(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const row = await prisma.jobcustomerfeedback.findFirst({
      where: { ...scope, jobid: Number(id) },
      ...JOB_CUSTOMER_FEEDBACK_INCLUDE
    });
    return formatCustomerFeedbackRow(row);
  }

  async saveCustomerFeedback(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    if (!parseCustomerFeedbackInput(payload || {})) {
      const err = new Error("customerFeedback with rating (0-5) is required");
      err.status = 400;
      throw err;
    }

    await prisma.$transaction(async (tx) => {
      await upsertJobCustomerFeedback(tx, auth, scope, job.recno, payload || {});
    });

    const row = await prisma.jobcustomerfeedback.findFirst({
      where: { jobid: job.recno },
      ...JOB_CUSTOMER_FEEDBACK_INCLUDE
    });
    return formatCustomerFeedbackRow(row);
  }

  async updateFirstResponse(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { isfirstresponse: true }
      });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        firstresponseby: Number(auth.userid),
        firstresponseat: payload.firstresponseat ? toDate(payload.firstresponseat) : now,
        firstresponseremarks: payload.remarks || "First response updated"
      });
    });
    return { message: "First response updated", jobid: Number(job.recno) };
  }

  async acknowledgeCustomer(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { isacknowledged: true }
      });
      await this.patchJobDetail(tx, auth, scope, job.recno, {
        acknowledgedby: Number(auth.userid),
        acknowledgedat: payload.acknowledgedat ? toDate(payload.acknowledgedat) : now,
        acknowledgedremarks: payload.remarks || "Customer acknowledged"
      });
    });
    return { message: "Customer acknowledgement updated", jobid: Number(job.recno) };
  }
}

module.exports = new JobsWorkflowService();
