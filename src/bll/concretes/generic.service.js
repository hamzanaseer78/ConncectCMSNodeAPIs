const resources = require("../../config/resources");
const GenericRepository = require("../../dataaccess/concretes/generic.repository");
const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");
const {
  assignNewScreenToDefaultAdminPolicies,
  assignAllScreensToNewPolicy
} = require("../../services/screen-admin-rights.service");
const {
  extractRightsArray,
  updatePolicyRights: applyPolicyRightsUpdate
} = require("../../services/policy-rights.service");
const { coerceValue, getListFilterFields, getListScalarFields, getRelationInclude, getScalarFields, getSortableFields, getPrismaDelegateName, hasCreatedByField } = require("../../utils/prisma-metadata");
const { normalizeGenericIncoming } = require("../../utils/generic-payload");
const {
  normalizeSortBy,
  parseListSortOrder,
  resolveDefaultListSortField
} = require("../../utils/list-sort");
const {
  buildListFilterCondition,
  listFilterOperators,
  applyDirectCreatedByFilter,
  getCreatedByFilterMeta
} = require("../../utils/list-filter");
const { normalizeProductPayload, resolveProductForeignKeys, enrichProductResponse } = require("../../utils/product-payload");
const {
  normalizeErpProductPayload,
  resolveErpProductForeignKeys,
  enrichErpProductResponse
} = require("../../utils/erp-product-payload");
const {
  attachCustomerAddressFields,
  CUSTOMER_ADDRESS_INCLUDE,
  extractAdditionalAddressesInput,
  syncAdditionalAddresses
} = require("../../services/customer-addresses.service");
const { defaultAddressFromCustomer } = require("../../utils/customer-address");
const { assertDefinitionUniqueness } = require("../../services/definition-uniqueness.service");
const { assertCustomerPhoneAvailable } = require("../../utils/customer-phone");
const {
  resolveOrganizationBranchScope,
  fetchOrganizationUserIds,
  assertUserBelongsToOrganization,
  createOrganizationUser
} = require("../../utils/user-organization");
const { resolveUserTypeFromInput } = require("../../utils/user-type");
const { applyTechnicianAffiliationFields } = require("../../utils/technician-affiliation");
const { applyManagerFields, formatManagerFields } = require("../../utils/user-manager");
const { syncPostgresSequence } = require("../../utils/postgres-sequence");
const { buildResourceScopeWhere, requiresTenantScope } = require("../../utils/resource-scope");
const bcrypt = require("bcryptjs");

const MAX_PAGE_SIZE = 100;

const CATALOG_PRODUCT_HANDLERS = {
  products: {
    normalize: normalizeProductPayload,
    resolveFk: resolveProductForeignKeys,
    enrich: enrichProductResponse
  },
  erpproducts: {
    normalize: normalizeErpProductPayload,
    resolveFk: resolveErpProductForeignKeys,
    enrich: enrichErpProductResponse
  }
};

function getCatalogProductHandlers(resourceName) {
  return CATALOG_PRODUCT_HANDLERS[resourceName] || null;
}

