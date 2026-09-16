const prisma = require("../database/prisma");
const {
  getDefinitionUniquenessRule,
  hasDefinitionUniquenessRules
} = require("../config/definition-uniqueness");
const { getPrismaDelegateName } = require("../utils/prisma-metadata");

function duplicateError(label, kind = "name") {
  const err = new Error(`A ${label} with this ${kind} already exists`);
  err.status = 409;
  return err;
}

function normalizeUniqueText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function buildScopeWhere(rule, payload, auth) {
  const where = {};

  for (const field of rule.scopeFields) {
    if (field === "tenantid") {
      where.tenantid = Number(payload.tenantid ?? auth?.tenantid);
      continue;
    }

    if (field === "branchid") {
      where.branchid = Number(payload.branchid ?? auth?.branchid);
      continue;
    }

    const raw = payload[field];
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }

    where[field] = Number(raw);
  }

  return where;
}

async function findDuplicate(delegate, options = {}) {
  const { field, value, scopeWhere, excludeId, idField } = options;

  const where = {
    ...scopeWhere,
    [field]: { equals: value, mode: "insensitive" }
  };

  if (excludeId != null && excludeId !== "") {
    where[idField] = { not: Number(excludeId) };
  }

  return delegate.findFirst({
    where,
    select: { [idField]: true }
  });
}

async function assertFieldUnique(delegate, rule, payload, auth, fieldConfig, options = {}) {
  const { excludeId, idField } = options;
  const fieldName = fieldConfig.field || rule.nameField;
  const label = fieldConfig.label || rule.label;
  const value = normalizeUniqueText(payload[fieldName]);

  if (!value) {
    return;
  }

  const scopeWhere = buildScopeWhere(rule, payload, auth);
  if (!scopeWhere) {
    return;
  }

  const duplicate = await findDuplicate(delegate, {
    field: fieldName,
    value,
    scopeWhere,
    excludeId,
    idField
  });

  if (duplicate) {
    const kind =
      fieldName === rule.nameField
        ? fieldName === "title"
          ? "title"
          : "name"
        : fieldName;
    throw duplicateError(label, kind);
  }
}

async function assertDefinitionUniqueness(resourceName, config, payload, auth, options = {}) {
  const rule = getDefinitionUniquenessRule(resourceName);
  if (!rule) {
    return;
  }

  const delegateName = getPrismaDelegateName(resourceName);
  const delegate = prisma[delegateName];
  if (!delegate?.findFirst) {
    return;
  }

  const idField = config?.id || "recno";
  const checkOptions = {
    excludeId: options.excludeId,
    idField
  };

  await assertFieldUnique(delegate, rule, payload, auth, rule, checkOptions);

  for (const extraField of rule.extraFields || []) {
    await assertFieldUnique(delegate, rule, payload, auth, extraField, checkOptions);
  }
}

module.exports = {
  assertDefinitionUniqueness,
  hasDefinitionUniquenessRules,
  normalizeUniqueText,
  buildScopeWhere
};
