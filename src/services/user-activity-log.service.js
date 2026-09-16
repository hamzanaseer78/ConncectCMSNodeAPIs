const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { canManageBranchJobs } = require("../utils/job-access");
const {
  USER_ACTIVITY_ACTIONS,
  normalizeActivityAction,
  buildActivitySummary,
  readRequestMeta,
  formatActivityLogRow
} = require("../utils/user-activity-log");

const MAX_PAGE_SIZE = 100;

function parseIntFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

class UserActivityLogService {
  buildScope(auth, query = {}, options = {}) {
    const where = {
      tenantid: Number(auth.tenantid),
      branchid: Number(query.branchid ?? auth.branchid)
    };

    if (!options.viewAll) {
      where.userid = Number(auth.userid);
    }

    return where;
  }

  buildListWhere(auth, query = {}) {
    const where = this.buildScope(auth, query, { viewAll: query.viewAll === true || query.viewAll === "true" });

    const userId = parseIntFilter(query.userid ?? query.userId ?? query.createdby ?? query.createdBy);
    if (userId !== undefined) {
      where.userid = userId;
    }

    const jobId = parseIntFilter(query.jobid ?? query.jobId);
    if (jobId !== undefined) {
      where.jobid = jobId;
    }

    const entityId = parseIntFilter(query.entityid ?? query.entityId);
    if (entityId !== undefined) {
      where.entityid = entityId;
    }

    if (query.module != null && String(query.module).trim() !== "") {
      where.module = { equals: String(query.module).trim(), mode: "insensitive" };
    }

    const action = query.action ?? query.nature;
    if (action != null && String(action).trim() !== "") {
      const normalized = normalizeActivityAction(action, null);
      if (normalized && USER_ACTIVITY_ACTIONS.includes(normalized)) {
        where.action = normalized;
      }
    }

    if (query.entitycode ?? query.entityCode ?? query.code) {
      const code = String(query.entitycode ?? query.entityCode ?? query.code).trim();
      if (code) {
        where.entitycode = { contains: code, mode: "insensitive" };
      }
    }

    if (query.entityname ?? query.entityName ?? query.name) {
      const name = String(query.entityname ?? query.entityName ?? query.name).trim();
      if (name) {
        where.entityname = { contains: name, mode: "insensitive" };
      }
    }

    const search = query.search ?? query.q ?? query.keyword;
    if (search != null && String(search).trim() !== "") {
      const term = String(search).trim();
      where.OR = [
        { entityname: { contains: term, mode: "insensitive" } },
        { entitycode: { contains: term, mode: "insensitive" } },
        { summary: { contains: term, mode: "insensitive" } },
        { module: { contains: term, mode: "insensitive" } }
      ];
    }

    if (query.from || query.to) {
      where.recordedat = where.recordedat || {};
      if (query.from) where.recordedat.gte = new Date(query.from);
      if (query.to) where.recordedat.lte = new Date(query.to);
    }

    return where;
  }

  async log(auth, payload = {}, req = null) {
    if (!auth?.tenantid || !auth?.branchid || !auth?.userid) {
      return null;
    }

    const action = normalizeActivityAction(payload.action);
    const module = String(payload.module || payload.resource || "system").trim().slice(0, 80);
    const entityName = payload.entityName ?? payload.entityname ?? payload.name ?? null;
    const entityCode = payload.entityCode ?? payload.entitycode ?? payload.code ?? null;
    const jobId = payload.jobId ?? payload.jobid ?? null;
    const entityId = payload.entityId ?? payload.entityid ?? null;
    const summary =
      payload.summary ||
      buildActivitySummary({
        action,
        module,
        entityName,
        entityCode,
        jobId,
        extra: payload.extra
      });
    const meta = readRequestMeta(req);

    return prisma.useractivitylogs.create({
      data: {
        tenantid: Number(auth.tenantid),
        branchid: Number(payload.branchid ?? auth.branchid),
        userid: Number(auth.userid),
        module,
        entityname: entityName != null ? String(entityName).slice(0, 255) : null,
        entitycode: entityCode != null ? String(entityCode).slice(0, 100) : null,
        jobid: jobId != null ? Number(jobId) : null,
        entityid: entityId != null ? Number(entityId) : null,
        action,
        summary,
        metadata: payload.metadata ?? null,
        ipaddress: meta.ipaddress,
        useragent: meta.useragent,
        recordedat: payload.recordedAt ? new Date(payload.recordedAt) : utcNow()
      }
    });
  }

  async logSafe(auth, payload = {}, req = null) {
    try {
      return await this.log(auth, payload, req);
    } catch (err) {
      console.error("[UserActivityLog] failed to write log:", err.message);
      return null;
    }
  }

  getAvailableFilters() {
    return [
      { field: "module", type: "String", operators: ["equals"], description: "Module/resource name (e.g. jobs, products, users)" },
      { field: "action", type: "Enum", operators: ["equals"], values: USER_ACTIVITY_ACTIONS, description: "Nature of action (alias: nature)" },
      { field: "userid", type: "Int", operators: ["equals"], description: "Actor user id (alias: userId, createdBy)" },
      { field: "jobid", type: "Int", operators: ["equals"], description: "Related job id" },
      { field: "entityid", type: "Int", operators: ["equals"], description: "Related record id in module" },
      { field: "entitycode", type: "String", operators: ["contains"], description: "Partial match on code" },
      { field: "entityname", type: "String", operators: ["contains"], description: "Partial match on name" },
      { field: "search", type: "String", operators: ["contains"], description: "Search name, code, summary, or module" },
      { field: "from", type: "DateTime", operators: ["gte"], description: "Activity time from" },
      { field: "to", type: "DateTime", operators: ["lte"], description: "Activity time to" }
    ];
  }

  async list(auth, query = {}) {
    const canViewAll = await canManageBranchJobs(auth);
    const pagination = buildPagination(query);
    const where = this.buildListWhere(auth, {
      ...query,
      viewAll: canViewAll
    });

    const [rows, total] = await Promise.all([
      prisma.useractivitylogs.findMany({
        where,
        include: {
          users: { select: { userid: true, name: true, email: true } },
          job: { select: { recno: true, code: true } }
        },
        orderBy: { recordedat: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.useractivitylogs.count({ where })
    ]);

    return {
      mode: canViewAll ? "all" : "my",
      data: rows.map(formatActivityLogRow),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: this.getAvailableFilters(),
      sortableColumns: ["recordedAt", "time", "module", "action", "entityName", "entityCode", "jobId", "userId"]
    };
  }
}

module.exports = new UserActivityLogService();
module.exports.UserActivityLogService = UserActivityLogService;
