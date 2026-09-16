const { JOBS_LIST_REPORT_SORT_FIELD_MAP } = require("../reports/jobs-list-report");

const GRAPHQL_FILTER_ALIASES = {
  jobId: "recno",
  assignedToId: "assignedto",
  statusId: "statusid",
  customerId: "customerid",
  faultId: "faultid",
  serviceId: "groupid",
  categoryId: "serviceid",
  brandId: "brandid",
  jobTypeId: "jobtypeid",
  jobSourceId: "jobsourceid",
  deliveryTypeId: "deliverytype",
  complaintBy: "complaintby",
  quotationStatus: "quotationstatus",
  isCompleted: "iscompleted",
  isResolved: "isresolved",
  isFirstResponse: "isfirstresponse",
  isAcknowledged: "isacknowledged",
  isInWarranty: "isinwaranty",
  isInWaranty: "isinwaranty",
  inWarranty: "isinwaranty",
  qualityAssured: "qualityassuerd",
  estimatedCompletedTime: "estimatedcompletedtime",
  cityId: "city",
  areaId: "area",
  manualJobNo: "manualjobno",
  productSerial: "productSerial",
  serialNumber: "productSerial",
  assignedToName: "assignedToName",
  customerName: "customerName",
  customerPhone: "customerPhone",
  customerEmail: "customerEmail",
  invoiceNumber: "invoiceNumber",
  productModel: "productModel",
  faultName: "faultName"
};

function graphqlJobsFilterToQuery(filter = {}, args = {}, options = {}) {
  const query = {};

  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query[key] = value;
    }
  });

  Object.entries(GRAPHQL_FILTER_ALIASES).forEach(([from, to]) => {
    if (query[from] !== undefined && query[to] === undefined) {
      query[to] = query[from];
    }
  });

  if (args.page != null) query.page = args.page;
  if (args.pageSize != null) query.pageSize = args.pageSize;

  const sortBy = args.sortBy ?? filter.sortBy;
  if (sortBy) {
    query.sortBy =
      options.sortFieldMap?.[sortBy] ?? JOBS_LIST_REPORT_SORT_FIELD_MAP[sortBy] ?? sortBy;
  }
  if (args.sortOrder ?? filter.sortOrder) {
    query.sortOrder = args.sortOrder ?? filter.sortOrder;
  }

  return query;
}

module.exports = {
  GRAPHQL_FILTER_ALIASES,
  graphqlJobsFilterToQuery
};
