// Export as middleware mounted at `/graphql/playground`.
module.exports = function graphqlPlaygroundRoute(req, res, next) {
  const enabledInProduction =
    process.env.GRAPHQL_PLAYGROUND_ENABLED === "true" ||
    process.env.GRAPHQL_PLAYGROUND_ENABLED === "1";

  if (process.env.NODE_ENV === "production" && !enabledInProduction) {
    return res.status(404).json({
      error: "GraphQL Playground is disabled in production",
      hint: "Set GRAPHQL_PLAYGROUND_ENABLED=true or use Apollo Sandbox / GET /graphql/schema"
    });
  }

  // eslint-disable-next-line global-require
  const { altairExpress } = require("altair-express-middleware");

  const middleware = altairExpress({
    endpointURL: "/graphql",
    persistedSettings: {
      schema: {
        reloadOnStart: true
      }
    },
    initialQuery: `# ConnectCMS GraphQL Reports Explorer
#
# 1) Open Headers tab -> Authorization: Bearer <JWT>
# 2) Run jobsReportsCatalog to list every report API name
# 3) Docs panel (left) lists all Query/Mutation fields after schema loads
#
query JobsReportsCatalog {
  jobsReportsCatalog {
    title
    kind
    reportKey
    dataQuery
    columnsQuery
    updateColumnsMutation
    detailDataQuery
  }
}
`,
    // Omit initialHeaders so introspection loads the sidebar without JWT.
    // Add Authorization in the Headers tab when running report data queries.
  });

  return middleware(req, res, next);
};
