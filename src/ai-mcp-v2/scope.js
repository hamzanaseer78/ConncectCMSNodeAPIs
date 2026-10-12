const { AiMcpError } = require("./errors");

const REJECTED_ARGUMENT_KEYS = Object.freeze([
  "tenantid",
  "tenantId",
  "branchid",
  "branchId",
  "userid",
  "userId",
  "sql",
  "query",
  "statement",
  "database"
]);

function trustedScope(auth) {
  const tenantid = Number(auth?.tenantid);
  const branchid = Number(auth?.branchid);
  const userid = Number(auth?.userid);
  if (!Number.isInteger(tenantid) || tenantid <= 0
    || !Number.isInteger(branchid) || branchid <= 0
    || !Number.isInteger(userid) || userid <= 0) {
    throw new AiMcpError(
      "Authenticated tenant, branch, and user are required.",
      403,
      "scope_required"
    );
  }
  return { tenantid, branchid, userid };
}

function sanitizeArgs(args) {
  const source = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const clean = {};
  Object.keys(source).forEach((key) => {
    if (!REJECTED_ARGUMENT_KEYS.includes(key)) clean[key] = source[key];
  });
  return clean;
}

async function resolveAccess(auth, deps = {}) {
  const scope = trustedScope(auth);
  if (deps.assertMembership) await deps.assertMembership(scope);
  const manageBranch = deps.canManageBranch
    ? await deps.canManageBranch(auth)
    : await require("../utils/job-access").canManageBranchJobs(auth);
  return { ...scope, manageBranch: Boolean(manageBranch) };
}

module.exports = {
  REJECTED_ARGUMENT_KEYS,
  trustedScope,
  sanitizeArgs,
  resolveAccess
};
