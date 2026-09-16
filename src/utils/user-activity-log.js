const USER_ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "assign",
  "unassign",
  "status_change",
  "login",
  "logout",
  "password_changed",
  "settings_updated",
  "invite",
  "activate",
  "deactivate",
  "block",
  "unblock",
  "approve",
  "reject",
  "complete",
  "resolve",
  "submit",
  "upload",
  "other"
];

const ACTION_LABELS = {
  create: "Added",
  update: "Updated",
  delete: "Deleted",
  assign: "Assigned",
  unassign: "Unassigned",
  status_change: "Status changed",
  login: "Logged in",
  logout: "Logged out",
  password_changed: "Password changed",
  settings_updated: "Settings updated",
  invite: "Invited",
  activate: "Activated",
  deactivate: "Deactivated",
  block: "Blocked",
  unblock: "Unblocked",
  approve: "Approved",
  reject: "Rejected",
  complete: "Completed",
  resolve: "Resolved",
  submit: "Submitted",
  upload: "Uploaded",
  other: "Action"
};

function normalizeActivityAction(value, fallback = "other") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const key = String(value).trim().toLowerCase();
  if (USER_ACTIVITY_ACTIONS.includes(key)) {
    return key;
  }
  const aliases = {
    add: "create",
    edit: "update",
    removed: "delete",
    passwordchange: "password_changed",
    settingsupdate: "settings_updated"
  };
  return aliases[key] || fallback;
}

function pickEntityName(row = {}) {
  return (
    row.name ??
    row.title ??
    row.description ??
    row.email ??
    row.organizationname ??
    row.organizationName ??
    null
  );
}

function pickEntityCode(row = {}) {
  return row.code ?? row.erpcode ?? row.manualjobno ?? row.manualJobNo ?? null;
}

function buildActivitySummary({ action, module, entityName, entityCode, jobId, extra } = {}) {
  const label = ACTION_LABELS[action] || "Action";
  const moduleLabel = module ? String(module) : "record";
  const namePart = entityName ? ` ${entityName}` : "";
  const codePart = entityCode ? ` (${entityCode})` : "";
  const jobPart = jobId ? ` for job #${jobId}` : "";
  const tail = extra ? `: ${extra}` : "";
  return `${label} ${moduleLabel}${namePart}${codePart}${jobPart}${tail}`.replace(/\s+/g, " ").trim();
}

function readRequestMeta(req) {
  if (!req) {
    return { ipaddress: null, useragent: null };
  }
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  return {
    ipaddress: ip,
    useragent: req.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 500) : null
  };
}

function formatActivityLogRow(row) {
  const user = row.users ?? null;
  const job = row.job ?? null;
  return {
    id: row.recno,
    userId: row.userid ?? null,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    tenantId: row.tenantid,
    branchId: row.branchid,
    module: row.module,
    entityName: row.entityname ?? null,
    entityCode: row.entitycode ?? null,
    jobId: row.jobid ?? null,
    jobNo: job?.code ?? null,
    entityId: row.entityid ?? null,
    action: row.action,
    nature: row.action,
    summary: row.summary ?? null,
    metadata: row.metadata ?? null,
    ipAddress: row.ipaddress ?? null,
    userAgent: row.useragent ?? null,
    recordedAt: row.recordedat ?? null,
    time: row.recordedat ?? null
  };
}

module.exports = {
  USER_ACTIVITY_ACTIONS,
  ACTION_LABELS,
  normalizeActivityAction,
  pickEntityName,
  pickEntityCode,
  buildActivitySummary,
  readRequestMeta,
  formatActivityLogRow
};
