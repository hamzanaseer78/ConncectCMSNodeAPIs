const BRAND_ID_KEYS = ["brandId", "brandid", "brand_id", "brandID"];

function pickDefined(data, keys) {
  if (!data || typeof data !== "object") return undefined;
  for (const key of keys) {
    if (data[key] !== undefined) return data[key];
  }
  return undefined;
}

function tryParseEquipmentObject(text) {
  if (!text || typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === "object" && parsed.equipment && typeof parsed.equipment === "object") {
      return parsed.equipment;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function parseEquipmentFromRemarks(remarks) {
  if (remarks == null || String(remarks).trim() === "") {
    return {};
  }
  const text = String(remarks).trim();
  const whole = tryParseEquipmentObject(text);
  if (whole) return whole;

  for (const chunk of text.split("\n")) {
    const equipment = tryParseEquipmentObject(chunk);
    if (equipment) return equipment;
  }

  return {};
}

function equipmentBrandIdFromStored(equipment = {}) {
  if (equipment.brandId != null) {
    const id = Number(equipment.brandId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (equipment.brand != null) {
    const legacy = Number(equipment.brand);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
  }
  return null;
}

/** brandId from API body → job.brandid column (brands.recno). */
function pickEquipmentBrandId(data = {}) {
  const raw = pickDefined(data, BRAND_ID_KEYS);
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function brandIdProvidedInPayload(data = {}) {
  return pickDefined(data, BRAND_ID_KEYS) !== undefined;
}

function trimOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function buildEquipmentObject(data = {}, existing = {}) {
  const equipment = { ...existing };

  if (data.productModel !== undefined) {
    const v = trimOrNull(data.productModel);
    if (v) equipment.productModel = v;
    else delete equipment.productModel;
  }
  if (data.serialNumber !== undefined) {
    const v = trimOrNull(data.serialNumber);
    if (v) equipment.serialNumber = v;
    else delete equipment.serialNumber;
  }
  if (data.invoiceNumber !== undefined) {
    const v = trimOrNull(data.invoiceNumber);
    if (v) equipment.invoiceNumber = v;
    else delete equipment.invoiceNumber;
  }
  if (data.purchaseDate !== undefined) {
    const v = trimOrNull(data.purchaseDate);
    if (v) equipment.purchaseDate = v;
    else delete equipment.purchaseDate;
  }

  return equipment;
}

function stringifyEquipment(equipment) {
  if (!equipment || !Object.keys(equipment).length) return null;
  return JSON.stringify({ equipment });
}

/**
 * Build jobdetails.remarks: free-text chunks + trailing equipment JSON (model/serial/invoice only).
 */
function mergeJobdetailsRemarks(data = {}, existingRemarks = null) {
  const chunks = [];
  const existingText = existingRemarks != null ? String(existingRemarks) : "";
  const existingEquipment = parseEquipmentFromRemarks(existingRemarks);

  if (existingText) {
    for (const chunk of existingText.split("\n")) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      if (tryParseEquipmentObject(trimmed)) continue;
      chunks.push(chunk);
    }
  }

  if (data.detailRemarks != null && String(data.detailRemarks).trim() !== "") {
    chunks.push(String(data.detailRemarks).trim());
  }
  if (data.jobdetailsRemarks != null && String(data.jobdetailsRemarks).trim() !== "") {
    chunks.push(String(data.jobdetailsRemarks).trim());
  }

  const equipment = buildEquipmentObject(data, existingEquipment);
  const eqJson = stringifyEquipment(equipment);
  if (eqJson) chunks.push(eqJson);

  if (!chunks.length) return null;
  return chunks.join("\n");
}

function hasEquipmentFieldInput(data = {}) {
  return (
    data.productModel !== undefined ||
    data.serialNumber !== undefined ||
    data.invoiceNumber !== undefined ||
    data.purchaseDate !== undefined ||
    data.detailRemarks !== undefined ||
    data.jobdetailsRemarks !== undefined
  );
}

/** Job-level fields: brandId on job.brandid; other equipment fields in jobdetails.remarks JSON. */
function normalizeJobDetailDescription(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

/**
 * Job details API: never expose jobdetails.remarks as a stand-in for missing description.
 * Equipment JSON in remarks is still used server-side via jobMainEquipmentFields before masking.
 */
function formatJobDetailForResponse(detail) {
  if (!detail) return null;

  const description = normalizeJobDetailDescription(detail.description);
  return {
    ...detail,
    description,
    remarks: description ? detail.remarks ?? null : null
  };
}

function jobMainEquipmentFields(detailOrRemarks, jobBrandid = null) {
  const remarks =
    detailOrRemarks != null && typeof detailOrRemarks === "object"
      ? detailOrRemarks.remarks
      : detailOrRemarks;
  const equipment = parseEquipmentFromRemarks(remarks);
  const fromJob =
    jobBrandid != null && jobBrandid !== "" && Number.isFinite(Number(jobBrandid)) && Number(jobBrandid) > 0
      ? Number(jobBrandid)
      : null;

  return {
    brandId: fromJob ?? equipmentBrandIdFromStored(equipment),
    productModel: equipment.productModel ?? null,
    serialNumber: equipment.serialNumber ?? null,
    invoiceNumber: equipment.invoiceNumber ?? null,
    purchaseDate: equipment.purchaseDate ?? null
  };
}

/** Unwrap `{ job: { ... } }` from some clients. */
function normalizeJobRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body || {};
  }
  if (body.job && typeof body.job === "object" && !Array.isArray(body.job)) {
    const { job, ...rest } = body;
    return { ...rest, ...job };
  }
  return body;
}

module.exports = {
  parseEquipmentFromRemarks,
  equipmentBrandIdFromStored,
  pickEquipmentBrandId,
  brandIdProvidedInPayload,
  mergeJobdetailsRemarks,
  hasEquipmentFieldInput,
  normalizeJobDetailDescription,
  formatJobDetailForResponse,
  jobMainEquipmentFields,
  normalizeJobRequestBody
};
