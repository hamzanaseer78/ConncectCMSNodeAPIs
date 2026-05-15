const prisma = require("../database/prisma");

/** Only fields needed for list rows (smaller query + no nested noise). */
const JOB_LIST_INCLUDE = {
  customers: { select: { customerid: true, name: true } },
  users: { select: { userid: true, name: true } },
  jobstatuses: { select: { recno: true, title: true } },
  jobcategories: { select: { categoryid: true, name: true } },
  jobsubcategories: { select: { subcategoryid: true, name: true } }
};

const JOB_REPORT_INCLUDE = { ...JOB_LIST_INCLUDE };

/**
 * Replace full Prisma relation objects with { id, name, title } for list/report APIs.
 * `title` mirrors `name` when the source model has no separate title (e.g. customer, assignee, service).
 */
function slimJobListRow(job) {
  const {
    customers: c,
    users: u,
    jobstatuses: st,
    jobcategories: cat,
    jobsubcategories: sub,
    ...main
  } = job;

  return {
    ...main,
    customers: c
      ? { id: c.customerid, name: c.name ?? null, title: c.name ?? null }
      : null,
    users: u ? { id: u.userid, name: u.name ?? null, title: u.name ?? null } : null,
    jobstatuses: st
      ? { id: st.recno, name: st.title ?? null, title: st.title ?? null }
      : null,
    jobcategories: cat
      ? { id: cat.categoryid, name: cat.name ?? null, title: cat.name ?? null }
      : null,
    jobsubcategories: sub
      ? { id: sub.subcategoryid, name: sub.name ?? null, title: sub.name ?? null }
      : null
  };
}

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
    const rows = await prisma.job.findMany({
      where: this.applyFilters(auth, query),
      include: JOB_LIST_INCLUDE,
      orderBy: { recno: "desc" }
    });
    return rows.map(slimJobListRow);
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
      jobs: rows.map(slimJobListRow)
    };
  }
}

module.exports = JobsListService;