class GenericService {
  constructor(resourceName) {
    const config = resources[resourceName];

    if (!config) {
      throw new Error("Unknown resource");
    }

    this.resourceName = resourceName;
    this.config = config;
    this.repo = new GenericRepository(getPrismaDelegateName(resourceName), config.id);
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

  buildScope(auth, options = {}) {
    return buildResourceScopeWhere(this.resourceName, this.config, auth, options);
  }

  async list(auth, query = {}) {
    const pagination = this.buildPagination(query);
    const where = {
      ...this.buildFilters(query),
      ...this.buildScope(auth)
    };

    if (this.resourceName === "users") {
      const { tenantid, branchid } = resolveOrganizationBranchScope(auth, query);
      const userIds = await fetchOrganizationUserIds(tenantid, branchid);
      where.userid = userIds.length ? { in: userIds } : { in: [-1] };
      where.isdeleted = { not: true };
    }

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

  async fetchCustomerRow(id, auth) {
    return this.fetchEnrichedRow(id, auth);
  }

  toCustomerDto(row) {
    if (!row) {
      return row;
    }

    const dto = {};
    this.scalarFields.forEach((field) => {
      if (!field.isList) {
        dto[field.name] = row[field.name] ?? null;
      }
    });

    const geoKeys = new Set(["country", "city", "area"]);
    Object.entries(this.config.listRelations || {}).forEach(([sourceField, relationConfig]) => {
      const relation = row[relationConfig.relation];
      if (geoKeys.has(sourceField)) {
        return;
      }
      dto[sourceField] = row[sourceField] ?? null;
      dto[relationConfig.output] = relation?.[relationConfig.field] ?? null;
    });

    const countryRel = row.countries;
    const cityRel = row.cities;
    const areaRel = row.areas;

    dto.country = row.country ?? countryRel?.recno ?? null;
    dto.city = row.city ?? cityRel?.recno ?? null;
    dto.area = row.area ?? areaRel?.recno ?? null;
    dto.countryname = countryRel?.name ?? null;
    dto.cityname = cityRel?.name ?? null;
    dto.areaname = areaRel?.name ?? null;

    dto.countryId = dto.country;
    dto.cityId = dto.city;
    dto.areaId = dto.area;
    dto.countryName = dto.countryname;
    dto.cityName = dto.cityname;
    dto.areaName = dto.areaname;

    if (row.customeraddresses) {
      attachCustomerAddressFields(dto, row);
    } else {
      attachCustomerAddressFields(dto, {
        ...row,
        customeraddresses: []
      });
    }

    return dto;
  }

  buildCustomerInclude() {
    return {
      countries: true,
      cities: true,
      areas: true,
      branches: true,
      customeraddresses: {
        include: CUSTOMER_ADDRESS_INCLUDE,
        orderBy: { recno: "asc" }
      }
    };
  }

  async fetchEnrichedRow(id, auth) {
    if (this.resourceName === "customers") {
      return prisma.customers.findFirst({
        where: {
          ...this.buildScope(auth),
          customerid: Number(id)
        },
        include: this.buildCustomerInclude()
      });
    }

    return this.repo.findOneWithInclude(
      id,
      this.buildScope(auth),
      this.buildListInclude() || this.relationInclude
    );
  }

  async get(id, auth) {
    if (this.resourceName === "users") {
      await assertUserBelongsToOrganization(id, auth.tenantid);
      const row = await this.repo.findOne(id);
      if (!row || row.isdeleted === true) {
        throw new Error("Record not found");
      }
      return this.sanitizeRow(row);
    }

    if (this.resourceName === "customers") {
      const row = await this.fetchEnrichedRow(id, auth);
      if (!row) {
        throw new Error("Record not found");
      }
      return this.toCustomerDto(row);
    }

    if (this.resourceName === "products" || this.resourceName === "erpproducts") {
      const handlers = getCatalogProductHandlers(this.resourceName);
      const row = await this.repo.findOneWithInclude(
        id,
        this.buildScope(auth),
        this.relationInclude
      );
      if (!row) {
        throw new Error("Record not found");
      }
      return handlers.enrich(this.sanitizeRow(row));
    }

    const row = await this.repo.findOne(id, this.buildScope(auth));
    if (!row) {
      throw new Error("Record not found");
    }
    return this.sanitizeRow(row);
  }

  async getDetails(id, auth) {
    if (this.resourceName === "users") {
      return this.get(id, auth);
    }

    if (this.resourceName === "customers") {
      return this.get(id, auth);
    }

    if (this.resourceName === "policies") {
      return this.getPolicyDetails(id, auth);
    }

    const row = await this.repo.findOneWithInclude(id, this.buildScope(auth), this.relationInclude);
    if (!row) {
      throw new Error("Record not found");
    }
    if (this.resourceName === "products" || this.resourceName === "erpproducts") {
      return getCatalogProductHandlers(this.resourceName).enrich(this.sanitizeRow(row));
    }
    return this.sanitizeRow(row);
  }

  async getPolicyDetails(id, auth) {
    const scope = this.buildScope(auth);
    const policy = await prisma.policies.findFirst({
      where: { ...scope, recno: Number(id) },
      include: {
        userrights: {
          orderBy: [{ screenid: "asc" }, { branchid: "asc" }],
          include: {
            screens: {
              select: {
                screenid: true,
                screenname: true,
                controllername: true,
                screengroup: true
              }
            },
            branches: { select: { branchid: true, name: true } }
          }
        }
      }
    });

    if (!policy) {
      throw new Error("Record not found");
    }

    const { userrights, ...policyFields } = policy;
    const userRights = (userrights || []).map((row) => this.toPolicyUserRightDto(row));

    return {
      ...this.sanitizeRow(policyFields),
      userRights
    };
  }

  toPolicyUserRightDto(row) {
    return {
      recno: row.recno,
      tenantid: row.tenantid,
      branchid: row.branchid,
      branchname: row.branches?.name ?? null,
      policyid: row.policyid,
      screenid: row.screenid,
      screenname: row.screens?.screenname ?? null,
      controllername: row.screens?.controllername ?? null,
      screengroup: row.screens?.screengroup ?? null,
      viewscreen: row.viewscreen === true,
      addscreen: row.addscreen === true,
      updatescreen: row.updatescreen === true,
      deletescreen: row.deletescreen === true,
      others: row.others === true,
      view: row.viewscreen === true,
      add: row.addscreen === true,
      update: row.updatescreen === true,
      delete: row.deletescreen === true
    };
  }

  toListRows(rows) {
    if (this.resourceName === "customers") {
      return rows.map((row) => this.toCustomerDto(row));
    }
    return rows.map((row) => this.toListRow(row));
  }

  toListRow(row) {
    const dto = {};

    this.listScalarFields.forEach((field) => {
      dto[field.name] = row[field.name];
    });

    this.listRelations.forEach((relationConfig) => {
      const relation = row[relationConfig.relation];
      dto[relationConfig.output] = relation?.[relationConfig.field] ?? null;
    });

    if (this.resourceName === "customers") {
      dto.country = row.country ?? row.countries?.recno ?? null;
      dto.city = row.city ?? row.cities?.recno ?? null;
      dto.area = row.area ?? row.areas?.recno ?? null;
      dto.countryId = dto.country;
      dto.cityId = dto.city;
      dto.areaId = dto.area;
    }

    if (this.resourceName === "products" || this.resourceName === "erpproducts") {
      return getCatalogProductHandlers(this.resourceName).enrich(dto);
    }

    if (this.resourceName === "users") {
      return {
        ...this.sanitizeRow(dto),
        ...formatManagerFields(row)
      };
    }

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

    const { password, signuptoken, resettoken, users_users_manageridTousers, ...safeRow } = row;
    return {
      ...safeRow,
      ...formatManagerFields(row)
    };
  }

  async create(data, auth) {
    if (this.resourceName === "users") {
      this.validateRequired(data, this.config.requiredOnCreate || []);
      return this.sanitizeRow(await createOrganizationUser(data, auth));
    }

    if (this.config.noCreate) {
      throw new Error("Use the dedicated workflow endpoint to create this resource");
    }

    this.validateRequired(data, this.config.requiredOnCreate || []);

    let body = data;
    const catalogHandlers = getCatalogProductHandlers(this.resourceName);
    if (catalogHandlers) {
      body = catalogHandlers.normalize(body);
      body = await catalogHandlers.resolveFk(body, auth);
    }

    let additionalAddresses;
    if (this.resourceName === "customers") {
      additionalAddresses = extractAdditionalAddressesInput(body);
      body = { ...body };
      delete body.additionalAddresses;
      delete body.additionaladdresses;
      delete body.addresses;
    }

    body = await normalizeGenericIncoming(this.resourceName, this.config, body, auth, "create");
    const payload = this.prepareCreateData(body, auth);
    await assertDefinitionUniqueness(this.resourceName, this.config, payload, auth);

    if (this.resourceName === "customers") {
      await assertCustomerPhoneAvailable(prisma, payload.contactno, {
        tenantid: payload.tenantid,
        branchid: payload.branchid
      });
    }

    if (this.resourceName === "screens") {
      let row;
      try {
        row = await prisma.$transaction(async (tx) => {
          const created = await tx.screens.create({ data: payload });
          await assignNewScreenToDefaultAdminPolicies(tx, created.screenid, auth);
          return created;
        });
      } catch (err) {
        if (err.code === "P2002") {
          const target = err.meta?.target;
          const onScreenId =
            target === "screenid" ||
            (Array.isArray(target) && target.includes("screenid"));
          if (onScreenId) {
            const hint = new Error(
              "Could not insert screen: primary key sequence is likely out of sync with existing rows. On the server run: node scripts/fix-screens-screenid-sequence.js"
            );
            hint.status = 409;
            throw hint;
          }
        }
        throw err;
      }
      return this.sanitizeRow(row);
    }

    if (this.resourceName === "policies") {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const row = await tx.policies.create({ data: payload });
          await assignAllScreensToNewPolicy(tx, row, auth);
          return row;
        });
        return this.getPolicyDetails(created.recno, auth);
      } catch (err) {
        throw this.wrapPrismaWriteError(err, "create");
      }
    }

