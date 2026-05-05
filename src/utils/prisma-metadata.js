const { Prisma } = require("@prisma/client");

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

function getModel(resourceName) {
  return Prisma.dmmf.datamodel.models.find((model) => model.name === resourceName);
}

function getScalarFields(resourceName) {
  const model = getModel(resourceName);

  if (!model) {
    return [];
  }

  return model.fields.filter((field) => field.kind === "scalar");
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

    if (config.branchScoped && field.name === "branchid") {
      return false;
    }

    return true;
  });
}

function getFilterableFields(resourceName) {
  return getScalarFields(resourceName).filter((field) => !field.isList);
}

function getSortableFields(resourceName) {
  return getScalarFields(resourceName).filter((field) => !field.isList);
}

function getListScalarFields(resourceName, config = {}) {
  const relationKeys = new Set(Object.keys(config.listRelations || {}));

  return getScalarFields(resourceName).filter((field) => (
    !field.isList &&
    (field.name === config.id || !hiddenListFields.has(field.name)) &&
    !relationKeys.has(field.name)
  ));
}

function getListFilterFields(resourceName, config = {}) {
  return getListScalarFields(resourceName, config);
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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (field.type === "Int") {
    return Number(value);
  }

  if (field.type === "Float" || field.type === "Decimal") {
    return Number(value);
  }

  if (field.type === "Boolean") {
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
  getListScalarFields,
  getModel,
  getScalarFields,
  getSortableFields,
  getWritableFields,
  toOpenApiType
};
