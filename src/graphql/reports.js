const jobsListReportService = require("../services/jobs-list-report.service");
const jobsSummaryReportService = require("../services/jobs-summary-report.service");
const { listJobsSummaryReportDefinitions } = require("../reports/jobs-summary-report.registry");
const { buildJobsReportsCatalog } = require("../reports/jobs-reports-catalog");

function buildSummaryReportGraphqlFields() {
  const queries = [];
  const mutations = [];

  listJobsSummaryReportDefinitions().forEach((definition) => {
    const suffix = definition.graphqlSuffix;
    queries.push(`
  """
  ${definition.title} summary grouped report with job counts.
  """
  jobsBy${suffix}SummaryReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): JobsSummaryReportResult!`);
    queries.push(`
  """
  Column chooser configuration for ${definition.title} summary report.
  """
  jobsBy${suffix}SummaryReportColumns: JobsSummaryReportColumnsResult!`);
    mutations.push(`
  """
  Save column chooser preferences (JSON) for ${definition.title} summary report.
  """
  updateJobsBy${suffix}SummaryReportColumns(columns: [ReportColumnInput!]!): JobsSummaryReportColumnsResult!`);
  });

  return { queries: queries.join("\n"), mutations: mutations.join("\n") };
}

const summaryGraphql = buildSummaryReportGraphqlFields();

const reportTypeDefs = `
"""
GraphQL report column definition for grid column chooser.
"""
type ReportColumn {
  columnName: String!
  columnDescription: String!
  isShow: Boolean!
  sortable: Boolean!
  sortNo: Int!
  minWidth: Int!
  columnFieldType: String!
  clickable: Boolean!
  isRigtAligned: Boolean!
  color: String
  isMandatory: Boolean!
}

type ReportFilterMeta {
  field: String!
  type: String!
  operators: [String!]
  description: String
  values: [String!]
  required: Boolean
}

"""
Catalog of all Jobs report APIs (data query, columns query, update mutation).
"""
type JobsReportCatalogItem {
  reportKey: String!
  title: String!
  kind: String!
  dataQuery: String!
  columnsQuery: String!
  updateColumnsMutation: String!
  detailDataQuery: String
}

type JobsReportDrillDownFilter {
  faultId: Int
  categoryId: Int
  subCategoryId: Int
  productModel: String
  productSerial: String
  cityId: Int
  areaId: Int
  customerId: Int
  isInWarranty: Boolean
}

type JobsSummaryReportRow {
  reportKey: String!
  groupId: String
  groupName: String!
  faultId: Int
  categoryId: Int
  subCategoryId: Int
  productModel: String
  productSerial: String
  cityId: Int
  areaId: Int
  customerId: Int
  inWarranty: Boolean
  faultName: String
  categoryName: String
  subCategoryName: String
  cityName: String
  areaName: String
  customerName: String
  warrantyName: String
  noOfJobs: Int!
  noOfResolved: Int!
  noOfCompleted: Int!
  noOfPendings: Int!
  drillDownFilter: JobsReportDrillDownFilter!
}

type JobsSummaryReportResult {
  mode: String!
  reportKey: String!
  data: [JobsSummaryReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
  detailReportKey: String!
}

type JobsSummaryReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type JobsListReportRow {
  jobId: Int!
  jobCode: String
  manualJobNo: String
  jobDate: String
  customerName: String
  mobileNumber: String
  invoiceNumber: String
  invoiceDate: String
  state: String
  area: String
  productModel: String
  status: String
  statusColor: String
  priority: String
}

type JobsListReportResult {
  mode: String!
  data: [JobsListReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type JobsListReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

input ReportColumnInput {
  columnName: String!
  columnDescription: String
  isShow: Boolean
  sortable: Boolean
  sortNo: Int
  minWidth: Int
  columnFieldType: String
  clickable: Boolean
  isRigtAligned: Boolean
  color: String
}

"""
Shared job report filters. Applied to all jobs report queries (list + summary).
For jobsListReport and jobs-list export, from and to are required.
"""
input JobsReportFilterInput {
  from: String
  to: String
  search: String
  jobId: Int
  code: String
  manualJobNo: String
  manualjobno: String
  statusId: Int
  customerId: Int
  customerName: String
  customerPhone: String
  customerEmail: String
  assignedToId: Int
  assignedToName: String
  priority: String
  faultId: Int
  faultName: String
  serviceId: Int
  categoryId: Int
  brandId: Int
  jobTypeId: Int
  jobSourceId: Int
  deliveryTypeId: Int
  quotationStatus: String
  invoiceNumber: String
  productModel: String
  productSerial: String
  serialNumber: String
  cityId: Int
  areaId: Int
  complaintBy: String
  isCompleted: Boolean
  isResolved: Boolean
  isFirstResponse: Boolean
  isAcknowledged: Boolean
  isInWarranty: Boolean
  qualityAssured: Boolean
  estimatedCompletedTime: Int
  groupid: Int
  serviceid: Int
  faultid: Int
  statusid: Int
  customerid: Int
  assignedto: Int
}
`;

