const prisma = require("../database/prisma");
const { utcNow } = require("./date");
const { getModel, getWritableFields, coerceValue } = require("./prisma-metadata");

/** API list columns → Prisma FK columns (customers use country/city/area, not *id). */
const FK_ID_ALIASES = {
  customers: {
    countryid: "country",
    cityid: "city",
    areaid: "area",
    countryId: "country",
    cityId: "city",
    areaId: "area"
  }
};

/** Resolve / create country → city → area in order (parent must exist first). */
const GEO_HIERARCHY = {
  customers: [
    { fk: "country", table: "countries", nameKey: "countryname", parentFk: null },
    { fk: "city", table: "cities", nameKey: "cityname", parentFk: "countryid", parentSource: "country" },
    { fk: "area", table: "areas", nameKey: "areaname", parentFk: "cityid", parentSource: "city" }
  ]
};

const SKIP_NAME_RESOLVE = {
  customers: new Set(["country", "city", "area", "branchid"])
};

function stripListRelationOutputs(data, config) {
  const next = { ...data };
  Object.values(config.listRelations || {}).forEach((relation) => {
    delete next[relation.output];
  });
  return next;
}

function applyFkIdAliases(resourceName, data) {
  const aliases = FK_ID_ALIASES[resourceName];
  if (!aliases) {
    return { ...data };
  }
  const next = { ...data };
  Object.entries(aliases).forEach(([aliasKey, targetKey]) => {
    if (
      next[targetKey] === undefined &&
      next[aliasKey] !== undefined &&
      next[aliasKey] !== null &&
      next[aliasKey] !== ""
    ) {
      next[targetKey] = next[aliasKey];
    }
    delete next[aliasKey];
  });
  return next;
}

function modelHasTenant(table) {
  return Boolean(getModel(table)?.fields.some((field) => field.name === "tenantid"));
}

function tenantWhere(auth) {
  const tenantid = auth?.tenantid != null ? Number(auth.tenantid) : null;
  return tenantid != null && Number.isFinite(tenantid) ? { tenantid } : {};
}

async function findGeoRow(table, where) {
  const delegate = prisma[table];
  if (!delegate?.findFirst) {
    return null;
  }
  return delegate.findFirst({ where });
}

async function createGeoRow(table, data) {
  const delegate = prisma[table];
  if (!delegate?.create) {
    const err = new Error(`Database model "${table}" is unavailable. Run: npx prisma generate && npx prisma migrate deploy`);
    err.status = 503;
    throw err;
  }
  return delegate.create({ data });
}

/**
 * Country → city → area: scoped lookups, auto-create when missing, drop invalid FK ids.
 */
async function resolveGeoHierarchy(resourceName, data, auth) {
  const chain = GEO_HIERARCHY[resourceName];
  if (!chain) {
    return { ...data };
  }

  const next = { ...data };
  const tenantScope = tenantWhere(auth);
  const uid = auth?.userid != null ? Number(auth.userid) : null;
  const now = utcNow();

  for (const level of chain) {
    const displayName = data[level.nameKey];
    delete next[level.nameKey];

    let fkValue =
      next[level.fk] !== undefined && next[level.fk] !== null && next[level.fk] !== ""
        ? Number(next[level.fk])
        : null;

    if (fkValue != null && Number.isFinite(fkValue)) {
      const existsWhere = { recno: fkValue, ...tenantScope };
      if (level.parentFk && level.parentSource) {
        const parentId = next[level.parentSource];
        if (parentId == null || parentId === "") {
          delete next[level.fk];
          fkValue = null;
        } else {
          existsWhere[level.parentFk] = Number(parentId);
        }
      }
      if (fkValue != null) {
        const existing = await findGeoRow(level.table, existsWhere);
        if (existing) {
          next[level.fk] = existing.recno;
          continue;
        }
        fkValue = null;
      }
    }

    if (!displayName || typeof displayName !== "string") {
      if (fkValue == null) {
        delete next[level.fk];
      }
      continue;
    }

    if (level.parentFk && level.parentSource) {
      const parentId = next[level.parentSource];
      if (parentId == null || parentId === "") {
        const err = new Error(
          `${level.nameKey} requires ${level.parentSource} to be set first (${data[level.nameKey]})`
        );
        err.status = 400;
        throw err;
      }
    }

    const where = { name: displayName.trim(), ...tenantScope };
    if (level.parentFk && level.parentSource) {
      where[level.parentFk] = Number(next[level.parentSource]);
    }

    let row = await findGeoRow(level.table, where);

    if (!row) {
      const createData = {
        name: displayName.trim(),
        isactive: true,
        createdat: now,
        ...tenantScope
      };
      if (uid != null && Number.isFinite(uid)) {
        createData.createdby = uid;
      }
      if (level.parentFk && level.parentSource) {
        createData[level.parentFk] = Number(next[level.parentSource]);
      }
      row = await createGeoRow(level.table, createData);
    }

    next[level.fk] = row.recno;
  }

  return next;
}

