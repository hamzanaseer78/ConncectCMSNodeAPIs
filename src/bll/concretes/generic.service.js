const resources = require("../../config/resources");
const GenericRepository = require("../../dataaccess/concretes/generic.repository");
const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");
const { coerceValue, getListFilterFields, getListScalarFields, getRelationInclude, getScalarFields, getSortableFields } = require("../../utils/prisma-metadata");

const MAX_PAGE_SIZE = 100;

class GenericService {
  constructor(resourceName) {
    const config = resources[resourceName];

    if (!config) {
      throw new Error("Unknown resource");
    }

    this.resourceName = resourceName;
    this.config = config;
    this.repo = new GenericRepository(resourceName, config.id);
    this.listScalarFields = getListScalarFields(this.resourceName, this.config);
    this.listFilterFields = getListFilterFields(this.resourceName, this.config);
    this.scalarFields = getScalarFields(this.resourceName);
    this.scalarFieldMap = new Map(this.scalarFields.map((field) => [field.name, field]));
    this.sortableSet = new Set(
      getSortableFields(this.resourceName)
        .filter((field) => this.listFilterFields.some((listField) => listField.name === field.name))
        .map((field) => field.name)
    );
    this.listRelations = Object.values(this.config.listRelations || {});
    this.listRelationByOutput = new Map(this.listRelations.map((relation) => [relation.output, relation]));
    this.relationInclude = getRelationInclude(this.resourceName);
  }

  buildScope(auth,options = {}) {
    const where = {};

    if (this.config.tenantScoped && auth?.tenantid) {
      where.tenantid = Number(auth.tenantid);
    }

    if (this.config.branchScoped && auth?.branchid ) {
      where.branchid = Number(auth.branchid);
    }

    return where;
  }

