const USER_TYPES = Object.freeze(["admin", "manager", "technician", "distributor"]);

const ALIASES = Object.freeze({
  technition: "technician",
  technitian: "technician",
  tech: "technician"
});

function normalizeUserType(value, { required = false, defaultType = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      const err = new Error(`User type is required (${USER_TYPES.join(", ")})`);
      err.status = 400;
      throw err;
    }
    return defaultType;
  }

  const raw = String(value).trim().toLowerCase();
  const mapped = ALIASES[raw] || raw;

  if (!USER_TYPES.includes(mapped)) {
    const err = new Error(`User type must be one of: ${USER_TYPES.join(", ")}`);
    err.status = 400;
    throw err;
  }

  return mapped;
}

function resolveUserTypeFromInput(input = {}, options = {}) {
  const raw =
    input.usertype !== undefined
      ? input.usertype
      : input.userType !== undefined
        ? input.userType
        : input.type !== undefined
          ? input.type
          : undefined;
  return normalizeUserType(raw, options);
}

module.exports = {
  USER_TYPES,
  normalizeUserType,
  resolveUserTypeFromInput
};
