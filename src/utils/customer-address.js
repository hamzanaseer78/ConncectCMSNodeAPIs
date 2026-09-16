function toNullableInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeAddressText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizeAddressRecord(input = {}) {
  return {
    country: toNullableInt(input.country ?? input.countryId ?? input.countryid),
    city: toNullableInt(input.city ?? input.cityId ?? input.cityid),
    area: toNullableInt(input.area ?? input.areaId ?? input.areaid),
    address: normalizeAddressText(input.address)
  };
}

function addressKey(record = {}) {
  const normalized = normalizeAddressRecord(record);
  return [
    normalized.country ?? "",
    normalized.city ?? "",
    normalized.area ?? "",
    normalized.address ?? ""
  ].join("|");
}

function addressesEqual(left = {}, right = {}) {
  return addressKey(left) === addressKey(right);
}

function defaultAddressFromCustomer(row = {}) {
  return normalizeAddressRecord({
    country: row.country,
    city: row.city,
    area: row.area,
    address: row.address
  });
}

function formatAddressDto(record = {}, relations = {}) {
  const normalized = normalizeAddressRecord(record);
  return {
    recno: record.recno ?? null,
    country: normalized.country,
    city: normalized.city,
    area: normalized.area,
    address: normalized.address,
    countryId: normalized.country,
    cityId: normalized.city,
    areaId: normalized.area,
    countryname: relations.countries?.name ?? record.countryname ?? null,
    cityname: relations.cities?.name ?? record.cityname ?? null,
    areaname: relations.areas?.name ?? record.areaname ?? null,
    countryName: relations.countries?.name ?? record.countryname ?? null,
    cityName: relations.cities?.name ?? record.cityname ?? null,
    areaName: relations.areas?.name ?? record.areaname ?? null
  };
}

function buildAddressLabel(dto = {}) {
  const parts = [
    dto.address,
    dto.areaName ?? dto.areaname,
    dto.cityName ?? dto.cityname,
    dto.countryName ?? dto.countryname
  ]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean);

  if (parts.length) {
    return parts.join(", ");
  }

  if (dto.recno != null) {
    return `Address #${dto.recno}`;
  }

  return "Default address";
}

function formatCustomerAddressDropdownRow(dto = {}, options = {}) {
  const isDefault = options.isDefault === true;
  const value = options.value ?? (isDefault ? null : dto.recno ?? null);

  return {
    value,
    label: buildAddressLabel(dto),
    isDefault,
    recno: dto.recno ?? null,
    customerAddressId: isDefault ? null : dto.recno ?? null,
    country: dto.country ?? null,
    city: dto.city ?? null,
    area: dto.area ?? null,
    address: dto.address ?? null,
    countryId: dto.countryId ?? dto.country ?? null,
    cityId: dto.cityId ?? dto.city ?? null,
    areaId: dto.areaId ?? dto.area ?? null,
    countryName: dto.countryName ?? dto.countryname ?? null,
    cityName: dto.cityName ?? dto.cityname ?? null,
    areaName: dto.areaName ?? dto.areaname ?? null
  };
}

function hasAddressContent(record = {}) {
  const normalized = normalizeAddressRecord(record);
  return Boolean(
    normalized.country || normalized.city || normalized.area || normalized.address
  );
}

function extractAdditionalAddressesInput(data = {}) {
  if (!Object.prototype.hasOwnProperty.call(data, "additionalAddresses")) {
    return undefined;
  }
  const raw = data.additionalAddresses ?? data.additionaladdresses ?? data.addresses;
  if (raw == null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    const err = new Error("additionalAddresses must be an array");
    err.status = 400;
    throw err;
  }
  return raw;
}

function extractJobCustomerAddress(data = {}, payload = {}) {
  const customer = data.customer && typeof data.customer === "object" ? data.customer : {};
  const address = normalizeAddressText(
    data.address ?? data.customerAddress ?? data.siteAddress ?? customer.address
  );

  return normalizeAddressRecord({
    country: customer.country ?? customer.countryid ?? customer.countryId ?? data.country,
    city: customer.city ?? customer.cityid ?? customer.cityId ?? data.city ?? payload.city,
    area: customer.area ?? customer.areaid ?? customer.areaId ?? data.area ?? payload.area,
    address
  });
}

module.exports = {
  toNullableInt,
  normalizeAddressText,
  normalizeAddressRecord,
  addressKey,
  addressesEqual,
  defaultAddressFromCustomer,
  formatAddressDto,
  buildAddressLabel,
  formatCustomerAddressDropdownRow,
  hasAddressContent,
  extractAdditionalAddressesInput,
  extractJobCustomerAddress
};