  async list(auth, query = {}) {
    const pagination = this.buildPagination(query);
    const where = {
      ...this.buildFilters(query),
      ...this.buildScope(auth)
    };
    const orderBy = this.buildOrderBy(query);
    const [items, total] = await Promise.all([
      this.repo.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy,
        include: this.buildListInclude()
      }),
      this.repo.count(where)
    ]);

    return {
      data: this.toListRows(items),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize)
      },
      filters: this.getAvailableFilters()
    };
  }

  async get(id, auth) {
    const row = await this.repo.findOne(id, this.buildScope(auth));

    if (!row) {
      throw new Error("Record not found");
    }

    return this.sanitizeRow(row);
  }

  async getDetails(id, auth) {
    const row = await this.repo.findOneWithInclude(id, this.buildScope(auth), this.relationInclude);

    if (!row) {
      throw new Error("Record not found");
    }

    return this.sanitizeRow(row);
  }

  toListRows(rows) {
    return rows.map((row) => this.toListRow(row));
  }

  toListRow(row) {
    const dto = {};

    this.listScalarFields.forEach((field) => {
      dto[field.name] = row[field.name];
    });

    this.listRelations.forEach((relationConfig) => {
      const relation = row[relationConfig.relation];
      dto[relationConfig.output] = relation?.[relationConfig.field] ?? "";
    });

    return dto;
  }

  buildListInclude() {
    if (!this.listRelations.length) {
      return undefined;
    }

    return Object.fromEntries(this.listRelations.map((relationConfig) => [
      relationConfig.relation,
      true
    ]));
  }

  sanitizeRow(row) {
    if (this.resourceName !== "users" || !row) {
      return row;
    }

    const { password, signuptoken, resettoken, ...safeRow } = row;
    return safeRow;
  }

  async create(data, auth) {
    if (this.config.noCreate) {
      throw new Error("Use the dedicated workflow endpoint to create this resource");
    }

    this.validateRequired(data, this.config.requiredOnCreate || []);

    return this.sanitizeRow(await this.repo.create(this.prepareCreateData(data, auth)));
  }

  async update(id, data, auth) {
    const existing = await this.get(id, auth);

    this.validateRequired(data, this.config.requiredOnUpdate || []);

    if (this.resourceName === "policies" && existing.isdefaultpolicy === true) {
      throw new Error("Default admin policy cannot be changed");
    }

    if (this.resourceName === "userorganizations" && data.isblocked === true) {
      await this.ensureUserIsNotAdmin(existing.userid, existing.tenantid, existing.branchid);
    }

    return this.sanitizeRow(await this.repo.update(id, this.prepareUpdateData(data, auth)));
  }

  buildPagination(query) {
    const page = Math.max(Number(query.page || 1), 1);
    const requestedPageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize
    };
  }

  buildOrderBy(query) {
    const sortBy = query.sortBy;
    const sortOrder = String(query.sortOrder || "asc").toLowerCase() === "desc" ? "desc" : "asc";

    if (!sortBy) {
      return undefined;
    }

    if (this.sortableSet.has(sortBy)) {
      return { [sortBy]: sortOrder };
    }

    const relationConfig = this.listRelationByOutput.get(sortBy);

    if (relationConfig) {
      return {
        [relationConfig.relation]: {
          [relationConfig.field]: sortOrder
        }
      };
    }

    return undefined;
  }

  getSortableListColumns() {
    return [
      ...this.listFilterFields.map((field) => field.name),
      ...this.listRelations.map((relationConfig) => relationConfig.output)
    ];
  }

  buildFilters(query) {
    const where = {};
    const ignored = new Set(["page", "pageSize", "limit", "sortBy", "sortOrder"]);

    this.listFilterFields.forEach((field) => {
      if (ignored.has(field.name)) {
        return;
      }

      const value = query[field.name];

      if (value !== undefined) {
        where[field.name] = coerceValue(field, value);
      }
    });

    Object.entries(this.config.listRelations || {}).forEach(([sourceField]) => {
      const value = query[sourceField];

      if (value !== undefined) {
        const field = this.scalarFieldMap.get(sourceField);
        where[sourceField] = field ? coerceValue(field, value) : value;
      }
    });

    return where;
  }

  getAvailableFilters() {
    const scalarFilters = this.listFilterFields.map((field) => {
      const operators = ["equals"];

      return {
        field: field.name,
        type: field.type,
        operators
      };
    });

    const relationFilters = Object.keys(this.config.listRelations || {}).map((sourceField) => {
      const field = this.scalarFieldMap.get(sourceField);

      return {
      field: sourceField,
      type: field?.type || "Int",
      operators: ["equals"]
      };
    });

    return [
      ...scalarFilters,
      ...relationFilters
    ];
  }

  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter((field) => data[field] === undefined || data[field] === null || data[field] === "");

    if (missing.length) {
      throw new Error(`Required fields missing: ${missing.join(", ")}`);
    }
  }

  async delete(id, auth) {

  if (this.config.noRemove) {
      throw new Error("You cannot delete this resource");
    }

    const existing = await this.get(id, auth);

    if (this.resourceName === "policies" && existing.isdefaultpolicy === true) {
      throw new Error("Default admin policy cannot be deleted");
    }

    return this.repo.delete(id);
  }

  prepareCreateData(data, auth) {
    const now = utcNow();
    const next = { ...data };

    delete next[this.config.id];

    if (this.config.tenantScoped) {
      next.tenantid = Number(auth.tenantid);
    }

    if (this.config.branchScoped) {
      next.branchid = Number(data.branchid || auth.branchid);
    }

    if ("createdby" in data || this.resourceName !== "screens") {
      next.createdby = Number(auth.userid);
    }

    if ("createdat" in data || this.resourceName !== "screens") {
      next.createdat = now;
    }

    return next;
  }

  prepareUpdateData(data, auth) {
    const next = { ...data };

    delete next[this.config.id];
    delete next.tenantid;
    delete next.createdby;
    delete next.createdat;

    if (this.config.branchScoped) {
      delete next.branchid;
    }

    if (this.resourceName === "screens") {
      next.lastupdatedby = Number(auth.userid);
      next.updatedat = utcNow();
    } else {
      next.lastupdatedby = Number(auth.userid);
      if (this.resourceName === "policies" || this.resourceName === "userpolicies" || this.resourceName === "userrights") {
        next.updatedat = utcNow();
      } else {
        next.lastupdatedat = utcNow();
      }
    }

    return next;
  }

  async ensureUserIsNotAdmin(userid, tenantid, branchid) {
    const adminPolicy = await prisma.policies.findFirst({
      where: {
        tenantid,
        isdefaultpolicy: "1"
      }
    });

    if (!adminPolicy) {
      return;
    }

    const assignment = await prisma.userpolicies.findFirst({
      where: {
        userid,
        tenantid,
        branchid,
        policyid: adminPolicy.recno
      }
    });

    if (assignment) {
      throw new Error("Admin user cannot be blocked");
    }
  }
}

module.exports = GenericService;
