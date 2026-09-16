function parseOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function parseOptionalBoolean(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  const err = new Error(`${label} must be a boolean`);
  err.status = 400;
  throw err;
}

function buildResolvedQuotationFields(job, settingsRow = null) {
  const jobNotes = job?.quotationnotes ?? null;
  const jobTerms = job?.quotationterms ?? null;
  const defaultNotes = settingsRow?.defaultnotes ?? null;
  const defaultTerms = settingsRow?.defaulttermsandconditions ?? null;

  return {
    quotationNotes: jobNotes ?? defaultNotes,
    quotationTermsAndConditions: jobTerms ?? defaultTerms,
    jobQuotationNotes: jobNotes,
    jobQuotationTermsAndConditions: jobTerms,
    defaultQuotationNotes: defaultNotes,
    defaultQuotationTermsAndConditions: defaultTerms,
    usesDefaultQuotationNotes: jobNotes == null && defaultNotes != null,
    usesDefaultQuotationTermsAndConditions: jobTerms == null && defaultTerms != null,
    enableLineItemTax: settingsRow?.enablelineitemtax === true,
    automaticCpairReceiving: settingsRow?.automaticcpairreceiving === true,
    useERPProducts: settingsRow?.useerpproducts === true
  };
}

function applyQuotationTextDefaults(payload, settingsRow) {
  if (!settingsRow) {
    return payload;
  }
  const next = { ...payload };
  if (next.quotationnotes === undefined && settingsRow.defaultnotes) {
    next.quotationnotes = settingsRow.defaultnotes;
  }
  if (next.quotationterms === undefined && settingsRow.defaulttermsandconditions) {
    next.quotationterms = settingsRow.defaulttermsandconditions;
  }
  return next;
}

module.exports = {
  parseOptionalText,
  parseOptionalBoolean,
  buildResolvedQuotationFields,
  applyQuotationTextDefaults
};
