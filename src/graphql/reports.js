const jobsListReportService = require("../services/jobs-list-report.service");
const jobsSummaryReportService = require("../services/jobs-summary-report.service");
const technicianMonthlyBillsReportService = require("../services/technician-monthly-bills-report.service");
const jobRevenueReportService = require("../services/job-revenue-report.service");
const cpairReceivedNotIssuedReportService = require("../services/cpair-received-not-issued-report.service");
const cpairReceivableReportService = require("../services/cpair-receivable-report.service");
const partsWarrantyConsumptionReportService = require("../services/parts-warranty-consumption-report.service");
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
  assignedToId: Int
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
  technicianId: Int
  technicianName: String
  assignedToId: Int
  technicianEmail: String
  technicianPhone: String
  userType: String
  technicianAffiliation: String
  technicianAffiliationLabel: String
  companyName: String
  isActive: Boolean
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

type TechnicianMonthlyBillsSummaryReportRow {
  technicianId: Int
  technicianName: String!
  technicianAffiliation: String
  technicianAffiliationLabel: String
  cashCollected: Float!
  expenses: Float!
  balance: Float!
}

type TechnicianMonthlyBillsSummaryReportResult {
  mode: String!
  reportKey: String!
  data: [TechnicianMonthlyBillsSummaryReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
  detailReportKey: String!
}

type TechnicianMonthlyBillsSummaryReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type TechnicianMonthlyBillsDetailReportRow {
  jobId: Int!
  activityDate: String
  jobCode: String
  technicianId: Int
  technicianName: String!
  technicianAffiliation: String
  technicianAffiliationLabel: String
  customerName: String
  customerAddress: String
  customerPhone: String
  jobDescription: String
  invoiceNumber: String
  status: String
  statusColor: String
  cashCollected: Float!
  expenses: Float!
  balance: Float!
}

type TechnicianMonthlyBillsDetailReportResult {
  mode: String!
  reportKey: String!
  data: [TechnicianMonthlyBillsDetailReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type TechnicianMonthlyBillsDetailReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type JobRevenueReportRow {
  jobId: Int!
  jobCode: String
  manualJobNo: String
  jobDate: String
  customerName: String
  customerPhone: String
  assignedToId: Int
  assignedToName: String
  status: String
  statusColor: String
  amountToCollect: Float!
  collectedAmount: Float!
  outstandingBalance: Float!
  collectedAt: String
  collectionStatus: String
}

type JobRevenueReportResult {
  mode: String!
  reportKey: String!
  data: [JobRevenueReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type JobRevenueReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type CpairReceivedNotIssuedReportRow {
  partId: Int
  summaryId: Int
  jobId: Int
  jobNo: String
  manualJobNo: String
  jobProductId: Int
  productId: Int
  partName: String
  customerId: Int
  customerName: String
  technicianId: Int
  technicianName: String
  faultId: Int
  faultName: String
  qty: Int
  installedQty: Int
  wastageQty: Int
  lineQtyReceived: Int!
  lineWastageReceived: Int
  lineIssueQty: Int!
  qtyPendingIssue: Int!
  receiveStatus: String
  issueStatus: String
  summaryReceiveStatus: String
  summaryIssueStatus: String
  remarks: String
  createdAt: String
}

type CpairReceivedNotIssuedReportResult {
  mode: String!
  reportKey: String!
  data: [CpairReceivedNotIssuedReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type CpairReceivedNotIssuedReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type CpairReceivableReportRow {
  partId: Int
  summaryId: Int
  jobId: Int
  jobNo: String
  manualJobNo: String
  jobProductId: Int
  productId: Int
  partName: String
  customerId: Int
  customerName: String
  technicianId: Int
  technicianName: String
  faultId: Int
  faultName: String
  qty: Int!
  installedQty: Int
  wastageQty: Int
  lineQtyReceived: Int!
  lineWastageReceived: Int
  lineIssueQty: Int
  qtyPendingReceive: Int!
  receiveStatus: String
  issueStatus: String
  summaryReceiveStatus: String
  summaryIssueStatus: String
  remarks: String
  createdAt: String
}

type CpairReceivableReportResult {
  mode: String!
  reportKey: String!
  data: [CpairReceivableReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type CpairReceivableReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

type PartsWarrantyConsumptionReportRow {
  jobProductLineId: Int!
  jobId: Int!
  jobCode: String
  manualJobNo: String
  jobDate: String
  productId: Int
  productName: String
  barcode: String
  modelNo: String
  partNo: String
  saleReferenceNo: String
  lineNo: Int
  qty: Float!
  price: Float
  totalAmount: Float
  inclusiveAmount: Float
  taxAmount: Float
  customerId: Int
  customerName: String
  customerPhone: String
  assignedToId: Int
  assignedToName: String
  inWarranty: Boolean!
  status: String
  statusColor: String
  serviceId: Int
  serviceName: String
  categoryId: Int
  categoryName: String
  faultId: Int
  faultName: String
  productModel: String
  serialNumber: String
  invoiceNumber: String
  remarks: String
}

type PartsWarrantyConsumptionReportResult {
  mode: String!
  reportKey: String!
  data: [PartsWarrantyConsumptionReportRow!]!
  pageInfo: PageInfo!
  filters: [ReportFilterMeta!]!
  columns: [ReportColumn!]!
}

type PartsWarrantyConsumptionReportColumnsResult {
  reportKey: String!
  columns: [ReportColumn!]!
}

input CpairReportFilterInput {
  from: String
  to: String
  search: String
  summaryId: Int
  jobId: Int
  technicianId: Int
  customerId: Int
  customerName: String
  customerPhone: String
  customerEmail: String
  technicianName: String
  faultId: Int
  faultName: String
  receiveStatus: String
  issueStatus: String
  productId: Int
  jobProductId: Int
  partName: String
  lineReceiveStatus: String
  lineIssueStatus: String
  createdBy: Int
  createdByName: String
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
  technicianId: Int
  technicianAffiliation: String
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
  """
  Technician monthly bills summary (cash collected vs job expenses by technician).
  """
  technicianMonthlyBillsSummaryReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): TechnicianMonthlyBillsSummaryReportResult!
  technicianMonthlyBillsSummaryReportColumns: TechnicianMonthlyBillsSummaryReportColumnsResult!
  """
  Technician monthly bills detail (cash and expenses per job).
  """
  technicianMonthlyBillsDetailReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): TechnicianMonthlyBillsDetailReportResult!
  technicianMonthlyBillsDetailReportColumns: TechnicianMonthlyBillsDetailReportColumnsResult!
  """
  Job-wise revenue: amount to be collected (job total cost) vs collected cash.
  """
  jobRevenueReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): JobRevenueReportResult!
  jobRevenueReportColumns: JobRevenueReportColumnsResult!
  """
  C-pair parts received from technicians but not yet fully issued to store.
  """
  cpairReceivedNotIssuedReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: CpairReportFilterInput
  ): CpairReceivedNotIssuedReportResult!
  cpairReceivedNotIssuedReportColumns: CpairReceivedNotIssuedReportColumnsResult!
  """
  C-pair qty still to receive from technicians (expected minus received).
  """
  cpairReceivableReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: CpairReportFilterInput
  ): CpairReceivableReportResult!
  cpairReceivableReportColumns: CpairReceivableReportColumnsResult!
  """
  Parts used on jobs (job product lines), warranty jobs only.
  """
  partsWarrantyConsumptionReport(
    page: Int = 1
    pageSize: Int = 25
    sortBy: String
    sortOrder: String = "desc"
    filter: JobsReportFilterInput
  ): PartsWarrantyConsumptionReportResult!
  partsWarrantyConsumptionReportColumns: PartsWarrantyConsumptionReportColumnsResult!
${summaryGraphql.queries}
`;

const reportMutationFields = `
  """
  Save column chooser preferences (JSON) for Jobs list detail report.
  """
  updateJobsListReportColumns(columns: [ReportColumnInput!]!): JobsListReportColumnsResult!
  updateTechnicianMonthlyBillsSummaryReportColumns(columns: [ReportColumnInput!]!): TechnicianMonthlyBillsSummaryReportColumnsResult!
  updateTechnicianMonthlyBillsDetailReportColumns(columns: [ReportColumnInput!]!): TechnicianMonthlyBillsDetailReportColumnsResult!
  updateJobRevenueReportColumns(columns: [ReportColumnInput!]!): JobRevenueReportColumnsResult!
  updateCpairReceivedNotIssuedReportColumns(columns: [ReportColumnInput!]!): CpairReceivedNotIssuedReportColumnsResult!
  updateCpairReceivableReportColumns(columns: [ReportColumnInput!]!): CpairReceivableReportColumnsResult!
  updatePartsWarrantyConsumptionReportColumns(columns: [ReportColumnInput!]!): PartsWarrantyConsumptionReportColumnsResult!
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

  resolvers.technicianMonthlyBillsSummaryReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await technicianMonthlyBillsReportService.getSummaryReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.technicianMonthlyBillsSummaryReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await technicianMonthlyBillsReportService.getSummaryColumns(auth);
    return {
      reportKey: "technician_monthly_bills_summary",
      columns
    };
  };

  resolvers.updateTechnicianMonthlyBillsSummaryReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return technicianMonthlyBillsReportService.updateSummaryColumns(auth, columns || []);
  };

  resolvers.technicianMonthlyBillsDetailReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await technicianMonthlyBillsReportService.getDetailReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.technicianMonthlyBillsDetailReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await technicianMonthlyBillsReportService.getDetailColumns(auth);
    return {
      reportKey: "technician_monthly_bills_detail",
      columns
    };
  };

  resolvers.updateTechnicianMonthlyBillsDetailReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return technicianMonthlyBillsReportService.updateDetailColumns(auth, columns || []);
  };

  resolvers.jobRevenueReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await jobRevenueReportService.getReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.jobRevenueReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await jobRevenueReportService.getColumns(auth);
    return {
      reportKey: "job_revenue",
      columns
    };
  };

  resolvers.updateJobRevenueReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return jobRevenueReportService.updateColumns(auth, columns || []);
  };

  resolvers.cpairReceivedNotIssuedReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await cpairReceivedNotIssuedReportService.getReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.cpairReceivedNotIssuedReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await cpairReceivedNotIssuedReportService.getColumns(auth);
    return {
      reportKey: "cpair_received_not_issued",
      columns
    };
  };

  resolvers.updateCpairReceivedNotIssuedReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return cpairReceivedNotIssuedReportService.updateColumns(auth, columns || []);
  };

  resolvers.cpairReceivableReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await cpairReceivableReportService.getReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.cpairReceivableReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await cpairReceivableReportService.getColumns(auth);
    return {
      reportKey: "cpair_receivable",
      columns
    };
  };

  resolvers.updateCpairReceivableReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return cpairReceivableReportService.updateColumns(auth, columns || []);
  };

  resolvers.partsWarrantyConsumptionReport = async (args, context) => {
    const auth = requireAuth(context);
    const result = await partsWarrantyConsumptionReportService.getReport(auth, args);
    return {
      ...result,
      filters: mapReportFilterMeta(result.filters)
    };
  };

  resolvers.partsWarrantyConsumptionReportColumns = async (_args, context) => {
    const auth = requireAuth(context);
    const columns = await partsWarrantyConsumptionReportService.getColumns(auth);
    return {
      reportKey: "parts_warranty_consumption",
      columns
    };
  };

  resolvers.updatePartsWarrantyConsumptionReportColumns = async ({ columns }, context) => {
    const auth = requireAuth(context);
    return partsWarrantyConsumptionReportService.updateColumns(auth, columns || []);
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
