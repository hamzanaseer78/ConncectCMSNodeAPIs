// Export as middleware mounted at `/graphql/playground`.
// Altair expects to be mounted via `app.use('/path', middleware)`.
module.exports = function graphqlPlaygroundRoute(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      error: "GraphQL Playground is disabled in production",
    });
  }

  // Altair is a self-hosted GraphQL client UI (no CDN),
  // works reliably behind corporate proxies and supports auth headers like Apollo Studio.
  // eslint-disable-next-line global-require
  const { altairExpress } = require("altair-express-middleware");

  const middleware = altairExpress({
    endpointURL: "/graphql",
    initialQuery: `# ConnectCMS GraphQL (Altair)
#
# Tip:
# - Open the "Headers" tab and set:
#   Authorization: Bearer <JWT>
#
query __PingSchema {
  __schema {
    queryType { name }
  }
}
`,
  });

  return middleware(req, res, next);
};