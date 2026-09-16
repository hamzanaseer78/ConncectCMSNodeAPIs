/**
 * Normalize and validate user email uniqueness (one email = one user).
 */

function normalizeUserEmail(email) {
  if (email === undefined || email === null) {
    return "";
  }
  return String(email).trim().toLowerCase();
}

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Find user by email (case-insensitive).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
async function findUserByEmail(prismaClient, email) {
  const normalized = normalizeUserEmail(email);
  if (!normalized) {
    return null;
  }

  return prismaClient.users.findFirst({
    where: {
      email: { equals: normalized, mode: "insensitive" }
    }
  });
}

/**
 * Ensure email is present and not already used by another user.
 * @returns {string} normalized email
 */
async function assertUserEmailAvailable(prismaClient, email, options = {}) {
  const normalized = normalizeUserEmail(email);
  if (!normalized) {
    throw clientError("Email required");
  }

  const existing = await findUserByEmail(prismaClient, normalized);
  const excludeUserId =
    options.excludeUserId != null ? Number(options.excludeUserId) : null;

  if (existing && (excludeUserId == null || existing.userid !== excludeUserId)) {
    throw clientError("A user with this email already exists", 409);
  }

  return normalized;
}

module.exports = {
  normalizeUserEmail,
  findUserByEmail,
  assertUserEmailAvailable,
  clientError
};
