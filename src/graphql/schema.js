const prisma = require("../database/prisma");
const resources = require("../config/resources");
const { hasRight } = require("../middlewares/authorization.middleware");
const {
  coerceValue,
  getListScalarFields,
  getScalarFields,
  getWritableFields
} = require("../utils/prisma-metadata");
const jobsWorkflowService = require("../services/jobs-workflow.service");
const { sendMailSafe } = require("../services/notifications.service");
const fs = require("fs");
const path = require("path");

/**
 * GraphQL Schema Definition
 * Fully supports introspection queries for schema exploration
 */
function toPascalCase(resourceName) {
  return String(resourceName)
    .replace(/[_\-\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function graphqlScalarType(field) {
  if (field.type === "Int") return "Int";
  if (field.type === "Float" || field.type === "Decimal") return "Float";
  if (field.type === "Boolean") return "Boolean";
  // DateTime and everything else → String for buildSchema compatibility
  return "String";
}

function fieldLine(field, requiredOverride) {
  const gqlType = graphqlScalarType(field);
  const required = requiredOverride ?? (field.isRequired && !field.isList);
  return `  ${field.name}: ${gqlType}${required ? "!" : ""}`;
}

function buildCrudTypeDefs() {
  const publicResources = Object.entries(resources)
    .filter(([, config]) => !config.backendOnly)
    .map(([name, config]) => ({ name, config }));

  const parts = [];

  parts.push(`
"""
Report item showing resource count
"""
type ReportItem {
  resource: String!
  total: Int!
}

"""
Dashboard summary with key metrics
"""
type DashboardSummary {
  tenantid: Int!
  branchid: Int!
  users: Int!
  customers: Int!
  products: Int!
  activePolicies: Int!
}

"""
Simple pagination info
"""
type PageInfo {
  page: Int!
  pageSize: Int!
  total: Int!
  totalPages: Int!
}
`);

  // Per-resource object types + input types + list response types
  for (const { name: resourceName, config } of publicResources) {
    const typeName = toPascalCase(resourceName);

    const scalarFields = getScalarFields(resourceName);
    const listFields = getListScalarFields(resourceName, config);
    const writableCreate = getWritableFields(resourceName, config, "create");
    const writableUpdate = getWritableFields(resourceName, config, "update");

    const relationOutputFields = Object.values(config.listRelations || {}).map((rel) => rel.output);

    const objectFieldLines = [
      ...scalarFields.map((f) => fieldLine(f)),
      ...relationOutputFields.map((out) => `  ${out}: String`)
    ].filter(Boolean);

    const createInputLines = writableCreate.map((f) => fieldLine(f, false)).filter(Boolean);
    const updateInputLines = writableUpdate.map((f) => fieldLine(f, false)).filter(Boolean);

    parts.push(`
type ${typeName} {
${(objectFieldLines.length ? objectFieldLines : ["  _empty: String"]).join("\n")}
}

input ${typeName}CreateInput {
${(createInputLines.length ? createInputLines : ["  _empty: String"]).join("\n")}
}

input ${typeName}UpdateInput {
${(updateInputLines.length ? updateInputLines : ["  _empty: String"]).join("\n")}
}

type ${typeName}List {
  data: [${typeName}!]!
  pageInfo: PageInfo!
}
`);

    // ensure list fields are not empty in SDL (avoid blank lines issues)
    void listFields;
  }

  // Root Query + Mutation
  const queryFields = [];
  const mutationFields = [];

  queryFields.push(`
  dashboardSummary: DashboardSummary!
  resourceReport(resource: String!): ReportItem!
  reports: [ReportItem!]!
`);

  // Jobs (complaint management)
  queryFields.push(`
  job(id: Int!): Job
  jobs(page: Int = 1, pageSize: Int = 25, statusid: Int, assignedto: Int, customerid: Int, from: String, to: String, search: String): JobList!
  jobTimeline(id: Int!): [JobTimelineEvent!]!
  jobAttachments(id: Int!): [JobAttachment!]!
`);

  mutationFields.push(`
  jobCreate(input: JobCreateInput!): Job!
  jobUpdate(id: Int!, input: JobUpdateInput!): Job!
  jobAssign(id: Int!, assignedto: Int!, remarks: String): String!
  jobChangeStatus(id: Int!, tostatus: Int!, remarks: String): JobStatusLog!
  jobAddCustomerRemark(id: Int!, remarks: String!): JobCustomerRemark!
  jobUploadAttachment(id: Int!, input: JobAttachmentUploadInput!): JobAttachment!
`);

  for (const { name: resourceName, config } of publicResources) {
    const typeName = toPascalCase(resourceName);
    const idField = config.id;
    queryFields.push(`
  ${resourceName}(id: Int!): ${typeName}
  ${resourceName}List(page: Int = 1, pageSize: Int = 25, sortBy: String, sortOrder: String = "asc"): ${typeName}List!
`);

    if (!config.noCreate) {
      mutationFields.push(`
  ${resourceName}Create(input: ${typeName}CreateInput!): ${typeName}!
`);
    }
    mutationFields.push(`
  ${resourceName}Update(id: Int!, input: ${typeName}UpdateInput!): ${typeName}!
`);
    if (!config.noRemove) {
      mutationFields.push(`
  ${resourceName}Delete(id: Int!): Boolean!
`);
    }

    // keep linter happy
    void idField;
  }

  parts.push(`
type Query {
${queryFields.join("\n")}
}

type Mutation {
${mutationFields.length ? mutationFields.join("\n") : "  _empty: String"}
}
`);

  // Jobs module (complaint management) types/inputs
  parts.push(`
"""
Job timeline event type
"""
type JobTimelineEvent {
  type: String!
  at: String
  remarks: String
  userid: Int
  fromstatus: Int
  tostatus: Int
}

type JobAttachment {
  recno: Int!
  jobid: Int
  tenantid: Int
  branchid: Int
  addedby: Int
  addedat: String
  attachmentname: String
  url: String
  remarks: String
}

type JobDetails {
  recno: Int!
  jobid: Int
  tenantid: Int
  branchid: Int
  description: String
  notes: String
  remarks: String
  assignedat: String
  assignedby: Int
  assignedremarks: String
  firstresponseby: Int
  firstresponseat: String
  firstresponseremarks: String
  completedby: Int
  completedat: String
  completedremarks: String
  resolvedby: Int
  resolvedat: String
  resolvedremarks: String
  qualityassuerdby: Int
  qualityassuerdat: String
  qualityassuerdremarks: String
  acknowledgedby: Int
  acknowledgedat: String
  acknowledgedremarks: String
}

type JobStatusLog {
  recno: Int!
  jobid: Int
  tenantid: Int
  branchid: Int
  fromstatus: Int
  tostatus: Int
  remarks: String
  changedby: Int
  changedat: String
}

type JobAssignmentLog {
  recno: Int!
  jobid: Int
  tenantid: Int
  branchid: Int
  userid: Int
  remarks: String
  assignedby: Int
  assignedat: String
}

type JobCustomerRemark {
  recno: Int!
  jobid: Int
  tenantid: Int
  branchid: Int
  remarks: String
  addedby: Int
  addedat: String
}

type Job {
  recno: Int!
  tenantid: Int
  branchid: Int
  code: String
  date: String
  assignedto: Int
  city: Int
  area: Int
  serviceid: Int
  faultid: Int
  customerid: Int
  isinwaranty: Boolean
  isfirstresponse: Boolean
  iscompleted: Boolean
  isresolved: Boolean
  statusid: Int
  priority: String
  deliverytype: Int
  isacknowledged: Boolean
  manualjobno: String

  jobdetails: [JobDetails!]!
  jobattachments: [JobAttachment!]!
  jobassignmentlog: [JobAssignmentLog!]!
  jobstatuslog: [JobStatusLog!]!
  jobcustomerremarkslog: [JobCustomerRemark!]!
}

type JobList {
  data: [Job!]!
  pageInfo: PageInfo!
}

input JobCreateInput {
  customerid: Int!
  serviceid: Int!
  faultid: Int
  assignedto: Int
  city: Int
  area: Int
  isinwaranty: Boolean
  statusid: Int
  priority: String
  deliverytype: Int
  manualjobno: String
  date: String
  description: String
  notes: String
}

input JobUpdateInput {
  assignedto: Int
  city: Int
  area: Int
  faultid: Int
  statusid: Int
  priority: String
  deliverytype: Int
  manualjobno: String
}

input JobAttachmentUploadInput {
  attachmentname: String!
  mimeType: String!
  base64: String!
  remarks: String
}
`);

  return parts.join("\n");
}

const typeDefs = buildCrudTypeDefs();

/**
 * Build scoped WHERE clause based on resource config and user auth
 * @param {Object} config - Resource configuration
 * @param {Object} auth - Authenticated user from JWT
 * @returns {Object} Prisma WHERE clause
 */
function scopedWhere(config, auth) {
  if (!auth) {
    throw new Error("Unauthorized: No authentication context");
  }

  const where = {};
  if (config.tenantScoped && auth?.tenantid) {
    where.tenantid = Number(auth.tenantid);
  }
  if (config.branchScoped && auth?.branchid) {
    where.branchid = Number(auth.branchid);
  }
  return where;
}

function requireAuth(context) {
  const auth = context?.auth;
  if (!auth) throw new Error("Authentication required");
  if (!auth.userid || !auth.tenantid || !auth.branchid) {
    throw new Error("JWT must include userid, tenantid and branchid");
  }
  return auth;
}

async function nextJobCode(auth) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);

  // Advisory lock prevents concurrent duplicates without schema changes
  const lockKey = BigInt(tenantid) * 100000n + BigInt(branchid);
  await prisma.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const rows = await prisma.$queryRaw`
    SELECT MAX(code) AS max_code
    FROM job
    WHERE tenantid = ${tenantid} AND branchid = ${branchid} AND code IS NOT NULL
  `;
  const maxCode = rows?.[0]?.max_code ? String(rows[0].max_code) : null;
  const maxNum = maxCode && /^\d+$/.test(maxCode) ? Number(maxCode) : 0;
  const next = maxNum + 1;
  return String(next).padStart(6, "0");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

async function requireRight(auth, resourceName, action) {
  const allowed = await hasRight(auth, resourceName, action);
  if (!allowed) {
    throw new Error(`Not authorized to ${action} ${resourceName}`);
  }
}

function buildCreateData(resourceName, config, auth, input) {
  const writableFields = getWritableFields(resourceName, config, "create");
  const allScalar = getScalarFields(resourceName);
  const scalarByName = new Map(allScalar.map((f) => [f.name, f]));

  const data = {};
  for (const field of writableFields) {
    if (input && Object.prototype.hasOwnProperty.call(input, field.name)) {
      data[field.name] = coerceValue(field, input[field.name]);
    }
  }

  if (config.tenantScoped) data.tenantid = Number(auth.tenantid);
  if (config.branchScoped) data.branchid = Number(auth.branchid);

  // createdby/createdat if exists
  if (scalarByName.has("createdby")) data.createdby = Number(auth.userid);
  if (scalarByName.has("createdat")) data.createdat = new Date();

  return data;
}

function buildUpdateData(resourceName, config, auth, input) {
  const writableFields = getWritableFields(resourceName, config, "update");
  const allScalar = getScalarFields(resourceName);
  const scalarByName = new Map(allScalar.map((f) => [f.name, f]));

  const data = {};
  for (const field of writableFields) {
    if (input && Object.prototype.hasOwnProperty.call(input, field.name)) {
      data[field.name] = coerceValue(field, input[field.name]);
    }
  }

  if (scalarByName.has("lastupdatedby")) data.lastupdatedby = Number(auth.userid);
  if (scalarByName.has("lastupdatedat")) data.lastupdatedat = new Date();
  if (scalarByName.has("updatedat")) data.updatedat = new Date();

  return data;
}

function buildWhereById(resourceName, config, auth, id) {
  const where = scopedWhere(config, auth);
  where[config.id] = Number(id);
  return where;
}

async function enrichListRelations(resourceName, config, rows) {
  const listRelations = config.listRelations || {};
  const relationEntries = Object.entries(listRelations);
  if (!relationEntries.length) return rows;

  // include needed relations once
  const include = {};
  for (const [sourceField, relConfig] of relationEntries) {
    // prisma relation field names are defined in resources config as `relation`
    include[relConfig.relation] = { select: { [relConfig.field]: true } };
    // keep linter happy
    void sourceField;
  }

  // re-fetch with include to avoid complex joins in manual mapping
  const ids = rows.map((r) => r[config.id]).filter((v) => v !== null && v !== undefined);
  if (!ids.length) return rows;

  const model = prisma[resourceName];
  const withRelations = await model.findMany({
    where: {
      [config.id]: { in: ids }
    },
    include
  });

  const byId = new Map(withRelations.map((r) => [r[config.id], r]));
  return rows.map((row) => {
    const full = byId.get(row[config.id]) || row;
    const out = { ...row };
    for (const [, relConfig] of relationEntries) {
      out[relConfig.output] = full?.[relConfig.relation]?.[relConfig.field] ?? null;
    }
    return out;
  });
}

/**
 * Get count for a specific resource with proper scoping
 * @param {string} resourceName - Resource name from config
 * @param {Object} auth - Authenticated user
 * @returns {Promise<number>} Count of records
 * @throws {Error} If resource is invalid or not reportable
 */
async function countResource(resourceName, auth) {
  if (!resourceName || typeof resourceName !== 'string') {
    throw new Error("Invalid resource name");
  }

  const config = resources[resourceName];
  if (!config) {
    throw new Error(`Unknown resource: ${resourceName}`);
  }

  if (config.backendOnly) {
    throw new Error(`Resource ${resourceName} is not accessible via GraphQL`);
  }

  const model = prisma[resourceName];
  if (!model || typeof model.count !== 'function') {
    throw new Error(`Resource ${resourceName} does not support counting`);
  }

  try {
    return await model.count({ where: scopedWhere(config, auth) });
  } catch (err) {
    console.error(`[GraphQL] Error counting ${resourceName}:`, err.message);
    throw new Error(`Failed to count ${resourceName}`);
  }
}

/**
 * GraphQL Resolvers
 */
const resolvers = {
  /**
   * Get dashboard summary for authenticated user
   */
  dashboardSummary: async (_args, context) => {
    try {
      const auth = context?.auth;
      if (!auth) {
        throw new Error("Authentication required");
      }

      if (!auth.tenantid || !auth.branchid) {
        throw new Error("Invalid authentication context: missing tenantid or branchid");
      }

      const [users, customers, products, activePolicies] = await Promise.all([
        prisma.userorganizations.count({
          where: {
            tenantid: Number(auth.tenantid),
            branchid: Number(auth.branchid),
            isblocked: false
          }
        }),
        countResource("customers", auth),
        countResource("products", auth),
        prisma.policies.count({
          where: {
            tenantid: Number(auth.tenantid),
            isdefaultpolicy: false
          }
        })
      ]);

      return {
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid),
        users,
        customers,
        products,
        activePolicies
      };
    } catch (err) {
      console.error("[GraphQL] dashboardSummary error:", err.message);
      throw new Error(err.message || "Failed to fetch dashboard summary");
    }
  },

  /**
   * Get count report for a specific resource
   */
  resourceReport: async ({ resource }, context) => {
    try {
      const auth = context?.auth;
      if (!auth) {
        throw new Error("Authentication required");
      }

      if (!resource) {
        throw new Error("Resource parameter is required");
      }

      const total = await countResource(resource, auth);
      return { resource, total };
    } catch (err) {
      console.error("[GraphQL] resourceReport error:", err.message);
      throw new Error(err.message || "Failed to fetch resource report");
    }
  },

  /**
   * Get reports for all accessible resources
   */
  reports: async (_args, context) => {
    try {
      const auth = context?.auth;
      if (!auth) {
        throw new Error("Authentication required");
      }

      const reportables = Object.entries(resources)
        .filter(([, config]) => !config.backendOnly)
        .map(([name]) => name);

      if (reportables.length === 0) {
        throw new Error("No reportable resources available");
      }

      const totals = await Promise.all(
        reportables.map(async (resource) => {
          try {
            const total = await countResource(resource, auth);
            return { resource, total };
          } catch (err) {
            console.error(`[GraphQL] Error counting ${resource}:`, err.message);
            return { resource, total: 0 };
          }
        })
      );

      return totals;
    } catch (err) {
      console.error("[GraphQL] reports error:", err.message);
      throw new Error(err.message || "Failed to fetch reports");
    }
  }
};

// CRUD resolvers (rootValue entries)
for (const [resourceName, config] of Object.entries(resources)) {
  if (config.backendOnly) continue;

  const model = prisma[resourceName];
  if (!model) continue;

  // item
  resolvers[resourceName] = async ({ id }, context) => {
    const auth = requireAuth(context);
    await requireRight(auth, resourceName, "view");

    const where = buildWhereById(resourceName, config, auth, id);
    const row = await model.findFirst({ where });
    if (!row) return null;

    const [enriched] = await enrichListRelations(resourceName, config, [row]);
    return enriched;
  };

  // list
  resolvers[`${resourceName}List`] = async (args, context) => {
    const auth = requireAuth(context);
    await requireRight(auth, resourceName, "view");

    const page = Math.max(1, Number(args?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(args?.pageSize ?? 25)));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where = scopedWhere(config, auth);

    const sortBy = args?.sortBy ? String(args.sortBy) : null;
    const sortOrder = String(args?.sortOrder || "asc").toLowerCase() === "desc" ? "desc" : "asc";

    const scalarFields = getScalarFields(resourceName);
    const scalarFieldNames = new Set(scalarFields.map((f) => f.name));
    const orderBy = sortBy && scalarFieldNames.has(sortBy) ? { [sortBy]: sortOrder } : undefined;

    const [total, rows] = await Promise.all([
      model.count({ where }),
      model.findMany({ where, skip, take, orderBy })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const enriched = await enrichListRelations(resourceName, config, rows);

    return {
      data: enriched,
      pageInfo: { page, pageSize, total, totalPages }
    };
  };

  // create
  if (!config.noCreate) {
    resolvers[`${resourceName}Create`] = async ({ input }, context) => {
      const auth = requireAuth(context);
      await requireRight(auth, resourceName, "add");

      const data = buildCreateData(resourceName, config, auth, input);
      const row = await model.create({ data });
      const [enriched] = await enrichListRelations(resourceName, config, [row]);
      return enriched;
    };
  }

  // update
  resolvers[`${resourceName}Update`] = async ({ id, input }, context) => {
    const auth = requireAuth(context);
    await requireRight(auth, resourceName, "update");

    const whereScoped = buildWhereById(resourceName, config, auth, id);
    const existing = await model.findFirst({ where: whereScoped, select: { [config.id]: true } });
    if (!existing) throw new Error(`${resourceName} not found`);

    const data = buildUpdateData(resourceName, config, auth, input);
    const row = await model.update({
      where: { [config.id]: Number(id) },
      data
    });

    const [enriched] = await enrichListRelations(resourceName, config, [row]);
    return enriched;
  };

  // delete
  if (!config.noRemove) {
    resolvers[`${resourceName}Delete`] = async ({ id }, context) => {
      const auth = requireAuth(context);
      await requireRight(auth, resourceName, "delete");

      const whereScoped = buildWhereById(resourceName, config, auth, id);
      const existing = await model.findFirst({ where: whereScoped, select: { [config.id]: true } });
      if (!existing) return false;

      await model.delete({ where: { [config.id]: Number(id) } });
      return true;
    };
  }
}

/**
 * Job GraphQL resolvers (complaint management)
 */
resolvers.job = async ({ id }, context) => {
  const auth = requireAuth(context);
  const row = await jobsWorkflowService.details(auth, id);
  row.jobdetails = row.jobdetails || [];
  row.jobattachments = row.jobattachments || [];
  row.jobassignmentlog = row.jobassignmentlog || [];
  row.jobstatuslog = row.jobstatuslog || [];
  row.jobcustomerremarkslog = row.jobcustomerremarkslog || [];
  return row;
};

resolvers.jobs = async (args, context) => {
  const auth = requireAuth(context);
  const scope = { tenantid: Number(auth.tenantid), branchid: Number(auth.branchid) };

  const page = Math.max(1, Number(args?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(args?.pageSize ?? 25)));
  const skip = (page - 1) * pageSize;

  const where = { ...scope };
  if (args?.statusid) where.statusid = Number(args.statusid);
  if (args?.assignedto) where.assignedto = Number(args.assignedto);
  if (args?.customerid) where.customerid = Number(args.customerid);
  if (args?.from || args?.to) {
    where.date = {};
    if (args.from) where.date.gte = new Date(String(args.from));
    if (args.to) where.date.lte = new Date(String(args.to));
  }
  if (args?.search) {
    const q = String(args.search).trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { manualjobno: { contains: q, mode: "insensitive" } }
      ];
    }
  }

  const [total, rows] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { recno: "desc" },
      skip,
      take: pageSize,
      include: {
        jobdetails: true,
        jobattachments: true,
        jobassignmentlog: true,
        jobstatuslog: true,
        jobcustomerremarkslog: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { data: rows, pageInfo: { page, pageSize, total, totalPages } };
};

resolvers.jobTimeline = async ({ id }, context) => {
  const auth = requireAuth(context);
  const data = await jobsWorkflowService.timeline(auth, id);
  return (data || []).map((e) => ({ ...e, at: e.at ? new Date(e.at).toISOString() : null }));
};

resolvers.jobAttachments = async ({ id }, context) => {
  const auth = requireAuth(context);
  const list = await jobsWorkflowService.listAttachments(auth, id);
  return list.data || [];
};

resolvers.jobCreate = async ({ input }, context) => {
  const auth = requireAuth(context);

  const job = await prisma.$transaction(async () => {
    const code = await nextJobCode(auth);
    return jobsWorkflowService.create(auth, { ...input, code });
  });

  void sendMailSafe({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `New Job Created (${job.code || job.recno})`,
    text: `A new job was created.\nJob: ${job.code || job.recno}\nTenant: ${auth.tenantid}\nBranch: ${auth.branchid}`
  });

  return jobsWorkflowService.details(auth, job.recno);
};

resolvers.jobUpdate = async ({ id, input }, context) => {
  const auth = requireAuth(context);
  await jobsWorkflowService.update(auth, id, input);
  return jobsWorkflowService.details(auth, id);
};

resolvers.jobAssign = async ({ id, assignedto, remarks }, context) => {
  const auth = requireAuth(context);
  const res = await jobsWorkflowService.assignTechnician(auth, id, { assignedto, remarks });
  void sendMailSafe({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `Job Assigned (${id})`,
    text: `Job ${id} assigned to user ${assignedto}.${remarks ? `\nRemarks: ${remarks}` : ""}`
  });
  return res.message || "Assigned";
};

resolvers.jobChangeStatus = async ({ id, tostatus, remarks }, context) => {
  const auth = requireAuth(context);
  const created = await jobsWorkflowService.createStatusLog(auth, id, { tostatus, remarks });
  void sendMailSafe({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `Job Status Changed (${id})`,
    text: `Job ${id} status changed to ${tostatus}.${remarks ? `\nRemarks: ${remarks}` : ""}`
  });
  return created;
};

resolvers.jobAddCustomerRemark = async ({ id, remarks }, context) => {
  const auth = requireAuth(context);
  return jobsWorkflowService.createCustomerRemark(auth, id, { remarks });
};

resolvers.jobUploadAttachment = async ({ id, input }, context) => {
  const auth = requireAuth(context);
  const buffer = Buffer.from(String(input.base64), "base64");
  if (!buffer.length) throw new Error("Invalid attachment base64");

  const job = await jobsWorkflowService.getScopedJob(auth, id);
  const dir = path.join(
    process.cwd(),
    "uploads",
    "jobs",
    String(auth.tenantid),
    String(auth.branchid),
    String(job.recno)
  );
  ensureDir(dir);

  const ext = input.mimeType && String(input.mimeType).includes("/")
    ? `.${String(input.mimeType).split("/")[1].replace(/[^\w]+/g, "")}`
    : "";
  const fileName = `${Date.now()}_${safeFilename(input.attachmentname)}${ext}`;
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, buffer);

  const publicUrl = `/uploads/jobs/${auth.tenantid}/${auth.branchid}/${job.recno}/${fileName}`;
  const created = await jobsWorkflowService.createAttachment(auth, id, {
    attachmentname: input.attachmentname,
    url: publicUrl,
    remarks: input.remarks
  });

  void sendMailSafe({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `Job Attachment Uploaded (${job.code || job.recno})`,
    text: `Attachment uploaded for job ${job.code || job.recno}.\n${publicUrl}`
  });

  return created;
};

module.exports = {
  typeDefs,
  resolvers
};
