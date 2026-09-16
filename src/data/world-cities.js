const { City } = require("country-state-city");
const { resolveWorldCountry } = require("./world-countries");

/** @type {Map<string, object[]>} */
const cityDropdownCache = new Map();

/**
 * Stable positive integer id for a city row (for dropdown value / forms).
 */
function cityDropdownValue(countryCode, stateCode, name) {
  const key = `${countryCode}|${stateCode || ""}|${String(name || "").trim()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function normalizeCountryInput(countryInput) {
  if (countryInput && typeof countryInput === "object" && countryInput.code) {
    return countryInput;
  }
  return resolveWorldCountry(countryInput);
}

/**
 * Static cities for an ISO country (matches overall/countries ids).
 * @returns {{ country: object, data: object[] } | null}
 */
function listWorldCitiesDropdown(countryInput) {
  const country = normalizeCountryInput(countryInput);
  if (!country) {
    return null;
  }

  if (cityDropdownCache.has(country.code)) {
    return {
      country,
      data: cityDropdownCache.get(country.code)
    };
  }

  const rows = City.getCitiesOfCountry(country.code) || [];
  const data = rows
    .map((row) => ({
      value: cityDropdownValue(country.code, row.stateCode, row.name),
      label: row.name,
      countryId: country.numeric,
      countryCode: country.code,
      stateCode: row.stateCode ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );

  cityDropdownCache.set(country.code, data);

  return { country, data };
}

module.exports = {
  cityDropdownValue,
  listWorldCitiesDropdown
};
