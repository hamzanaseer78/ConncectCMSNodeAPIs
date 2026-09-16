const prisma = require("../database/prisma");

function collectCountryCityIds(objects = []) {
  const countryIds = new Set();
  const cityIds = new Set();

  objects.forEach((obj) => {
    if (!obj) return;
    if (obj.country != null && obj.country !== "") {
      const id = Number(obj.country);
      if (Number.isFinite(id)) countryIds.add(id);
    }
    if (obj.city != null && obj.city !== "") {
      const id = Number(obj.city);
      if (Number.isFinite(id)) cityIds.add(id);
    }
  });

  return {
    countryIds: [...countryIds],
    cityIds: [...cityIds]
  };
}

async function loadCountryCityNameMaps(countryIds = [], cityIds = []) {
  const [countries, cities] = await Promise.all([
    countryIds.length
      ? prisma.countries.findMany({
          where: { recno: { in: countryIds } },
          select: { recno: true, name: true }
        })
      : [],
    cityIds.length
      ? prisma.cities.findMany({
          where: { recno: { in: cityIds } },
          select: { recno: true, name: true }
        })
      : []
  ]);

  return {
    countryNames: new Map(countries.map((row) => [row.recno, row.name ?? null])),
    cityNames: new Map(cities.map((row) => [row.recno, row.name ?? null]))
  };
}

function appendCountryCityLabels(row, maps) {
  if (!row || typeof row !== "object") {
    return row;
  }

  const countryId = row.country != null && row.country !== "" ? Number(row.country) : null;
  const cityId = row.city != null && row.city !== "" ? Number(row.city) : null;
  const countryName =
    countryId != null && Number.isFinite(countryId) ? maps.countryNames.get(countryId) ?? null : null;
  const cityName = cityId != null && Number.isFinite(cityId) ? maps.cityNames.get(cityId) ?? null : null;

  return {
    ...row,
    country: countryId != null && Number.isFinite(countryId) ? countryId : row.country ?? null,
    city: cityId != null && Number.isFinite(cityId) ? cityId : row.city ?? null,
    countryName,
    cityName
  };
}

async function enrichSessionProfileGeo(user, organizations = []) {
  const geoObjects = [user];
  organizations.forEach((org) => {
    geoObjects.push(org);
    (org.branches || []).forEach((branch) => geoObjects.push(branch));
  });

  const { countryIds, cityIds } = collectCountryCityIds(geoObjects);
  const maps = await loadCountryCityNameMaps(countryIds, cityIds);

  return {
    user: appendCountryCityLabels(user, maps),
    organizations: organizations.map((org) => ({
      ...appendCountryCityLabels(org, maps),
      branches: (org.branches || []).map((branch) => appendCountryCityLabels(branch, maps))
    }))
  };
}

module.exports = {
  appendCountryCityLabels,
  collectCountryCityIds,
  enrichSessionProfileGeo,
  loadCountryCityNameMaps
};
