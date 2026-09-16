const MIN_RATING = 0;
const MAX_RATING = 5;

function extractCustomerFeedbackPayload(body = {}) {
  const raw =
    body.customerFeedback ??
    body.customerfeedback ??
    body.feedback ??
    null;

  if (raw == null || raw === "") {
    return null;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return {
      rating: raw.rating ?? raw.score ?? raw.stars,
      comments: raw.comments ?? raw.comment ?? raw.remarks ?? raw.notes
    };
  }

  return null;
}

function parseCustomerFeedbackRating(value) {
  if (value === undefined || value === null || value === "") {
    const err = new Error(`Customer feedback rating is required (${MIN_RATING}-${MAX_RATING})`);
    err.status = 400;
    throw err;
  }

  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_RATING || n > MAX_RATING) {
    const err = new Error(`Customer feedback rating must be an integer from ${MIN_RATING} to ${MAX_RATING}`);
    err.status = 400;
    throw err;
  }

  return n;
}

function parseCustomerFeedbackInput(body = {}) {
  let extracted = extractCustomerFeedbackPayload(body);
  if (!extracted) {
    const hasRating = body.rating !== undefined && body.rating !== null && body.rating !== "";
    const hasComments =
      body.comments !== undefined ||
      body.comment !== undefined ||
      body.remarks !== undefined;
    if (hasRating || hasComments) {
      extracted = {
        rating: body.rating,
        comments: body.comments ?? body.comment ?? body.remarks
      };
    }
  }
  if (!extracted) {
    return null;
  }

  const rating = parseCustomerFeedbackRating(extracted.rating);
  let comments = extracted.comments;
  if (comments !== undefined && comments !== null) {
    comments = String(comments).trim();
    if (comments === "") {
      comments = null;
    }
  } else {
    comments = null;
  }

  return { rating, comments };
}

function formatCustomerFeedbackRow(row) {
  if (!row) return null;
  return {
    recno: row.recno,
    jobid: row.jobid,
    tenantid: row.tenantid,
    branchid: row.branchid,
    rating: row.rating,
    comments: row.comments ?? null,
    recordedby: row.recordedby ?? null,
    recordedByName: row.users?.name ?? null,
    recordedByEmail: row.users?.email ?? null,
    recordedat: row.recordedat ?? null
  };
}

module.exports = {
  MIN_RATING,
  MAX_RATING,
  extractCustomerFeedbackPayload,
  parseCustomerFeedbackInput,
  formatCustomerFeedbackRow
};
