const prisma = require("../database/prisma");
const { canManageBranchJobs } = require("../utils/job-access");
const {
  buildPagination,
  formatPendingExpenseListRow,
  buildPendingExpenseJobWhere,
  buildPendingExpenseListOrderBy,
  getAvailablePendingExpenseListFilters,
  buildEmptyPendingExpensesResponse,
  PENDING_EXPENSE_JOB_INCLUDE,
  SORTABLE_COLUMNS
} = require("../utils/job-pending-expenses-list");

class JobPendingExpensesListService {
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

    if (settings?.allowaddexpenses !== true) {
      const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
      return {
        ...buildEmptyPendingExpensesResponse(this, pagination, settings),
        mode: restrictToAssignee ? "my" : this.mode
      };
    }

    const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
    const where = buildPendingExpenseJobWhere(auth, query, { restrictToAssignee });
    const orderBy = buildPendingExpenseListOrderBy(query);

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: PENDING_EXPENSE_JOB_INCLUDE,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.job.count({ where })
    ]);

    return {
      mode: restrictToAssignee ? "my" : this.mode,
      expensesEnabled: true,
      data: rows.map(formatPendingExpenseListRow),
      summary: {
        totalPendingJobs: total,
        totalRecords: total
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailablePendingExpenseListFilters(),
      sortableColumns: SORTABLE_COLUMNS
    };
  }
}

module.exports = {
  JobPendingExpensesListService,
  jobPendingExpensesAllService: new JobPendingExpensesListService({ mode: "all" }),
  jobPendingExpensesMyService: new JobPendingExpensesListService({
    mode: "my",
    restrictToAssignee: true
  })
};
