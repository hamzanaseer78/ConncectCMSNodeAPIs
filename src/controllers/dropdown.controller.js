/**
 * Dropdown Controller
 * Handles dropdown list requests without RBAC
 * Used for form dropdowns, filters, etc.
 */

const prisma = require("../database/prisma");
const { getListScalarFields, getPrismaDelegateName, getScalarFields } = require("../utils/prisma-metadata");
const { formatProductDropdownRow, PRODUCT_DROPDOWN_SELECT } = require("../utils/product-payload");
const {
  formatErpProductDropdownRow,
  ERP_PRODUCT_DROPDOWN_SELECT
} = require("../utils/erp-product-payload");
const { formatUserDropdownRow } = require("../utils/user-dropdown");
const { listWorldCountriesDropdown } = require("../data/world-countries");
const { listWorldCitiesDropdown } = require("../data/world-cities");
const {
  resolveOrganizationBranchScope,
  fetchOrganizationUserIds
} = require("../utils/user-organization");
const {
  resolveDropdownPaging,
  applyProductSearchFilter,
  isTruthyQueryFlag
} = require("../utils/dropdown-query");
const { buildResourceScopeWhere, normalizeAuthScope } = require("../utils/resource-scope");
const customerAddressesService = require("../services/customer-addresses.service");
const resources = require("../config/resources");

