const { getScalarFields, getModel } = require("./prisma-metadata");

const SORT_BY_ALIASES = {
  createdAt: "createdat",
  updatedAt: "updatedat",
  lastUpdatedAt: "lastupdatedat",
  lastupdatedAt: "lastupdatedat"
};

/**
 * Resolve default list sort field: prefer createdat, then other audit timestamps, then PK.
 */
function resolveDefaultListSortField(resourceName, idField = null) {
  const names = new Set(getScalarFields(resourceName).map((field) => field.name));

  if (names.has("createdat")) {
    return "createdat";
  }
  if (names.has("lastupdatedat")) {
    return "lastupdatedat";
  }
  if (names.has("updatedat")) {
    return "updatedat";
  }
  if (idField && names.has(idField)) {
    return idField;
  }

  const pk = getModel(resourceName)?.fields.find((field) => field.isId)?.name;
  return pk || "recno";
}

function normalizeSortBy(sortBy) {
  if (sortBy === undefined || sortBy === null || sortBy === "") {
    return null;
  }
  const key = String(sortBy).trim();
  return SORT_BY_ALIASES[key] || key;
}

function parseListSortOrder(sortOrder, defaultOrder = "desc") {
  if (sortOrder === undefined || sortOrder === null || sortOrder === "") {
    return defaultOrder;
  }
  return String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc";
}

function hasScalarField(resourceName, fieldName) {
  return getScalarFields(resourceName).some((field) => field.name === fieldName);
}

module.exports = {
  normalizeSortBy,
  parseListSortOrder,
  resolveDefaultListSortField,
  hasScalarField
};