    if (this.resourceName === "branches") {
      try {
        const created = await prisma.$transaction(async (tx) => {
          await syncPostgresSequence(tx, "branches", "branchid");
          return tx.branches.create({ data: payload });
        });
        return this.sanitizeRow(created);
      } catch (err) {
        throw this.wrapPrismaWriteError(err, "create");
      }
    }

    try {
      if (this.resourceName === "customers") {
        const created = await prisma.$transaction(async (tx) => {
          const row = await tx.customers.create({ data: payload });
          if (additionalAddresses !== undefined) {
            await syncAdditionalAddresses(tx, {
              customerid: row.customerid,
              tenantid: Number(auth.tenantid),
              branchid: Number(payload.branchid || auth.branchid),
              items: additionalAddresses,
              defaultAddress: defaultAddressFromCustomer(row),
              auth
            });
          }
          return row;
        });
        const row = await this.fetchCustomerRow(created.customerid, auth);
        return this.toCustomerDto(row || created);
      }

      const created = await this.repo.create(payload);
      const createdCatalogHandlers = getCatalogProductHandlers(this.resourceName);
      if (createdCatalogHandlers) {
        const row = await this.repo.findOneWithInclude(
          created[this.config.id],
          this.buildScope(auth),
          this.relationInclude
        );
        return createdCatalogHandlers.enrich(this.sanitizeRow(row || created));
      }
      return this.sanitizeRow(created);
    } catch (err) {
      throw this.wrapPrismaWriteError(err, "create");
    }
  }

  async updatePolicyRights(id, auth, body) {
    await applyPolicyRightsUpdate(id, auth, body);
    return this.getPolicyDetails(id, auth);
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

    let body = { ...data };
    const catalogHandlers = getCatalogProductHandlers(this.resourceName);
    if (catalogHandlers) {
      body = catalogHandlers.normalize(body);
      body = await catalogHandlers.resolveFk(body, auth);
    }

    if (this.resourceName === "users") {
      if (body.usertype !== undefined || body.userType !== undefined || body.type !== undefined) {
        body.usertype = resolveUserTypeFromInput(body, { required: true });
        delete body.userType;
        delete body.type;
      }
      const effectiveType = body.usertype ?? existing.usertype;
      Object.assign(
        body,
        applyTechnicianAffiliationFields(body, effectiveType, { mode: "update" })
      );
      Object.assign(
        body,
        await applyManagerFields(body, effectiveType, {
          mode: "update",
          tenantid: Number(auth.tenantid),
          technicianUserId: Number(id)
        })
      );
      delete body.technicianAffiliation;
      delete body.technicianType;
      delete body.companyName;
      delete body.thirdPartyCompany;
      delete body.managerId;
      delete body.manager;
      delete body.branchid;
      delete body.tenantid;
      if (body.password != null && String(body.password).trim() !== "") {
        body.password = await bcrypt.hash(String(body.password), 10);
      } else {
        delete body.password;
      }
    }

    const rightsPayload = this.resourceName === "policies" ? extractRightsArray(body) : null;
    if (rightsPayload) {
      delete body.userRights;
      delete body.userrights;
      delete body.rights;
    }

    let additionalAddresses;
    if (this.resourceName === "customers") {
      additionalAddresses = extractAdditionalAddressesInput(body);
      delete body.additionalAddresses;
      delete body.additionaladdresses;
      delete body.addresses;
    }

    body = await normalizeGenericIncoming(this.resourceName, this.config, body, auth, "update");
    try {
      if (this.resourceName === "customers") {
        const hasCustomerFields = Object.keys(body).length > 0;
        if (Object.prototype.hasOwnProperty.call(body, "contactno")) {
          const customer = await prisma.customers.findFirst({
            where: {
              ...this.buildScope(auth),
              customerid: Number(id)
            },
            select: { tenantid: true, branchid: true }
          });
          if (!customer) {
            throw new Error("Record not found");
          }
          await assertCustomerPhoneAvailable(prisma, body.contactno, customer, {
            excludeCustomerId: Number(id)
          });
        }
        if (!hasCustomerFields && additionalAddresses === undefined) {
          const row = await this.fetchCustomerRow(id, auth);
          return this.toCustomerDto(row);
        }

        await prisma.$transaction(async (tx) => {
          if (hasCustomerFields) {
            await tx.customers.update({
              where: { customerid: Number(id) },
              data: this.prepareUpdateData(body, auth)
            });
          }

          if (additionalAddresses !== undefined) {
            const customer = await tx.customers.findFirst({
              where: {
                ...this.buildScope(auth),
                customerid: Number(id)
              }
            });
            if (!customer) {
              throw new Error("Record not found");
            }
            await syncAdditionalAddresses(tx, {
              customerid: customer.customerid,
              tenantid: customer.tenantid,
              branchid: customer.branchid,
              items: additionalAddresses,
              defaultAddress: defaultAddressFromCustomer(customer),
              auth
            });
          }
        });

        const row = await this.fetchCustomerRow(id, auth);
        return this.toCustomerDto(row);
      }

      const updatePayload = this.prepareUpdateData(body, auth);
      const hasPolicyFields = Object.keys(updatePayload).length > 0;
      if (hasPolicyFields) {
        await assertDefinitionUniqueness(
          this.resourceName,
          this.config,
          { ...existing, ...updatePayload },
          auth,
          { excludeId: id }
        );
        await this.repo.update(id, updatePayload);
      }
      if (this.resourceName === "policies" && rightsPayload?.length) {
        await applyPolicyRightsUpdate(id, auth, { userRights: rightsPayload });
        return this.getPolicyDetails(id, auth);
      }
      const updatedCatalogHandlers = getCatalogProductHandlers(this.resourceName);
      if (updatedCatalogHandlers) {
        const row = await this.repo.findOneWithInclude(
          id,
          this.buildScope(auth),
          this.relationInclude
        );
        return updatedCatalogHandlers.enrich(this.sanitizeRow(row));
      }
      if (this.resourceName === "policies") {
        return this.getPolicyDetails(id, auth);
      }
      return this.sanitizeRow(await this.repo.findOne(id, this.buildScope(auth)));
    } catch (err) {
      throw this.wrapPrismaWriteError(err, "update");
    }
  }

  wrapPrismaWriteError(err, action) {
    if (err.status) {
      return err;
    }
    if (err.code === "P2003") {
      const field = err.meta?.field_name || "reference";
      const hint = new Error(
        `Invalid related record (${field}). For customers use country/city/area IDs or names ` +
          "(countryname, cityname, areaname); city must belong to country and area to city."
      );
      hint.status = 400;
      return hint;
    }
    if (err.code === "P2025") {
      const hint = new Error("Record not found");
      hint.status = 404;
      return hint;
    }
    return err;
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
    const sortBy = normalizeSortBy(query.sortBy);
    const sortOrder = parseListSortOrder(query.sortOrder);

    if (sortBy) {
      if (this.sortableSet.has(sortBy) || this.scalarFieldMap.has(sortBy)) {
        return { [sortBy]: sortOrder };
      }

      const relationConfig =
        this.listRelationByOutput.get(sortBy) ||
        (query.sortBy ? this.listRelationByOutput.get(String(query.sortBy)) : null);

      if (relationConfig) {
        return {
          [relationConfig.relation]: {
            [relationConfig.field]: sortOrder
          }
        };
      }
    }

    const defaultField = resolveDefaultListSortField(this.resourceName, this.config.id);
    return { [defaultField]: "desc" };
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
        const condition = buildListFilterCondition(field, value);
        if (condition !== undefined) {
          where[field.name] = condition;
        }
      }
    });

    Object.entries(this.config.listRelations || {}).forEach(([sourceField]) => {
      const value = query[sourceField];

      if (value !== undefined) {
        const field = this.scalarFieldMap.get(sourceField);
        where[sourceField] = field ? coerceValue(field, value) : value;
      }
    });

    if (hasCreatedByField(this.resourceName)) {
      applyDirectCreatedByFilter(where, query);
    }

    return where;
  }

  getAvailableFilters() {
    const scalarFilters = this.listFilterFields.map((field) => ({
      field: field.name,
      type: field.type,
      operators: listFilterOperators(field)
    }));

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
      ...relationFilters,
      ...(hasCreatedByField(this.resourceName) ? getCreatedByFilterMeta() : [])
    ];
  }

  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter((field) => data[field] === undefined || data[field] === null || data[field] === "");

    if (missing.length) {
      throw new Error(`Required fields missing: ${missing.join(", ")}`);
    }
  }

  async delete(id, auth) {
    if (this.resourceName === "users") {
      await assertUserBelongsToOrganization(id, auth.tenantid);
      const now = utcNow();
      const row = await prisma.users.update({
        where: { userid: Number(id) },
        data: {
          isdeleted: true,
          isactive: false,
          lastupdatedby: Number(auth.userid),
          lastupdatedat: now
        }
      });
      return this.sanitizeRow(row);
    }

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
    // Clients must never supply PK on create; keeps Prisma from inserting explicit ids.
    if (this.resourceName === "screens") {
      delete next.screenid;
    }

    if (requiresTenantScope(this.resourceName, this.config)) {
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
