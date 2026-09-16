const { Prisma } = require("@prisma/client");
const resources = require("../config/resources");
const modelCache = new Map();
const scalarFieldsCache = new Map();
const filterableFieldsCache = new Map();
const sortableFieldsCache = new Map();
const listScalarFieldsCache = new Map();
const relationIncludeCache = new Map();

const ignoredInputFields = new Set([
  "createdby",
  "createdat",
  "lastupdatedby",
  "lastupdatedat",
  "updatedat",
  "blockedby",
  "blockedat",
  "tokenusedat",
  "logcreatedat"
]);

const hiddenListFields = new Set([
  "tenantid",
  "branchid",
  "createdby",
  "createdat",
  "lastupdatedby",
  "lastupdatedat",
  "updatedat",
  "blockedby",
  "blockedat",
  "tokenusedat",
  "logcreatedat",
  "createdtenantid",
  "password",
  "signuptoken",
  "resettoken",
  "resettokengendatetime",
  "istokenused",
  "tokenusedat",
  "signupip",
  "signuplatitude",
  "signuplongitude"
]);

/**
 * Prisma client delegate and DMMF model name (when API resource key differs from schema model).
 * Example: resource `jobstauses` → model `jobstatuses`.
 */
function getPrismaDelegateName(resourceName) {
  const cfg = resources[resourceName];
  return (cfg && cfg.prismaModel) || resourceName;
}

function getModel(resourceName) {
  if (!modelCache.has(resourceName)) {
    const prismaName = getPrismaDelegateName(resourceName);
    const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === prismaName) || null;
    modelCache.set(resourceName, model);
  }

  return modelCache.get(resourceName);
}

function getScalarFields(resourceName) {
  if (!scalarFieldsCache.has(resourceName)) {
    const model = getModel(resourceName);
    const scalarFields = model ? model.fields.filter((field) => field.kind === "scalar") : [];
    scalarFieldsCache.set(resourceName, scalarFields);
  }

  return scalarFieldsCache.get(resourceName);
}

function getWritableFields(resourceName, config, mode) {
  return getScalarFields(resourceName).filter((field) => {
    if (field.name === config.id) {
      return false;
    }

    if (mode === "create" && field.hasDefaultValue) {
      return false;
    }

    if (ignoredInputFields.has(field.name)) {
      return false;
    }

    if (config.tenantScoped && field.name === "tenantid") {
      return false;
    }

    return !(config.branchScoped && field.name === "branchid");


  });
}

function getFilterableFields(resourceName) {
  if (!filterableFieldsCache.has(resourceName)) {
    filterableFieldsCache.set(
      resourceName,
      getScalarFields(resourceName).filter((field) => !field.isList)
    );
  }

  return filterableFieldsCache.get(resourceName);
}

function getSortableFields(resourceName) {
  if (!sortableFieldsCache.has(resourceName)) {
    sortableFieldsCache.set(
      resourceName,
      getScalarFields(resourceName).filter((field) => !field.isList)
    );
  }

  return sortableFieldsCache.get(resourceName);
}

function getListScalarFields(resourceName, config = {}) {
  const relationKey = Object.keys(config.listRelations || {}).sort().join(",");
  const cacheKey = `${resourceName}|${config.id || ""}|${relationKey}`;
  if (listScalarFieldsCache.has(cacheKey)) {
    return listScalarFieldsCache.get(cacheKey);
  }

  const relationKeys = new Set(Object.keys(config.listRelations || {}));
  const listScalarFields = getScalarFields(resourceName).filter((field) => (
    !field.isList &&
    (field.name === config.id || !hiddenListFields.has(field.name)) &&
    !relationKeys.has(field.name)
  ));

  listScalarFieldsCache.set(cacheKey, listScalarFields);
  return listScalarFields;
}

function getListFilterFields(resourceName, config = {}) {
  return getListScalarFields(resourceName, config);
}

function hasCreatedByField(resourceName) {
  return getScalarFields(resourceName).some((field) => field.name === "createdby");
}

function getRelationInclude(resourceName) {
  if (!relationIncludeCache.has(resourceName)) {
    const model = getModel(resourceName);
    if (!model) {
      relationIncludeCache.set(resourceName, undefined);
    } else {
      const relationFields = model.fields.filter((field) => field.kind === "object");
      if (!relationFields.length) {
        relationIncludeCache.set(resourceName, undefined);
      } else {
        relationIncludeCache.set(
          resourceName,
          Object.fromEntries(relationFields.map((field) => [field.name, true]))
        );
      }
    }
  }

  return relationIncludeCache.get(resourceName);
}

function toOpenApiType(field) {
  if (field.type === "Int") {
    return { type: "integer" };
  }

  if (field.type === "Float" || field.type === "Decimal") {
    return { type: "number" };
  }

  if (field.type === "Boolean") {
    return { type: "boolean" };
  }

  if (field.type === "DateTime") {
    return { type: "string", format: "date-time" };
  }

  return { type: "string" };
}

function coerceValue(field, value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (value === "") {
    if (field.type === "String" && !field.isRequired) {
      return null;
    }
    return undefined;
  }

  if (field.type === "Int") {
    return Number(value);
  }

  if (field.type === "Float" || field.type === "Decimal") {
    return Number(value);
  }

  if (field.type === "Boolean") {
    if (value === false || value === "false" || value === "0" || value === 0) {
      return false;
    }
    return value === true || value === "true" || value === "1";
  }

  if (field.type === "DateTime") {
    return new Date(value);
  }

  return String(value);
}

module.exports = {
  coerceValue,
  getFilterableFields,
  getListFilterFields,
  hasCreatedByField,
  getRelationInclude,
  getListScalarFields,
  getModel,
  getPrismaDelegateName,
  getScalarFields,
  getSortableFields,
  getWritableFields,
  toOpenApiType
};
