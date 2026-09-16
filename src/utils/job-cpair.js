const CP_AIR_RECEIVE_STATUSES = ["pending", "partially_received", "all_received"];
const CP_AIR_ISSUE_STATUSES = ["pending", "partially_issued", "issued"];

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseIntQty(value, label) {
  if (value === undefined || value === null || value === "") {
    throw clientError(`${label} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw clientError(`${label} must be a non-negative integer`);
  }
  return n;
}

function parseOptionalIntQty(value, label, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  return parseIntQty(value, label);
}

function parsePositiveIntQty(value, label) {
  const qty = parseIntQty(value, label);
  if (qty <= 0) {
    throw clientError(`${label} must be greater than 0`);
  }
  return qty;
}

function parseOptionalUserId(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return parseIntQty(value, "userId");
}

function parseOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseOptionalDate(value, label = "date") {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw clientError(`${label} must be a valid date`);
  }
  return date;
}

function parseImages(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return JSON.stringify(value.filter(Boolean));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? JSON.stringify(parsed) : trimmed;
    } catch {
      return trimmed;
    }
  }
  return null;
}

function formatImages(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [value];
  }
}

function computeReceiveStatus(totalReceived, totalExpected) {
  const received = Number(totalReceived) || 0;
  const expected = Number(totalExpected) || 0;
  if (received <= 0) return "pending";
  if (received >= expected && expected > 0) return "all_received";
  return "partially_received";
}

function computeIssueStatus(totalIssued, totalReceived) {
  const issued = Number(totalIssued) || 0;
  const received = Number(totalReceived) || 0;
  if (issued <= 0) return "pending";
  if (received > 0 && issued >= received) return "issued";
  return "partially_issued";
}

function computeLineReceiveStatus(lineReceived, expectedQty) {
  return computeReceiveStatus(lineReceived, expectedQty);
}

function computeLineIssueStatus(lineIssued, lineReceived) {
  return computeIssueStatus(lineIssued, lineReceived);
}

function sumPartTotals(parts = []) {
  return parts.reduce(
    (acc, part) => {
      acc.totalinstalledqty += Number(part.installedqty) || 0;
      acc.totalcpairqty += Number(part.qty) || 0;
      acc.totalwastageqty += Number(part.wastageqty) || 0;
      acc.totalqtyreceived += Number(part.lineqtyreceived) || 0;
      acc.totalissueqty += Number(part.lineissueqty) || 0;
      return acc;
    },
    {
      totalinstalledqty: 0,
      totalcpairqty: 0,
      totalwastageqty: 0,
      totalqtyreceived: 0,
      totalissueqty: 0
    }
  );
}

function validatePartLineQuantities(installedQty, qty, wastageQty, index = 0) {
  const installed = parseIntQty(installedQty, `parts[${index}].installedQty`);
  const cpairQty = parseIntQty(qty, `parts[${index}].qty`);
  const wastage = parseIntQty(wastageQty, `parts[${index}].wastageQty`);
  if (cpairQty + wastage !== installed) {
    throw clientError(
      `parts[${index}]: qty + wastageQty must equal installedQty (${cpairQty} + ${wastage} != ${installed})`
    );
  }
  return { installedqty: installed, qty: cpairQty, wastageqty: wastage };
}

function parsePartsPayload(body = {}) {
  const raw = body.parts ?? body.items ?? body.lines;
  if (!Array.isArray(raw) || !raw.length) {
    throw clientError("parts array is required");
  }
  return raw.map((part, index) => {
    const jobProductId = parseIntQty(
      part.jobProductId ?? part.jobproductid ?? part.jobProductLineId,
      `parts[${index}].jobProductId`
    );
    return {
      jobProductId,
      qty: parseIntQty(part.qty, `parts[${index}].qty`),
      wastageqty: parseIntQty(part.wastageQty ?? part.wastageqty, `parts[${index}].wastageQty`),
      remarks: part.remarks == null ? null : String(part.remarks).trim() || null,
      images: parseImages(part.images)
    };
  });
}

function isEligibleJobProductLine(line) {
  if (!line || line.productid == null) return false;
  if (line.isserviceitem === true) return false;
  const qty = Number(line.qty ?? 0);
  return Number.isFinite(qty) && qty > 0;
}

function isAutoCpairReceiveProductLine(line) {
  return isEligibleJobProductLine(line) && line.products?.enablecpairreceive === true;
}

function buildDefaultAutoCpairPartFromJobProduct(line) {
  const installedQty = installedQtyFromJobProduct(line);
  return {
    jobProductId: line.recno,
    installedqty: installedQty,
    qty: installedQty,
    wastageqty: 0,
    remarks: null,
    images: null,
    productid: line.productid ?? null,
    partname: line.products?.name ?? null
  };
}

function installedQtyFromJobProduct(line) {
  return Math.trunc(Number(line.qty ?? 0));
}

function formatSummaryRow(row, options = {}) {
  if (!row) return null;
  return {
    summaryId: row.recno,
    tenantId: row.tenantid ?? null,
    branchId: row.branchid ?? null,
    jobId: row.jobid,
    customerId: row.customerid ?? null,
    customerName: row.customername ?? null,
    technicianId: row.technicianid ?? null,
    technicianName: row.technicianname ?? null,
    faultId: row.faultid ?? null,
    faultName: row.faultname ?? null,
    totalInstalledQty: row.totalinstalledqty ?? 0,
    totalCpairQty: row.totalcpairqty ?? 0,
    totalWastageQty: row.totalwastageqty ?? 0,
    totalQtyReceived: row.totalqtyreceived ?? 0,
    totalIssueQty: row.totalissueqty ?? 0,
    receiveStatus: row.receivestatus,
    issueStatus: row.issuestatus,
    lastReceivedDate: row.lastreceiveddate ?? null,
    lastIssueDate: row.lastissuedate ?? null,
    jobNo: options.jobNo ?? null,
    createdAt: row.createdat ?? null,
    lastUpdatedAt: row.lastupdatedat ?? null,
    parts: options.parts ?? undefined
  };
}

function formatPartRow(row) {
  return {
    partId: row.recno,
    tenantId: row.tenantid ?? null,
    branchId: row.branchid ?? null,
    summaryId: row.jobcpairsummaryid,
    jobId: row.jobid,
    jobProductId: row.jobproductid,
    productId: row.productid ?? null,
    partName: row.partname ?? null,
    installedQty: row.installedqty ?? 0,
    qty: row.qty ?? 0,
    wastageQty: row.wastageqty ?? 0,
    lineQtyReceived: row.lineqtyreceived ?? 0,
    lineWastageReceived: row.linewastagereceived ?? 0,
    lineIssueQty: row.lineissueqty ?? 0,
    receiveStatus: computeLineReceiveStatus(row.lineqtyreceived, row.qty),
    issueStatus: computeLineIssueStatus(row.lineissueqty, row.lineqtyreceived),
    remarks: row.remarks ?? null,
    images: formatImages(row.images),
    createdAt: row.createdat ?? null,
    lastUpdatedAt: row.lastupdatedat ?? null
  };
}

function formatSchemaPartFromJobProduct(line, existingPart = null) {
  const installedQty = installedQtyFromJobProduct(line);
  return {
    jobProductId: line.recno,
    productId: line.productid ?? null,
    partName: line.products?.name ?? null,
    installedQty,
    qty: existingPart?.qty ?? null,
    wastageQty: existingPart?.wastageqty ?? null,
    alreadySubmitted: Boolean(existingPart),
    partId: existingPart?.recno ?? null
  };
}

function parseReceiveLine(line = {}, index = 0, defaults = {}) {
  const partId = parseIntQty(line.partId ?? line.partid, `parts[${index}].partId`);
  const qtyReceived = parsePositiveIntQty(
    line.qtyReceived ?? line.qtyreceived ?? line.qty,
    `parts[${index}].qtyReceived`
  );
  const wastageQty = parseOptionalIntQty(
    line.wastageQty ?? line.wastageqty,
    `parts[${index}].wastageQty`,
    0
  );
  return {
    partId,
    qtyReceived,
    wastageQty,
    handedOverBy:
      parseOptionalUserId(line.handedOverBy ?? line.handedoverby) ?? defaults.handedOverBy,
    receivedDate:
      parseOptionalDate(line.receivedDate ?? line.receiveddate, `parts[${index}].receivedDate`) ??
      defaults.receivedDate,
    remarks: parseOptionalText(line.remarks)
  };
}

function parseReceiveLinesFromBody(body = {}) {
  const raw = body.parts ?? body.items ?? body.lines;
  const defaults = {
    handedOverBy: parseOptionalUserId(body.handedOverBy ?? body.handedoverby),
    receivedDate: parseOptionalDate(body.receivedDate ?? body.receiveddate, "receivedDate")
  };

  if (Array.isArray(raw) && raw.length) {
    return raw.map((line, index) => parseReceiveLine(line, index, defaults));
  }

  if (body.partId !== undefined || body.partid !== undefined) {
    return [parseReceiveLine(body, 0, defaults)];
  }

  throw clientError("parts array or partId is required");
}

function parseIssueLine(line = {}, index = 0, defaults = {}) {
  const partId = parseIntQty(line.partId ?? line.partid, `parts[${index}].partId`);
  const issueQty = parsePositiveIntQty(
    line.issueQty ?? line.issueqty ?? line.qty,
    `parts[${index}].issueQty`
  );
  const storeNameRaw = line.storeName ?? line.storename ?? line.store ?? defaults.storeName;
  const storeName =
    storeNameRaw === undefined ? undefined : parseOptionalText(storeNameRaw) ?? null;

  return {
    partId,
    issueQty,
    storeName,
    issueDate:
      parseOptionalDate(line.issueDate ?? line.issuedate, `parts[${index}].issueDate`) ??
      defaults.issueDate,
    remarks: parseOptionalText(line.remarks)
  };
}

function parseIssueLinesFromBody(body = {}) {
  const raw = body.parts ?? body.items ?? body.lines;
  const defaults = {
    storeName: body.storeName ?? body.storename ?? body.store,
    issueDate: parseOptionalDate(body.issueDate ?? body.issuedate, "issueDate")
  };

  if (Array.isArray(raw) && raw.length) {
    return raw.map((line, index) => parseIssueLine(line, index, defaults));
  }

  if (body.partId !== undefined || body.partid !== undefined) {
    return [parseIssueLine(body, 0, defaults)];
  }

  throw clientError("parts array or partId is required");
}

function collectLogUserIds(receiveLogs = [], issueLogs = []) {
  const ids = new Set();
  for (const row of receiveLogs) {
    if (row?.receivedby != null) ids.add(Number(row.receivedby));
    if (row?.handedoverby != null) ids.add(Number(row.handedoverby));
  }
  for (const row of issueLogs) {
    if (row?.issuedby != null) ids.add(Number(row.issuedby));
  }
  return [...ids];
}

function lookupUserName(userNames, userId) {
  if (userId == null || userId === "") return null;
  if (!userNames) return null;
  if (userNames instanceof Map) return userNames.get(Number(userId)) ?? null;
  return userNames[Number(userId)] ?? null;
}

function formatReceiveLogRow(row, userNames = null) {
  if (!row) return null;
  return {
    id: row.recno,
    tenantId: row.tenantid ?? null,
    branchId: row.branchid ?? null,
    partId: row.jobcpairpartid,
    summaryId: row.jobcpairsummaryid,
    qtyReceived: row.qtyreceived ?? 0,
    wastageQty: row.wastageqty ?? 0,
    receivedBy: row.receivedby,
    receivedByName: lookupUserName(userNames, row.receivedby),
    handedOverBy: row.handedoverby ?? null,
    handedOverByName: lookupUserName(userNames, row.handedoverby),
    receivedDate: row.receiveddate ?? null,
    remarks: row.remarks ?? null,
    createdAt: row.createdat ?? null
  };
}

function formatIssueLogRow(row, userNames = null) {
  if (!row) return null;
  return {
    id: row.recno,
    tenantId: row.tenantid ?? null,
    branchId: row.branchid ?? null,
    partId: row.jobcpairpartid,
    summaryId: row.jobcpairsummaryid,
    issueQty: row.issueqty ?? 0,
    issuedBy: row.issuedby,
    issuedByName: lookupUserName(userNames, row.issuedby),
    storeName: row.storename ?? null,
    issueDate: row.issuedate ?? null,
    remarks: row.remarks ?? null,
    createdAt: row.createdat ?? null
  };
}

function formatOverviewRow(summary, part) {
  const partRow = formatPartRow(part);
  return {
    summaryId: summary.recno,
    jobId: summary.jobid,
    jobNo: summary.job?.code ?? null,
    customerId: summary.customerid,
    customerName: summary.customername,
    technicianId: summary.technicianid,
    technicianName: summary.technicianname,
    faultId: summary.faultid,
    faultName: summary.faultname,
    summaryReceiveStatus: summary.receivestatus,
    summaryIssueStatus: summary.issuestatus,
    ...partRow
  };
}

module.exports = {
  CP_AIR_RECEIVE_STATUSES,
  CP_AIR_ISSUE_STATUSES,
  clientError,
  parseIntQty,
  parsePositiveIntQty,
  parseOptionalUserId,
  parseOptionalText,
  parseOptionalDate,
  parsePartsPayload,
  parseReceiveLinesFromBody,
  parseIssueLinesFromBody,
  validatePartLineQuantities,
  isEligibleJobProductLine,
  isAutoCpairReceiveProductLine,
  buildDefaultAutoCpairPartFromJobProduct,
  installedQtyFromJobProduct,
  computeReceiveStatus,
  computeIssueStatus,
  sumPartTotals,
  formatSummaryRow,
  formatPartRow,
  formatSchemaPartFromJobProduct,
  formatOverviewRow,
  collectLogUserIds,
  formatReceiveLogRow,
  formatIssueLogRow,
  formatImages,
  parseImages
};
