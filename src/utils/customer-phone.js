/**
 * Customer phone (contactno) normalization and uniqueness within tenant + branch.
 */

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeCustomerPhone(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function applyCustomerPhoneAliases(data = {}) {
  const next = { ...data };
  const raw =
    next.contactno ??
    next.contactNo ??
    next.phone ??
    next.phoneNo ??
    next.phoneNumber ??
    undefined;

  if (raw !== undefined) {
    next.contactno = normalizeCustomerPhone(raw);
  }

  delete next.contactNo;
  delete next.phone;
  delete next.phoneNo;
  delete next.phoneNumber;

  return next;
}

async function findCustomerByPhone(prismaClient, phone, scope = {}) {
  const contactno = normalizeCustomerPhone(phone);
  if (!contactno) {
    return null;
  }

  const tenantid = scope.tenantid != null ? Number(scope.tenantid) : null;
  const branchid = scope.branchid != null ? Number(scope.branchid) : null;
  if (!Number.isFinite(tenantid) || !Number.isFinite(branchid)) {
    return null;
  }

  return prismaClient.customers.findFirst({
    where: {
      tenantid,
      branchid,
      contactno
    }
  });
}

async function assertCustomerPhoneAvailable(prismaClient, phone, scope = {}, options = {}) {
  const contactno = normalizeCustomerPhone(phone);
  if (contactno == null) {
    return null;
  }

  const existing = await findCustomerByPhone(prismaClient, contactno, scope);
  const excludeCustomerId =
    options.excludeCustomerId != null ? Number(options.excludeCustomerId) : null;

  if (existing && (excludeCustomerId == null || existing.customerid !== excludeCustomerId)) {
    throw clientError(`A customer with phone "${contactno}" already exists`, 409);
  }

  return contactno;
}

module.exports = {
  normalizeCustomerPhone,
  applyCustomerPhoneAliases,
  findCustomerByPhone,
  assertCustomerPhoneAvailable,
  clientError
};
