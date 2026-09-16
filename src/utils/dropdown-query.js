const DROPDOWN_DEFAULT_LIMIT = 500;
const DROPDOWN_MAX_LIMIT = 5000;
const PRODUCTS_DROPDOWN_DEFAULT_LIMIT = 10000;
const PRODUCTS_DROPDOWN_MAX_LIMIT = 50000;

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function isTruthyQueryFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isCatalogProductResource(resourceName) {
  return resourceName === "products" || resourceName === "erpproducts";
}

function resolveDropdownPaging(resourceName, query = {}) {
  const unlimited =
    query.limit === "all" ||
    query.limit === "0" ||
    isTruthyQueryFlag(query.all);

  if (unlimited) {
    return { take: undefined, skip: 0, page: 1, pageSize: null, unlimited: true };
  }

  const page = Math.max(parsePositiveInt(query.page) || 1, 1);
  const defaultLimit =
    isCatalogProductResource(resourceName) ? PRODUCTS_DROPDOWN_DEFAULT_LIMIT : DROPDOWN_DEFAULT_LIMIT;
  const maxLimit =
    isCatalogProductResource(resourceName) ? PRODUCTS_DROPDOWN_MAX_LIMIT : DROPDOWN_MAX_LIMIT;
  const pageSize = Math.min(
    Math.max(parsePositiveInt(query.limit ?? query.pageSize) || defaultLimit, 1),
    maxLimit
  );
  const hasPage = query.page != null && query.page !== "";
  const skip = hasPage ? (page - 1) * pageSize : 0;

  return {
    take: pageSize,
    skip,
    page,
    pageSize,
    unlimited: false
  };
}

function applyProductSearchFilter(where, query = {}) {
  const search = query.search ?? query.q ?? query.name;
  if (search == null || String(search).trim() === "") {
    return;
  }

  const term = String(search).trim();
  where.OR = [
    { name: { contains: term, mode: "insensitive" } },
    { barcode: { contains: term, mode: "insensitive" } },
    { erpcode: { contains: term, mode: "insensitive" } },
    { hscode: { contains: term, mode: "insensitive" } }
  ];
}

module.exports = {
  DROPDOWN_DEFAULT_LIMIT,
  DROPDOWN_MAX_LIMIT,
  PRODUCTS_DROPDOWN_DEFAULT_LIMIT,
  PRODUCTS_DROPDOWN_MAX_LIMIT,
  isCatalogProductResource,
  resolveDropdownPaging,
  applyProductSearchFilter,
  isTruthyQueryFlag
};