const reportQueryFields = `
  """
  List all Jobs report APIs available in this schema (detail + summary reports).
  """
  jobsReportsCatalog: [JobsReportCatalogItem!]!
  """
  Jobs list detail report (row-level jobs).
  """
  jobsListReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): JobsListReportResult!
  """
  Column chooser configuration for Jobs list detail report.
  """
  jobsListReportColumns: JobsListReportColumnsResult!
${summaryGraphql.queries}
`;

const reportMutationFields = `
  """
  Save column chooser preferences (JSON) for Jobs list detail report.
  """
  updateJobsListReportColumns(columns: [ReportColumnInput!]!): JobsListReportColumnsResult!
${summaryGraphql.mutations}
`;

function requireAuth(context) {
  const auth = context?.auth;
  if (!auth?.tenantid || !auth?.branchid || !auth?.userid) {
    if (auth?.introspection) {
      return auth;
    }
    throw new Error("Authentication required");
  }
  return auth;
}

function mapReportFilterMeta(filters = []) {
  return filters.map((filter) => ({
    field: filter.field,
    type: filter.type,
    operators: filter.operators ?? null,
    description: filter.description ?? null,
    values: filter.values ?? null,
    required: filter.required ?? null
  }));
}

function mapSummaryRowResponse(row) {
  return {
    ...row,
    drillDownFilter: row.drillDownFilter || {}
  };
}

function registerReportResolvers(resolvers) {
  resolvers.jobsReportsCatalog = async (_args, context) => buildJobsReportsCatalog();

  resolvers.jobsListReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await jobsListReportService.getReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.jobsListReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await jobsListReportService.getColumns(auth);
    return {
      reportKey: "jobs_list",
      columns
    };
  };

  resolvers.updateJobsListReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return jobsListReportService.updateColumns(auth, columns || []);
  };

  listJobsSummaryReportDefinitions().forEach((definition) => {
    const suffix = definition.graphqlSuffix;
    const reportKey = definition.reportKey;

    resolvers[`jobsBy${suffix}SummaryReport`] = async (args, context) => {
      const auth = requireAuth(context);
      const result = await jobsSummaryReportService.getReport(auth, reportKey, args);
      return {
        ...result,
        data: result.data.map(mapSummaryRowResponse),
        filters: mapReportFilterMeta(result.filters)
      };
    };

    resolvers[`jobsBy${suffix}SummaryReportColumns`] = async (_args, context) => {
      const auth = requireAuth(context);
      return jobsSummaryReportService.getColumns(auth, reportKey).then((columns) => ({
        reportKey,
        columns
      }));
    };

    resolvers[`updateJobsBy${suffix}SummaryReportColumns`] = async ({ columns }, context) => {
      const auth = requireAuth(context);
      return jobsSummaryReportService.updateColumns(auth, reportKey, columns || []);
    };
  });
}

module.exports = {
  reportTypeDefs,
  reportQueryFields,
  reportMutationFields,
  registerReportResolvers,
  buildJobsReportsCatalog
};
