const prisma = require("../database/prisma");
const { canManageBranchJobs } = require("../utils/job-access");
const {
  buildPagination,
  formatPendingCollectionListRow,
  buildPendingCollectionJobWhere,
  buildPendingCollectionListOrderBy,
  getAvailablePendingCollectionListFilters,
  buildEmptyPendingCollectionsResponse,
  PENDING_COLLECTION_JOB_INCLUDE,
  SORTABLE_COLUMNS
} = require("../utils/job-pending-collections-list");

class JobPendingCollectionsListService {
  constructor({ mode = "all", restrictToAssignee = false } = {}) {
    this.mode = mode;
    this.restrictToAssignee = restrictToAssignee;
  }

  async shouldRestrictToAssignee(auth) {
    return this.restrictToAssignee || !(await canManageBranchJobs(auth));
  }

  async loadCashSettings(auth) {
    return prisma.jobcashsettings.findFirst({
      where: {
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid)
      }
    });
  }

  async list(auth, query = {}) {
    const pagination = buildPagination(query);
    const settings = await this.loadCashSettings(auth);

    if (settings?.allowreceivecollection !== true) {
      const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
      return {
        ...buildEmptyPendingCollectionsResponse(this, pagination, settings),
        mode: restrictToAssignee ? "my" : this.mode
      };
    }

    const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
    const where = buildPendingCollectionJobWhere(auth, query, { restrictToAssignee });
    const orderBy = buildPendingCollectionListOrderBy(query);

    const [rows, total, totalAmountAgg] = await Promise.all([
      prisma.job.findMany({
        where,
        include: PENDING_COLLECTION_JOB_INCLUDE,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({ where }),
      prisma.job.aggregate({
        where,
        _sum: { totalcost: true }
      })
    ]);

    return {
      mode: restrictToAssignee ? "my" : this.mode,
      cashCollectionEnabled: true,
      data: rows.map(formatPendingCollectionListRow),
      summary: {
        totalPendingJobs: total,
        totalAmountToCollect: totalAmountAgg._sum.totalcost ?? 0,
        totalRecords: total
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailablePendingCollectionListFilters(),
      sortableColumns: SORTABLE_COLUMNS
    };
  }
}

module.exports = {
  JobPendingCollectionsListService,
  jobPendingCollectionsAllService: new JobPendingCollectionsListService({ mode: "all" }),
  jobPendingCollectionsMyService: new JobPendingCollectionsListService({
    mode: "my",
    restrictToAssignee: true
  })
};
