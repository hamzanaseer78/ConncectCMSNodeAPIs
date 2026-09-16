const prisma = require("../database/prisma");
const {
  flattenJobRelationLabels,
  buildJobHierarchyFields,
  resolveJobCategoryRelation
} = require("./job-response-labels");
const { formatJobErpProductFields } = require("./erp-product-payload");

const STRIP_EXTRA_LOWERCASE = ["city", "area", "deliverytype", "jobtypeid", "jobsourceid", "quotationstatus"];

/**
 * Enrich a job row for API responses (list, details).
 */
function enrichJobApiRow(job, context = {}) {
  if (!job) return job;

  const labeled = flattenJobRelationLabels(job);
  const hierarchy = buildJobHierarchyFields(job);
  const nameMaps = context.relationNameMaps || {};
  const serviceName =
    hierarchy.serviceName ??
    (hierarchy.serviceId != null
      ? nameMaps.serviceNames?.get(Number(hierarchy.serviceId)) ?? null
      : null);
  const categoryName =
    hierarchy.categoryName ??
    (hierarchy.categoryId != null
      ? nameMaps.categoryNames?.get(Number(hierarchy.categoryId)) ?? null
      : null);
  const faultName =
    hierarchy.faultName ??
    (hierarchy.faultId != null
      ? nameMaps.faultNames?.get(Number(hierarchy.faultId)) ?? null
      : null);

  const st = job.jobstatuses;
  const c = job.customers;
  const cityRel = job.cities;
  const areaRel = job.areas;
  const customerCity = c?.cities;
  const customerArea = c?.areas;
  const customerCountry = c?.countries;
  const countryFromJobCity = cityRel?.countries;

  const deliveryTypeMap = context.deliveryTypeMap;
  const deliveryTypeId = job.deliverytype ?? null;
  const deliveryRow =
    deliveryTypeId != null && deliveryTypeMap?.get
      ? deliveryTypeMap.get(Number(deliveryTypeId))
      : null;

  const row = {
    ...labeled,
    serviceId: hierarchy.serviceId,
    serviceName,
    categoryId: hierarchy.categoryId,
    categoryName,
    faultId: hierarchy.faultId,
    faultName,
    statusColor: st?.color ?? null,
    phoneNo: c?.contactno ?? null,
    contactno: c?.contactno ?? null,
    deliveryTypeId,
    deliveryTypeName: deliveryRow?.name ?? null,
    cityId: job.city ?? cityRel?.recno ?? c?.city ?? customerCity?.recno ?? null,
    cityName: cityRel?.name ?? customerCity?.name ?? null,
    areaId: job.area ?? areaRel?.recno ?? c?.area ?? customerArea?.recno ?? null,
    areaName: areaRel?.name ?? customerArea?.name ?? null,
    countryId:
      countryFromJobCity?.recno ??
      cityRel?.countryid ??
      customerCountry?.recno ??
      c?.country ??
      null,
    countryName: countryFromJobCity?.name ?? customerCountry?.name ?? null,
    ...formatJobErpProductFields(job)
  };

  STRIP_EXTRA_LOWERCASE.forEach((key) => {
    delete row[key];
  });

  return row;
}

async function loadDeliveryTypeMap(auth, jobs = []) {
  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  if (tenantid == null || !Number.isFinite(tenantid)) {
    return new Map();
  }

  const ids = [
    ...new Set(
      jobs
        .map((j) => j.deliverytype)
        .filter((id) => id != null && id !== "")
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  ];

  if (!ids.length) {
    return new Map();
  }

  const rows = await prisma.deliverytypes.findMany({
    where: { tenantid, recno: { in: ids } },
    select: { recno: true, name: true }
  });

  return new Map(rows.map((r) => [r.recno, r]));
}

/** Load category/subcategory names when Prisma relations are missing but FK ids exist. */
async function loadJobRelationNameMaps(auth, jobs = []) {
  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  if (tenantid == null || !Number.isFinite(tenantid) || !jobs.length) {
    return {
      serviceNames: new Map(),
      categoryNames: new Map(),
      faultNames: new Map()
    };
  }

  const serviceIds = new Set();
  const categoryIds = new Set();
  const faultIds = new Set();

  jobs.forEach((job) => {
    const fields = buildJobHierarchyFields(job);
    if (fields.serviceId != null && !fields.serviceName) {
      serviceIds.add(Number(fields.serviceId));
    }
    if (fields.categoryId != null && !fields.categoryName) {
      categoryIds.add(Number(fields.categoryId));
    }
    if (fields.faultId != null && !fields.faultName) {
      faultIds.add(Number(fields.faultId));
    }
  });

  const [groups, categories, faults] = await Promise.all([
    serviceIds.size
      ? prisma.jobgroups.findMany({
          where: { tenantid, groupid: { in: [...serviceIds] } },
          select: { groupid: true, name: true }
        })
      : [],
    categoryIds.size
      ? prisma.jobcategories.findMany({
          where: { tenantid, categoryid: { in: [...categoryIds] } },
          select: { categoryid: true, name: true }
        })
      : [],
    faultIds.size
      ? prisma.jobsubcategories.findMany({
          where: { tenantid, subcategoryid: { in: [...faultIds] } },
          select: { subcategoryid: true, name: true }
        })
      : []
  ]);

  return {
    serviceNames: new Map(groups.map((r) => [r.groupid, r.name ?? null])),
    categoryNames: new Map(categories.map((r) => [r.categoryid, r.name ?? null])),
    faultNames: new Map(faults.map((r) => [r.subcategoryid, r.name ?? null]))
  };
}

async function loadJobListEnrichmentContext(auth, jobs = []) {
  const [deliveryTypeMap, relationNameMaps] = await Promise.all([
    loadDeliveryTypeMap(auth, jobs),
    loadJobRelationNameMaps(auth, jobs)
  ]);
  return { deliveryTypeMap, relationNameMaps };
}

async function ensureJobCategoryLoaded(auth, job) {
  if (!job || resolveJobCategoryRelation(job)) {
    return job;
  }

  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  const categoryId = job.serviceid ?? job.jobsubcategories?.categoryid;
  if (tenantid == null || categoryId == null) {
    return job;
  }

  const category = await prisma.jobcategories.findFirst({
    where: { categoryid: Number(categoryId), tenantid },
    select: {
      categoryid: true,
      name: true,
      groupid: true,
      jobgroups: { select: { groupid: true, name: true } }
    }
  });

  return category ? { ...job, jobcategories: category } : job;
}

module.exports = {
  enrichJobApiRow,
  loadDeliveryTypeMap,
  loadJobRelationNameMaps,
  loadJobListEnrichmentContext,
  ensureJobCategoryLoaded
};
