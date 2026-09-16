function sliceCoord(value, maxLen = 20) {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim();
  return s === "" ? null : s.slice(0, maxLen);
}

/** Public API shape: latitude, longitude, address only. */
function pickLocationFields(payload = {}) {
  const latitude = sliceCoord(payload.latitude);
  const longitude = sliceCoord(payload.longitude);
  const address =
    payload.address != null && String(payload.address).trim() !== ""
      ? String(payload.address).trim()
      : null;
  return { latitude, longitude, address };
}

function pickRemarks(payload, fallback) {
  if (payload.remarks != null && String(payload.remarks).trim() !== "") {
    return String(payload.remarks).trim();
  }
  return fallback;
}

/** Map API location → jobtravel/jobwork DB start columns. */
function pickStartLocation(payload = {}) {
  const { latitude, longitude, address } = pickLocationFields(payload);
  return {
    startlatitude: latitude,
    startlongitude: longitude,
    startaddress: address
  };
}

/** Map API location → DB stop columns. */
function pickStopLocation(payload = {}) {
  const { latitude, longitude, address } = pickLocationFields(payload);
  return {
    stoplatitude: latitude,
    stoplongitude: longitude,
    stopaddress: address
  };
}

/** Response body: same fields as request (coords as strings when stored in DB). */
function toLocationResponse(dbRow, kind = "start") {
  const prefix = kind === "stop" ? "stop" : "start";
  const lat = dbRow?.[`${prefix}latitude`];
  const lng = dbRow?.[`${prefix}longitude`];
  return {
    latitude: lat != null ? Number(lat) || lat : null,
    longitude: lng != null ? Number(lng) || lng : null,
    address: dbRow?.[`${prefix}address`] ?? null
  };
}

function locationFromPayload(payload) {
  return pickLocationFields(payload);
}

module.exports = {
  pickLocationFields,
  pickRemarks,
  pickStartLocation,
  pickStopLocation,
  toLocationResponse,
  locationFromPayload
};
