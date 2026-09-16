const { normalizeUserType } = require("./user-type");
const { clientError } = require("./attendance-location");

const VALID_PRESENCE = Object.freeze(["active", "idle", "out"]);
const VALID_ATTENDANCE_STATUS = Object.freeze([
  "checked_in",
  "on_break",
  "checked_out",
  "none"
]);

function pickQueryText(query = {}, ...keys) {
  for (const key of keys) {
    const value = query[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function parseOptionalBoolean(value, label) {
  if (value == null || value === "") {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }
  throw clientError(`${label} must be true or false`);
}

function parseOptionalPositiveInt(value, label) {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw clientError(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseAttendanceUsersFilters(query = {}) {
  const presenceRaw = pickQueryText(query, "presence");
  const presence = presenceRaw ? presenceRaw.toLowerCase() : null;
  if (presence && !VALID_PRESENCE.includes(presence)) {
    throw clientError("presence filter must be active, idle, or out");
  }

  const attendanceStatusRaw = pickQueryText(
    query,
    "attendanceStatus",
    "attendancestatus",
    "status"
  );
  const attendanceStatus = attendanceStatusRaw ? attendanceStatusRaw.toLowerCase() : null;
  if (attendanceStatus && !VALID_ATTENDANCE_STATUS.includes(attendanceStatus)) {
    throw clientError(
      "attendanceStatus filter must be checked_in, on_break, checked_out, or none"
    );
  }

  const usertypeRaw = pickQueryText(query, "usertype", "userType", "type");
  const usertype = usertypeRaw
    ? normalizeUserType(usertypeRaw, { required: true })
    : null;

  const search = pickQueryText(query, "search", "q");
  const name = pickQueryText(query, "name");
  const email = pickQueryText(query, "email");

  const useridRaw = query.userid ?? query.userId;
  const sessionIdRaw = query.sessionId ?? query.sessionid;

  return {
    userid: parseOptionalPositiveInt(useridRaw, "userid"),
    name,
    email,
    search,
    usertype,
    isactive: parseOptionalBoolean(
      query.isactive ?? query.isActive ?? query.active,
      "isactive"
    ),
    presence,
    attendanceStatus,
    sessionId: parseOptionalPositiveInt(sessionIdRaw, "sessionId"),
    hasLocation: parseOptionalBoolean(
      query.hasLocation ?? query.haslocation ?? query.location,
      "hasLocation"
    )
  };
}

function buildMembershipUserWhere(filters = {}) {
  const and = [];

  if (filters.userid != null) {
    and.push({ userid: filters.userid });
  }

  if (filters.name) {
    and.push({ name: { contains: filters.name, mode: "insensitive" } });
  }

  if (filters.email) {
    and.push({ email: { contains: filters.email, mode: "insensitive" } });
  }

  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } }
      ]
    });
  }

  if (filters.usertype) {
    and.push({ usertype: filters.usertype });
  }

  if (filters.isactive !== undefined) {
    and.push({ isactive: filters.isactive });
  }

  if (!and.length) {
    return undefined;
  }

  return and.length === 1 ? and[0] : { AND: and };
}

function matchesAttendanceUserRow(row, filters = {}) {
  if (filters.presence && row.presence !== filters.presence) {
    return false;
  }

  if (filters.attendanceStatus) {
    if (filters.attendanceStatus === "none") {
      if (row.attendanceStatus != null) {
        return false;
      }
    } else if (filters.attendanceStatus === "checked_out") {
      if (row.presence !== "out") {
        return false;
      }
    } else if (row.attendanceStatus !== filters.attendanceStatus) {
      return false;
    }
  }

  if (filters.sessionId != null) {
    if (row.session?.sessionId !== filters.sessionId) {
      return false;
    }
  }

  const hasLocation = Boolean(row.lastLocation);
  if (filters.hasLocation === true && !hasLocation) {
    return false;
  }
  if (filters.hasLocation === false && hasLocation) {
    return false;
  }

  return true;
}

function formatAppliedAttendanceUserFilters(filters = {}) {
  return {
    userid: filters.userid ?? null,
    name: filters.name ?? null,
    email: filters.email ?? null,
    search: filters.search ?? null,
    usertype: filters.usertype ?? null,
    isactive: filters.isactive ?? null,
    presence: filters.presence ?? null,
    attendanceStatus: filters.attendanceStatus ?? null,
    sessionId: filters.sessionId ?? null,
    hasLocation: filters.hasLocation ?? null
  };
}

module.exports = {
  VALID_PRESENCE,
  VALID_ATTENDANCE_STATUS,
  parseAttendanceUsersFilters,
  buildMembershipUserWhere,
  matchesAttendanceUserRow,
  formatAppliedAttendanceUserFilters
};
