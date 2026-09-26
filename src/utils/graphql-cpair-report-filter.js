function graphqlCpairFilterToQuery(filter = {}, args = {}, options = {}) {
  const query = {};

  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query[key] = value;
    }
  });

  if (args.page != null) query.page = args.page;
  if (args.pageSize != null) query.pageSize = args.pageSize;

  const sortBy = args.sortBy ?? filter.sortBy;
  if (sortBy) {
    query.sortBy = options.sortFieldMap?.[sortBy] ?? sortBy;
  }
  if (args.sortOrder ?? filter.sortOrder) {
    query.sortOrder = args.sortOrder ?? filter.sortOrder;
  }

  return query;
}

module.exports = {
  graphqlCpairFilterToQuery
};
