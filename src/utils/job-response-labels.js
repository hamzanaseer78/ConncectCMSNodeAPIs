/** DB column names replaced by camelCase id fields on API responses. */
const {
  formatQuotationStatusFields
} = require("./quotation-status");

const STRIP_LOWERCASE_FK = [
  "customerid",
  "assignedto",
  "followupby",
  "statusid",
  "groupid",
  "serviceid",
  "faultid",
  "brandid",
  "jobtypeid",
  "jobsourceid"
];

function resolveJobCategoryRelation(job) {
  return job?.jobcategories ?? job?.jobsubcategories?.jobcategories ?? null;
}

/**
 * Canonical hierarchy for jobs:
 * - serviceId/serviceName => job group (jobgroups.groupid/name)
 * - categoryId/categoryName => job category (jobcategories.categoryid/name)
 * - faultId/faultName => job sub category (jobsubcategories.subcategoryid/name)
 */
function buildJobHierarchyFields(job) {
  if (!job) {
    return {
      serviceId: null,
      serviceName: null,
      categoryId: null,
      categoryName: null,
      faultId: null,
      faultName: null
    };
  }

  const cat = resolveJobCategoryRelation(job);
  const sub = job.jobsubcategories ?? null;
  const grp = job.jobgroups ?? cat?.jobgroups ?? null;
  const serviceId = grp?.groupid ?? cat?.groupid ?? null;
  const serviceName = grp?.name ?? null;
  const categoryId = cat?.categoryid ?? job.serviceid ?? sub?.categoryid ?? null;
  const categoryName = cat?.name ?? null;
  const faultId = sub?.subcategoryid ?? job.faultid ?? null;
  const faultName = sub?.name ?? null;

  return {
    serviceId,
    serviceName,
    categoryId,
    categoryName,
    faultId,
    faultName
  };
}

/**
 * Flat job row with camelCase id + name fields (list, details, create/update responses).
 */
function flattenJobRelationLabels(job) {
  if (!job) return job;

  const c = job.customers;
  const u = job.users;
  const followUpUser = job.followupbyuser;
  const st = job.jobstatuses;
  const brand = job.brands;
  const jobType = job.jobtypes;
  const jobSource = job.jobsources;
  const hierarchy = buildJobHierarchyFields(job);

  const {
    customers: _c,
    users: _u,
    followupbyuser: _followUpUser,
    jobstatuses: _st,
    jobcategories: _cat,
    jobsubcategories: _sub,
    brands: _brand,
    jobtypes: _jobType,
    jobsources: _jobSource,
    ...main
  } = job;

  const row = {
    ...main,
    customerId: c?.customerid ?? main.customerid ?? null,
    customerName: c?.name ?? null,
    assignedToId: u?.userid ?? main.assignedto ?? null,
    assignedToName: u?.name ?? null,
    assignedToAffiliation: u?.technicianaffiliation ?? null,
    assignedToCompanyName: u?.companyname ?? null,
    followUpById: followUpUser?.userid ?? main.followupby ?? null,
    followUpByName: followUpUser?.name ?? null,
    statusId: st?.recno ?? main.statusid ?? null,
    statusName: st?.title ?? null,
    ...hierarchy,
    brandId: main.brandid ?? brand?.recno ?? null,
    brandName: brand?.name ?? null,
    jobTypeId: jobType?.recno ?? main.jobtypeid ?? null,
    jobTypeName: jobType?.name ?? null,
    jobSourceId: jobSource?.recno ?? main.jobsourceid ?? null,
    jobSourceName: jobSource?.name ?? null,
    jobSourceDescription: jobSource?.description ?? null,
    complaintBy: main.complaintby ?? null,
    ...formatQuotationStatusFields(main.quotationstatus)
  };

  delete row.complaintby;

  STRIP_LOWERCASE_FK.forEach((key) => {
    delete row[key];
  });

  return row;
}

module.exports = {
  flattenJobRelationLabels,
  STRIP_LOWERCASE_FK,
  resolveJobCategoryRelation,
  buildJobHierarchyFields
};