function getRelatedLookupMeta(resourceName, sourceField) {
  const model = getModel(resourceName);
  if (!model) {
    return null;
  }

  const relationField = model.fields.find(
    (field) =>
      field.kind === "object" &&
      Array.isArray(field.relationFromFields) &&
      field.relationFromFields.includes(sourceField)
  );

  if (!relationField) {
    return null;
  }

  const relatedModel = getModel(relationField.type);
  const idField = relatedModel?.fields.find((field) => field.isId)?.name;

  if (!idField) {
    return null;
  }

  return {
    delegate: relationField.type,
    idField,
    labelField: "name"
  };
}

async function resolveRelationFkFromDisplayNames(resourceName, config, data, auth) {
  const next = { ...data };
  const tenantScope = tenantWhere(auth);
  const skip = SKIP_NAME_RESOLVE[resourceName] || new Set();

  for (const [sourceField, relationConfig] of Object.entries(config.listRelations || {})) {
    if (skip.has(sourceField)) {
      delete next[relationConfig.output];
      continue;
    }

    const outputKey = relationConfig.output;
    const labelField = relationConfig.field || "name";
    const displayName = data[outputKey];

    delete next[outputKey];

    const existingFk = next[sourceField];
    if (existingFk !== undefined && existingFk !== null && existingFk !== "") {
      const scalar = getModel(resourceName)?.fields.find((field) => field.name === sourceField);
      if (scalar) {
        next[sourceField] = coerceValue(scalar, existingFk);
      }
      continue;
    }

    if (displayName === undefined || displayName === null || displayName === "") {
      continue;
    }

    if (typeof displayName !== "string") {
      continue;
    }

    const lookup = getRelatedLookupMeta(resourceName, sourceField);
    if (!lookup) {
      continue;
    }

    const delegate = prisma[lookup.delegate];
    if (!delegate?.findFirst) {
      continue;
    }

    const where = {
      [labelField]: displayName.trim(),
      ...tenantScope
    };

    const row = await delegate.findFirst({ where });
    if (!row) {
      const err = new Error(`${outputKey} not found: ${displayName.trim()}`);
      err.status = 400;
      throw err;
    }

    next[sourceField] = row[lookup.idField];
  }

  return next;
}

function pickWritablePayload(resourceName, config, mode, data) {
  const allowed = new Set(getWritableFields(resourceName, config, mode).map((field) => field.name));
  const model = getModel(resourceName);
  const fieldMap = new Map((model?.fields || []).map((field) => [field.name, field]));
  const next = {};

  Object.entries(data).forEach(([key, value]) => {
    if (!allowed.has(key) || value === undefined) {
      return;
    }
    const field = fieldMap.get(key);
    const coerced = field ? coerceValue(field, value) : value;
    if (coerced !== undefined) {
      next[key] = coerced;
    }
  });

  return next;
}

function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Clear taxno when not tax-registered; accept common client field aliases.
 */
function normalizeOrganizationPayload(data = {}) {
  const next = { ...data };

  if (next.istaxregistered === undefined) {
    if (next.isTaxRegistered !== undefined) next.istaxregistered = next.isTaxRegistered;
    else if (next.isistaxregistered !== undefined) next.istaxregistered = next.isistaxregistered;
  }
  delete next.isTaxRegistered;
  delete next.isistaxregistered;

  const taxRegistered = parseOptionalBoolean(next.istaxregistered);
  if (taxRegistered !== undefined) {
    next.istaxregistered = taxRegistered;
    if (taxRegistered === false) {
      next.taxno = null;
    }
  }

  if (next.taxno !== undefined) {
    next.taxno = normalizeOptionalString(next.taxno);
  }

  return next;
}

async function normalizeGenericIncoming(resourceName, config, data, auth, mode) {
  let next = { ...data };
  if (resourceName === "organizations") {
    next = normalizeOrganizationPayload(next);
  }
  if (resourceName === "customers") {
    const { applyCustomerPhoneAliases } = require("./customer-phone");
    next = applyCustomerPhoneAliases(next);
  }
  next = applyFkIdAliases(resourceName, next);
  next = stripListRelationOutputs(next, config);
  next = await resolveGeoHierarchy(resourceName, next, auth);
  next = await resolveRelationFkFromDisplayNames(resourceName, config, next, auth);
  return pickWritablePayload(resourceName, config, mode, next);
}

module.exports = {
  applyFkIdAliases,
  normalizeGenericIncoming,
  normalizeOrganizationPayload,
  pickWritablePayload,
  resolveGeoHierarchy,
  resolveRelationFkFromDisplayNames,
  stripListRelationOutputs
};