function parseIntQuery(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function applyDropdownFilters(config, query = {}) {
  const defs = config.dropdownFilters;
  if (!Array.isArray(defs) || !defs.length) {
    return {};
  }

  const applied = {};
  defs.forEach((def) => {
    let raw;
    for (const param of def.params || []) {
      if (query[param] !== undefined && query[param] !== "") {
        raw = query[param];
        break;
      }
    }
    const value = parseIntQuery(raw);
    if (value !== undefined) {
      applied[def.field] = value;
    }
  });
  return applied;
}

function applyActiveEntryFilter(where, resourceName) {
  const hasIsActive = getScalarFields(resourceName).some((field) => field.name === "isactive");
  if (hasIsActive && where.isactive === undefined) {
    where.isactive = { not: false };
  }
}

class DropdownController {
  /**
   * Get dropdown list for a resource
   * Only requires JWT authentication (no rights checking)
   * Returns only data for the authenticated user's tenant and branch
   *
   * Optional parent filters (when configured on the resource):
   * - jobcategories?groupId=1
   * - jobsubcategories?categoryId=2
   * - cities?countryId=3
   * - areas?cityId=4
   */
  async getDropdown(resourceName, auth, query = {}) {
    const config = resources[resourceName];

    if (!config) {
      throw new Error(`Unknown resource: ${resourceName}`);
    }

    if (config.backendOnly) {
      const err = new Error(`Dropdown is not available for resource: ${resourceName}`);
      err.status = 404;
      throw err;
    }

    if (config.tenantScoped === false && !config.organizationScoped) {
      const err = new Error(`Dropdown is not available for global resource: ${resourceName}`);
      err.status = 404;
      throw err;
    }

    const normalizedAuth = normalizeAuthScope(auth);
    const idField = config.id;
    const model = prisma[getPrismaDelegateName(resourceName)];

    const where = buildResourceScopeWhere(resourceName, config, normalizedAuth);

    const parentFilters = applyDropdownFilters(config, query);
    Object.assign(where, parentFilters);

    if (resourceName === "users" || config.organizationScoped) {
      const { tenantid, branchid } = resolveOrganizationBranchScope(normalizedAuth, query);
      const userIds = await fetchOrganizationUserIds(tenantid, branchid);
      where.userid = userIds.length ? { in: userIds } : { in: [-1] };
      where.isdeleted = { not: true };
    }

    if (resourceName === "products" || resourceName === "erpproducts") {
      applyProductSearchFilter(where, query);
    }

    if (!isTruthyQueryFlag(query.includeInactive)) {
      applyActiveEntryFilter(where, resourceName);
    }

    let selectFields;
    if (resourceName === "products") {
      selectFields = { ...PRODUCT_DROPDOWN_SELECT };
    } else if (resourceName === "erpproducts") {
      selectFields = { ...ERP_PRODUCT_DROPDOWN_SELECT };
    } else {
      const scalarFields = getScalarFields(resourceName);
      selectFields = scalarFields.reduce((acc, field) => {
        acc[field.name] = true;
        return acc;
      }, {});
      selectFields[idField] = true;

      if (resourceName === "customers") {
        selectFields.contactno = true;
      }

      if (resourceName === "jobsubcategories") {
        selectFields.defaultuser = true;
      }

      if (resourceName === "users" || config.organizationScoped) {
        selectFields.name = true;
        selectFields.email = true;
        selectFields.usertype = true;
        selectFields.technicianaffiliation = true;
        selectFields.companyname = true;
      }
    }

    const paging = resolveDropdownPaging(resourceName, query);

    const findArgs = {
      where,
      select: selectFields,
      orderBy: { [idField]: "asc" }
    };
    if (paging.take != null) {
      findArgs.take = paging.take;
      findArgs.skip = paging.skip;
    }

    const [total, items] = await Promise.all([
      model.count({ where }),
      model.findMany(findArgs)
    ]);

    const labelField =
      resourceName === "users" || config.organizationScoped
        ? "name"
        : resourceName === "products" || resourceName === "erpproducts"
          ? "name"
          : getListScalarFields(resourceName, config).find((f) => f.type === "String")?.name || "name";

    const dropdown = items.map((item) => {
      if (resourceName === "products") {
        return formatProductDropdownRow(item);
      }
      if (resourceName === "erpproducts") {
        return formatErpProductDropdownRow(item);
      }

      const row = {
        value: item[idField],
        label: item[labelField] || `${resourceName} #${item[idField]}`
      };
      if (resourceName === "customers") {
        row.phoneNo = item.contactno ?? null;
      }
      if (resourceName === "jobsubcategories") {
        row.defaultuser = item.defaultuser ?? null;
      }
      if (resourceName === "users" || config.organizationScoped) {
        return formatUserDropdownRow(item, { idField, labelField });
      }
      return row;
    }).filter(Boolean);

    return {
      data: dropdown,
      total,
      returned: dropdown.length,
      truncated: total > dropdown.length,
      resource: resourceName,
      scope: {
        tenantid: where.tenantid ?? null,
        branchid: where.branchid ?? null
      },
      filters: parentFilters,
      paging: {
        page: paging.page,
        pageSize: paging.pageSize,
        unlimited: paging.unlimited
      }
    };
  }

  /**
   * Public overall countries list (no auth, static ISO 3166-1 reference).
   */
  async getOverallCountries() {
    const data = listWorldCountriesDropdown();

    return {
      data,
      total: data.length,
      resource: "countries",
      scope: "overall",
      source: "static"
    };
  }

  /**
   * Public overall cities for a selected country (no auth, static reference).
   * countryId = ISO 3166-1 numeric code from overall/countries (or countryCode alpha-2).
   */
  getOverallCities(query = {}) {
    const countryCodeRaw = query.countryCode ?? query.countrycode;
    const countryIdRaw =
      query.countryId ?? query.countryid ?? query.country ?? countryCodeRaw;

    if (countryIdRaw === undefined || countryIdRaw === null || countryIdRaw === "") {
      const err = new Error(
        "countryId is required (ISO numeric code from overall/countries, or countryCode e.g. PK or 586)"
      );
      err.status = 400;
      throw err;
    }

    const result = listWorldCitiesDropdown(countryIdRaw);
    if (!result) {
      const err = new Error(`Country not found for countryId ${countryIdRaw}`);
      err.status = 404;
      throw err;
    }

    const { country, data } = result;

    return {
      data,
      total: data.length,
      resource: "cities",
      scope: "overall",
      source: "static",
      countryId: country.numeric,
      countryCode: country.code,
      countryName: country.name,
      filters: { countryid: country.numeric, countryCode: country.code }
    };
  }

  async getCustomerAddresses(auth, query = {}) {
    return customerAddressesService.listCustomerAddressDropdown(auth, query);
  }
}

const dropdownController = new DropdownController();

module.exports = dropdownController;
