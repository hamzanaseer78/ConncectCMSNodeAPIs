function parseBoolean(value, label) {
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

function parseAmount(value, label = "amount") {
  if (value === undefined || value === null || value === "") {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error(`${label} must be a non-negative number`);
    err.status = 400;
    throw err;
  }
  return amount;
}

function parseOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function parseExpenseDescription(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) {
    const err = new Error("description is required");
    err.status = 400;
    throw err;
  }
  return text;
}

function parseExpenseInput(body = {}) {
  const description = parseExpenseDescription(body.description);
  const amount = parseAmount(body.price ?? body.amount, "price");
  return { description, amount };
}

function parseExpenseLinesFromBody(body = {}) {
  const rawLines = Array.isArray(body) ? body : body.expenses ?? body.items ?? body.lines;

  if (Array.isArray(rawLines)) {
    if (!rawLines.length) {
      const err = new Error("expenses array must not be empty");
      err.status = 400;
      throw err;
    }
    return rawLines.map((line, index) => {
      try {
        return parseExpenseInput(line);
      } catch (error) {
        const err = new Error(`${error.message} at index ${index}`);
        err.status = error.status || 400;
        throw err;
      }
    });
  }

  return [parseExpenseInput(body)];
}

function isJobCompletedOrResolved(job) {
  return job?.iscompleted === true || job?.isresolved === true;
}

function sumExpenseAmounts(expenses = []) {
  return expenses.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
}

function formatSettingsRow(row) {
  return {
    tenantid: row?.tenantid ?? null,
    branchid: row?.branchid ?? null,
    allowReceiveCollection: row?.allowreceivecollection === true,
    allowAddExpenses: row?.allowaddexpenses === true,
    lastUpdatedAt: row?.lastupdatedat ?? null
  };
}

function formatCollectionRow(row) {
  if (!row) return null;
  return {
    id: row.recno,
    jobId: row.jobid,
    amount: row.amount,
    remarks: row.remarks ?? null,
    collectedBy: row.collectedby,
    collectedAt: row.collectedat,
    createdAt: row.createdat ?? null,
    lastUpdatedAt: row.lastupdatedat ?? null
  };
}

function formatExpenseRow(row) {
  return {
    id: row.recno,
    jobId: row.jobid,
    description: row.description,
    price: row.amount,
    amount: row.amount,
    createdAt: row.createdat ?? null,
    lastUpdatedAt: row.lastupdatedat ?? null
  };
}

function formatExpensesResponse(rows = []) {
  const items = rows.map(formatExpenseRow);
  return {
    items,
    totalAmount: sumExpenseAmounts(rows),
    count: items.length
  };
}

module.exports = {
  parseBoolean,
  parseAmount,
  parseOptionalText,
  parseExpenseDescription,
  parseExpenseInput,
  parseExpenseLinesFromBody,
  isJobCompletedOrResolved,
  sumExpenseAmounts,
  formatSettingsRow,
  formatCollectionRow,
  formatExpenseRow,
  formatExpensesResponse
};
