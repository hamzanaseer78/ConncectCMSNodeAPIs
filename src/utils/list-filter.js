const { coerceValue, hasCreatedByField } = require("./prisma-metadata");
const { startOfUtcDay, endOfUtcDay } = require("./date");

const GEO_FILTER_ALIASES = {
  countryId: "country",
  countryid: "country",
  cityId: "city",
  cityid: "city",
  areaId: "area",
  areaid: "area"
};

const CUSTOMER_PARTIAL_FIELDS = new Set(["name", "contactno", "email", "address"]);

const PARTIAL_MATCH_FIELDS = new Set(["name"]);

function parseCreatedByFilter(query = {}) {
  const value = query.createdby ?? query.createdBy;
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCreatedByNameFilter(query = {}) {
  const value = query.createdByName ?? query.createdbyname;
  if (value === undefined || value === null) {
    return undefined;
  }
  const term = String(value).trim();
  return term ? term : undefined;
}

function getCreatedByFilterMeta({ includeName = false } = {}) {
  const filters = [
    {
      field: "createdby",
      type: "Int",
      operators: ["equals"],
      description: "Filter by creator user id (alias: createdBy)"
    }
  ];
  if (includeName) {
    filters.push({
      field: "createdByName",
      type: "String",
      operators: ["contains"],
      description: "Partial match on creator name"
    });
  }
  return filters;
}

function applyDirectCreatedByFilter(where, query = {}) {
  const createdby = parseCreatedByFilter(query);
  if (createdby !== undefined) {
    where.createdby = createdby;
  }
  return where;
}

function appendJobDetailsCreatedByFilter(where, query = {}) {
  const createdby = parseCreatedByFilter(query);
  const createdByName = parseCreatedByNameFilter(query);
  if (createdby === undefined && !createdByName) {
    return where;
  }

  const detailFilter = {};
  if (createdby !== undefined) {
    detailFilter.createdby = createdby;
  }
  if (createdByName) {
    detailFilter.users_jobdetails_createdbyTousers = {
      name: { contains: createdByName, mode: "insensitive" }
    };
  }

  const existing = where.jobdetails?.some;
  if (existing) {
    where.jobdetails = { some: { AND: [existing, detailFilter] } };
  } else {
    where.jobdetails = { some: detailFilter };
  }
  return where;
}

function appendJobDetailsCreatedByToDetailFilter(detailFilter, query = {}) {
  const createdby = parseCreatedByFilter(query);
  const createdByName = parseCreatedByNameFilter(query);
  if (createdby !== undefined) {
    detailFilter.createdby = createdby;
  }
  if (createdByName) {
    detailFilter.users_jobdetails_createdbyTousers = {
      name: { contains: createdByName, mode: "insensitive" }
    };
  }
  return detailFilter;
}

function parseFilterDay(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function applyCreatedAtRangeFilter(where, query = {}) {
  const from = parseFilterDay(query.fromDate ?? query.FromDate);
  const to = parseFilterDay(query.toDate ?? query.ToDate);
  if (!from && !to) {
    return where;
  }
  const range = {};
  if (from) range.gte = startOfUtcDay(from);
  if (to) range.lt = endOfUtcDay(to);
  where.createdat = range;
  return where;
}

function applyGeoFilterAliases(where, query = {}, coerceField) {
  Object.entries(GEO_FILTER_ALIASES).forEach(([alias, field]) => {
    if (where[field] !== undefined) return;
    const value = query[alias];
    if (value === undefined || value === null || value === "") return;
    where[field] = typeof coerceField === "function" ? coerceField(field, value) : value;
  });
  return where;
}

function usesPartialStringMatch(field, resourceName) {
  if (field?.type !== "String") return false;
  if (resourceName === "customers" && CUSTOMER_PARTIAL_FIELDS.has(field.name)) return true;
  return PARTIAL_MATCH_FIELDS.has(field.name);
}

function buildListFilterCondition(field, value, resourceName) {
  const coerced = coerceValue(field, value);
  if (coerced === undefined) {
    return undefined;
  }

  if (usesPartialStringMatch(field, resourceName)) {
    const term = String(coerced).trim();
    if (!term) {
      return undefined;
    }
    return { contains: term, mode: "insensitive" };
  }

  return coerced;
}

function listFilterOperators(field, resourceName) {
  return usesPartialStringMatch(field, resourceName) ? ["contains"] : ["equals"];
}

function listFilterDescription(field) {
  if (usesPartialStringMatch(field)) {
    return `Partial match on ${field.name} (case-insensitive)`;
  }
  return `Filter ${field.name} by exact value`;
}

function buildNameContainsFilter(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const term = String(value).trim();
  if (!term) {
    return undefined;
  }
  return { contains: term, mode: "insensitive" };
}

module.exports = {
  applyCreatedAtRangeFilter,
  applyDirectCreatedByFilter,
  applyGeoFilterAliases,
  appendJobDetailsCreatedByFilter,
  appendJobDetailsCreatedByToDetailFilter,
  buildListFilterCondition,
  buildNameContainsFilter,
  getCreatedByFilterMeta,
  listFilterDescription,
  listFilterOperators,
  parseCreatedByFilter,
  parseCreatedByNameFilter,
  usesPartialStringMatch
};
