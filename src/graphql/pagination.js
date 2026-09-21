const { CONSTANTS } = require("../utils/constants");

const GRAPHQL_MAX_PAGE_SIZE = CONSTANTS.PAGINATION.GRAPHQL_MAX_PAGE_SIZE;
const DEFAULT_PAGE_SIZE = CONSTANTS.PAGINATION.DEFAULT_PAGE_SIZE;

function resolveGraphqlPageSize(value, defaultSize = DEFAULT_PAGE_SIZE) {
  const requested = Math.max(Number(value ?? defaultSize) || defaultSize, 1);
  return Math.min(requested, GRAPHQL_MAX_PAGE_SIZE);
}

module.exports = {
  GRAPHQL_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  resolveGraphqlPageSize
};
