const AUDIENCES = Object.freeze(["all", "technician", "manager", "admin"]);

const TECHNICIAN_FEED = Object.freeze(["all", "technician"]);

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeAnnouncementAudience(value, { defaultAudience = "technician" } = {}) {
  if (value === undefined || value === null || value === "") {
    return defaultAudience;
  }
  const raw = String(value).trim().toLowerCase();
  if (!AUDIENCES.includes(raw)) {
    throw clientError(`audience must be one of: ${AUDIENCES.join(", ")}`);
  }
  return raw;
}

function audiencesForUserType(usertype) {
  if (!usertype) {
    return TECHNICIAN_FEED;
  }
  const t = String(usertype).toLowerCase();
  if (t === "admin") {
    return AUDIENCES;
  }
  if (t === "manager") {
    return ["all", "manager", "technician"];
  }
  return TECHNICIAN_FEED;
}

module.exports = {
  AUDIENCES,
  TECHNICIAN_FEED,
  normalizeAnnouncementAudience,
  audiencesForUserType,
  clientError
};
