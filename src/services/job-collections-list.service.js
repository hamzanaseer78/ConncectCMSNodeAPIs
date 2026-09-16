const prisma = require("../database/prisma");
const { canManageBranchJobs } = require("../utils/job-access");
const {
  buildPagination,
  buildCollectionListWhere,
  buildCollectionListOrderBy,
  formatCollectionListRow,
  getAvailableCollectionListFilters,
  COLLECTION_LIST_JOB_INCLUDE
} = require("../utils/job-collections-list");

class JobCollectionsListService {
  constructor({ mode = "all", restrictToAssignee = false } = {}) {
    this.mode = mode;
    this.restrictToAssignee = restrictToAssignee;
  }

  async shouldRestrictToAssignee(auth) {
    return this.restrictToAssignee || !(await canManageBranchJobs(auth));
  }

  async list(auth, query = {}) {
    const pagination = buildPagination(query);
    const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
    const where = buildCollectionListWhere(auth, query, { restrictToAssignee });
    const orderBy = buildCollectionListOrderBy(query);

    const [rows, total, totalAmountAgg] = await Promise.all([
      prisma.jobcollections.findMany({
        where,
        include: {
          job: {
            include: COLLECTION_LIST_JOB_INCLUDE
          }
        },
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.jobcollections.count({ where }),
      prisma.jobcollections.aggregate({
        where,
        _sum: { amount: true }
      })
    ]);

    return {
      mode: restrictToAssignee ? "my" : this.mode,
      data: rows.map(formatCollectionListRow),
      summary: {
        totalCollectionAmount: totalAmountAgg._sum.amount ?? 0,
        totalRecords: total
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailableCollectionListFilters(),
      sortableColumns: [
        "date",
        "collectedAt",
        "collectionAmount",
        "amount",
        "jobId",
        "jobNo",
        "technicianName",
        "customerName",
        "jobCategory",
        "jobFault",
        "assignedByName"
      ]
    };
  }
}

module.exports = {
  JobCollectionsListService,
  jobCollectionsAllService: new JobCollectionsListService({ mode: "all" }),
  jobCollectionsMyService: new JobCollectionsListService({ mode: "my", restrictToAssignee: true })
};
