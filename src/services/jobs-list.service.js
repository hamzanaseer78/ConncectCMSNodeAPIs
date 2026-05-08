const prisma = require("../database/prisma");

const JOB_LIST_INCLUDE = {
  customers: true,
  users: true,
  jobstatuses: true,
  jobcategories: true,
  jobsubcategories: true
};

const JOB_REPORT_INCLUDE = {
  users: true,
  jobcategories: true,
  jobstatuses: true,
  customers: true
};

class JobsListService {
  constructor({ mode, restrictToAssignee = false }) {
    this.mode = mode;
    this.restrictToAssignee = restrictToAssignee;
  }

  buildScope(auth) {
    const scope = {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    };

    if (this.restrictToAssignee) {
      scope.assignedto = Number(auth.userid);
    }

    return scope;
  }

  applyFilters(auth, query = {}) {
    const where = { ...this.buildScope(auth) };

    if (query.statusid) where.statusid = Number(query.statusid);
    if (query.priority) where.priority = String(query.priority);
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    return where;
  }

  async list(auth, query = {}) {
    return prisma.job.findMany({
      where: this.applyFilters(auth, query),
      include: JOB_LIST_INCLUDE,
      orderBy: { recno: "desc" }
    });
  }

  async dashboard(auth) {
    const where = this.applyFilters(auth, {});
    const [totalJobs, completedJobs, resolvedJobs, firstResponseJobs, pendingJobs, statusBreakdown] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.count({ where: { ...where, iscompleted: true } }),
      prisma.job.count({ where: { ...where, isresolved: true } }),
      prisma.job.count({ where: { ...where, isfirstresponse: true } }),
      prisma.job.count({ where: { ...where, iscompleted: false } }),
      prisma.job.groupBy({ by: ["statusid"], where, _count: { _all: true } })
    ]);

    return { mode: this.mode, totalJobs, completedJobs, resolvedJobs, firstResponseJobs, pendingJobs, statusBreakdown };
  }

  async reports(auth, query = {}) {
    const where = this.applyFilters(auth, query);
    const [priorityBreakdown, assigneeBreakdown, serviceBreakdown, statusBreakdown, rows] = await Promise.all([
      prisma.job.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["assignedto"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["serviceid"], where, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["statusid"], where, _count: { _all: true } }),
      prisma.job.findMany({
        where,
        include: JOB_REPORT_INCLUDE,
        orderBy: { recno: "desc" }
      })
    ]);

    return {
      mode: this.mode,
      summary: {
        total: rows.length,
        completed: rows.filter((job) => job.iscompleted === true).length,
        resolved: rows.filter((job) => job.isresolved === true).length
      },
      breakdowns: {
        priority: priorityBreakdown,
        assignee: assigneeBreakdown,
        service: serviceBreakdown,
        status: statusBreakdown
      },
      jobs: rows
    };
  }
}

module.exports = JobsListService;
