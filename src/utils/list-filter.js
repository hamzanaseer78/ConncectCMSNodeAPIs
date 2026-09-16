const { coerceValue, hasCreatedByField } = require("./prisma-metadata");

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

function usesPartialStringMatch(field) {
  return field?.type === "String" && PARTIAL_MATCH_FIELDS.has(field.name);
}

function buildListFilterCondition(field, value) {
  const coerced = coerceValue(field, value);
  if (coerced === undefined) {
    return undefined;
  }

  if (usesPartialStringMatch(field)) {
    const term = String(coerced).trim();
    if (!term) {
      return undefined;
    }
    return { contains: term, mode: "insensitive" };
  }

  return coerced;
}

function listFilterOperators(field) {
  return usesPartialStringMatch(field) ? ["contains"] : ["equals"];
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
  applyDirectCreatedByFilter,
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
