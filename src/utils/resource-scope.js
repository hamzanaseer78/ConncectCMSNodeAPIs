const { getScalarFields } = require("./prisma-metadata");

function normalizeAuthScope(auth) {
  if (!auth) {
    return null;
  }

  const tenantid = auth.tenantid ?? auth.tenantId;
  const branchid = auth.branchid ?? auth.branchId;
  const userid = auth.userid ?? auth.userId ?? auth.sub;

  return {
    ...auth,
    tenantid:
      tenantid != null && tenantid !== "" && Number.isFinite(Number(tenantid))
        ? Number(tenantid)
        : undefined,
    branchid:
      branchid != null && branchid !== "" && Number.isFinite(Number(branchid))
        ? Number(branchid)
        : undefined,
    userid:
      userid != null && userid !== "" && Number.isFinite(Number(userid))
        ? Number(userid)
        : undefined
  };
}

function modelHasScalarField(resourceName, fieldName) {
  return getScalarFields(resourceName).some((field) => field.name === fieldName);
}

function requiresTenantScope(resourceName, config = {}) {
  if (config.organizationScoped) {
    return false;
  }
  if (config.tenantScoped === false) {
    return false;
  }
  if (config.tenantScoped === true) {
    return true;
  }
  return modelHasScalarField(resourceName, "tenantid");
}

function requiresBranchScope(resourceName, config = {}) {
  if (config.branchScoped !== true) {
    return false;
  }
  return modelHasScalarField(resourceName, "branchid");
}

function assertTenantAuth(auth, resourceName = "resource") {
  const normalized = normalizeAuthScope(auth);
  if (!normalized?.tenantid) {
    const err = new Error(`JWT must include tenantid to access ${resourceName}`);
    err.status = 401;
    throw err;
  }
  return normalized;
}

function assertBranchAuth(auth, resourceName = "resource") {
  const normalized = normalizeAuthScope(auth);
  if (!normalized?.branchid) {
    const err = new Error(`JWT must include branchid to access ${resourceName}`);
    err.status = 401;
    throw err;
  }
  return normalized;
}

/**
 * Build Prisma WHERE scope for tenant/branch isolation.
 * Throws 401 when tenant/branch is required but missing from JWT.
 */
function buildResourceScopeWhere(resourceName, config = {}, auth, options = {}) {
  const { requireTenant = true, requireBranch = true } = options;
  const where = {};
  const normalized = normalizeAuthScope(auth);

  if (requiresTenantScope(resourceName, config)) {
    const scopedAuth = requireTenant ? assertTenantAuth(auth, resourceName) : normalized;
    if (scopedAuth?.tenantid != null) {
      where.tenantid = scopedAuth.tenantid;
    }
  }

  if (requiresBranchScope(resourceName, config)) {
    const scopedAuth = requireBranch ? assertBranchAuth(auth, resourceName) : normalized;
    if (scopedAuth?.branchid != null) {
      where.branchid = scopedAuth.branchid;
    }
  }

  return where;
}

module.exports = {
  normalizeAuthScope,
  modelHasScalarField,
  requiresTenantScope,
  requiresBranchScope,
  assertTenantAuth,
  assertBranchAuth,
  buildResourceScopeWhere
};
