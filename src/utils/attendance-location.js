function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseCoord(value, min, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw clientError(`${label} must be a number between ${min} and ${max}`);
  }
  return n;
}

/** Mandatory latitude, longitude, and address for attendance actions. */
function parseRequiredAttendanceLocation(body = {}) {
  const latitude = parseCoord(body.latitude, -90, 90, "latitude");
  const longitude = parseCoord(body.longitude, -180, 180, "longitude");

  const address =
    body.address != null && String(body.address).trim() !== ""
      ? String(body.address).trim()
      : null;

  if (!address) {
    throw clientError("address is required");
  }

  return { latitude, longitude, address };
}

function toLocationDto(latitude, longitude, address) {
  return {
    latitude,
    longitude,
    address: address ?? null
  };
}

module.exports = {
  parseRequiredAttendanceLocation,
  toLocationDto,
  clientError
};
