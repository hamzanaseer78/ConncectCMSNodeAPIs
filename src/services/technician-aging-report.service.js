const prisma = require("../database/prisma");
const JobsListService = require("./jobs-list.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { graphqlJobsFilterToQuery } = require("../utils/graphql-jobs-report-filter");
const { GRAPHQL_MAX_PAGE_SIZE } = require("../graphql/pagination");
const {
  resolutionBucketId,
  openAgingBucketId,
  emptyBucketCounts,
  bucketField
} = require("../utils/job-resolution-aging");

const JOB_SELECT = {
  recno: true,
  assignedto: true,
  date: true,
  jobdetails: {
    orderBy: { recno: "asc" },
    take: 1,
    select: {
      resolvedat: true,
      assignedat: true,
      firstresponseat: true,
      createdat: true
    }
  }
};

function buildListService(isManager) {
  return new JobsListService({
    mode: isManager ? "all" : "my",
    restrictToAssignee: !isManager
  });
}

function buildPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const requestedPageSize = Math.max(Number(query.pageSize || 25), 1);
  const pageSize = Math.min(requestedPageSize, GRAPHQL_MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

async function listJobsForAging(where) {
  return prisma.job.findMany({
    where,
    select: JOB_SELECT
  });
}

function groupResolvedJobs(jobs) {
  const rows = new Map();

  jobs.forEach((job) => {
    const bucket = resolutionBucketId(job);
    const field = bucketField(bucket);
    if (!field) return;

    const technicianId = job.assignedto != null ? Number(job.assignedto) : null;
    const key = technicianId == null ? "unassigned" : String(technicianId);
    if (!rows.has(key)) {
      rows.set(key, {
        technicianId,
        technicianName: technicianId == null ? "Unassigned" : null,
        ...emptyBucketCounts()
      });
    }
    rows.get(key)[field] += 1;
  });

  return [...rows.values()];
}

async function attachTechnicianNames(rows) {
  const ids = rows.map((row) => row.technicianId).filter((id) => id != null);
  if (!ids.length) return rows;

  const users = await prisma.users.findMany({
    where: { userid: { in: ids } },
    select: { userid: true, name: true }
  });
  const names = new Map(users.map((user) => [Number(user.userid), user.name || null]));

  return rows.map((row) => ({
    ...row,
    technicianName:
      row.technicianId == null
        ? "Unassigned"
        : names.get(row.technicianId) || `Technician ${row.technicianId}`
  }));
}

class TechnicianAgingReportService {
  async getReport(auth, args = {}) {
    const isManager = await canManageBranchJobs(auth);
    const service = buildListService(isManager);
    const query = graphqlJobsFilterToQuery(args.filter, args);
    delete query.resolutionBucket;
    const pagination = buildPagination(query);
    const where = await service.applyFilters(auth, query);
    const jobs = await listJobsForAging(where);
    const named = await attachTechnicianNames(groupResolvedJobs(jobs));
    named.sort((left, right) =>
      String(left.technicianName || "").localeCompare(String(right.technicianName || ""))
    );

    const total = named.length;
    const data = named.slice(pagination.skip, pagination.skip + pagination.pageSize);

    return {
      mode: isManager ? "all" : "my",
      data,
      pageInfo: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      }
    };
  }
}

async function listJobIdsForResolutionBucket(where, bucketId) {
  const jobs = await listJobsForAging(where);
  return jobs.filter((job) => resolutionBucketId(job) === bucketId).map((job) => job.recno);
}

async function listJobIdsForOpenAgingBucket(where, bucketId) {
  const jobs = await listJobsForAging(where);
  const now = new Date();
  return jobs.filter((job) => openAgingBucketId(job, now) === bucketId).map((job) => job.recno);
}

module.exports = new TechnicianAgingReportService();
module.exports.listJobIdsForResolutionBucket = listJobIdsForResolutionBucket;
module.exports.listJobIdsForOpenAgingBucket = listJobIdsForOpenAgingBucket;
module.exports.listJobsForAging = listJobsForAging;
