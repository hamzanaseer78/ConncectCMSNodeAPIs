/** Fixed quotation workflow statuses (separate from job.statusid / jobstatuses). */

const QUOTATION_STATUS = Object.freeze({
  CREATED: "created",
  SENT: "sent",
  APPROVED: "approved",
  REJECTED: "rejected"
});

const LABELS = Object.freeze({
  [QUOTATION_STATUS.CREATED]: "Quotation Created",
  [QUOTATION_STATUS.SENT]: "Quotation Sent",
  [QUOTATION_STATUS.APPROVED]: "Quotation Approved",
  [QUOTATION_STATUS.REJECTED]: "Quotation Rejected"
});

const ORDER = [
  QUOTATION_STATUS.CREATED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.REJECTED
];

const ALIASES = Object.freeze({
  quotationcreated: QUOTATION_STATUS.CREATED,
  "quotation created": QUOTATION_STATUS.CREATED,
  qoutationcreated: QUOTATION_STATUS.CREATED,
  "qoutation created": QUOTATION_STATUS.CREATED,
  created: QUOTATION_STATUS.CREATED,
  quotationsent: QUOTATION_STATUS.SENT,
  "quotation sent": QUOTATION_STATUS.SENT,
  qoutationsent: QUOTATION_STATUS.SENT,
  "qoutation sent": QUOTATION_STATUS.SENT,
  sent: QUOTATION_STATUS.SENT,
  quotationapproved: QUOTATION_STATUS.APPROVED,
  "quotation approved": QUOTATION_STATUS.APPROVED,
  qoutationapproved: QUOTATION_STATUS.APPROVED,
  "qoutation approved": QUOTATION_STATUS.APPROVED,
  approved: QUOTATION_STATUS.APPROVED,
  quotationrejected: QUOTATION_STATUS.REJECTED,
  "quotation rejected": QUOTATION_STATUS.REJECTED,
  qoutationrejected: QUOTATION_STATUS.REJECTED,
  "qoutation rejected": QUOTATION_STATUS.REJECTED,
  rejected: QUOTATION_STATUS.REJECTED
});

function normalizeQuotationStatus(value) {
  if (value === undefined || value === null || value === "") {
    const err = new Error(
      `quotationStatus is required (${ORDER.map((k) => LABELS[k]).join(", ")})`
    );
    err.status = 400;
    throw err;
  }

  const raw = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  const compact = raw.replace(/\s+/g, "");
  const mapped = ALIASES[raw] || ALIASES[compact] || raw;

  if (!ORDER.includes(mapped)) {
    const err = new Error(
      `Invalid quotationStatus. Allowed: ${ORDER.map((k) => LABELS[k]).join(", ")}`
    );
    err.status = 400;
    throw err;
  }

  return mapped;
}

/** Parse optional quotation status on job create/update (null clears the status). */
function parseOptionalQuotationStatus(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return normalizeQuotationStatus(value);
}

function isQuotationStatusSet(status) {
  return status != null && status !== "";
}

function quotationStatusLabel(code) {
  if (!code) return null;
  return LABELS[code] ?? null;
}

function quotationRemarksRequired(status) {
  return status === QUOTATION_STATUS.REJECTED;
}

function listQuotationStatusOptions() {
  return ORDER.map((value) => ({
    value,
    label: LABELS[value],
    remarksRequired: quotationRemarksRequired(value)
  }));
}

function formatQuotationStatusFields(code) {
  return {
    quotationStatus: code ?? null,
    quotationStatusName: quotationStatusLabel(code)
  };
}

function parseQuotedById(payload = {}) {
  const raw =
    payload.quotedById ??
    payload.quotedBy ??
    payload.qoutedBy ??
    payload.qoutedby ??
    payload.quotedby;
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseQuotedAt(payload = {}, fallback = undefined) {
  const raw =
    payload.quotedAt ??
    payload.quotedDate ??
    payload.qoutedAt ??
    payload.qoutedDate ??
    payload.quotedat;
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveQuotedUser(row) {
  return row?.quotedbyuser ?? row?.quotationquotedbyuser ?? null;
}

function resolveChangedUser(row) {
  return row?.changedbyuser ?? row?.users ?? null;
}

function formatQuotationQuotedFields(row) {
  if (!row) {
    return {
      quotedById: null,
      quotedByName: null,
      quotedByEmail: null,
      quotedAt: null
    };
  }

  const quotedUser = resolveQuotedUser(row);
  const quotedById = row.quotedby ?? row.quotationquotedby ?? null;
  const quotedAt = row.quotedat ?? row.quotationquotedat ?? null;

  return {
    quotedById,
    quotedByName: quotedUser?.name ?? null,
    quotedByEmail: quotedUser?.email ?? null,
    quotedAt
  };
}

function formatQuotationStatusLogRow(row) {
  if (!row) return null;
  const changedUser = resolveChangedUser(row);
  return {
    recno: row.recno,
    jobid: row.jobid,
    tenantid: row.tenantid,
    branchid: row.branchid,
    fromStatus: row.fromstatus ?? null,
    fromStatusName: quotationStatusLabel(row.fromstatus),
    toStatus: row.tostatus,
    toStatusName: quotationStatusLabel(row.tostatus),
    remarks: row.remarks ?? null,
    changedby: row.changedby ?? null,
    changedByName: changedUser?.name ?? null,
    changedByEmail: changedUser?.email ?? null,
    changedat: row.changedat ?? null,
    ...formatQuotationQuotedFields(row)
  };
}

module.exports = {
  QUOTATION_STATUS,
  LABELS,
  ORDER,
  normalizeQuotationStatus,
  parseOptionalQuotationStatus,
  isQuotationStatusSet,
  quotationStatusLabel,
  quotationRemarksRequired,
  listQuotationStatusOptions,
  formatQuotationStatusFields,
  parseQuotedById,
  parseQuotedAt,
  formatQuotationQuotedFields,
  formatQuotationStatusLogRow
};
