/**
 * Embedded Apollo Sandbox (same-origin) so schema docs load in the sidebar
 * without cross-origin introspection/CORS issues from studio.apollographql.com.
 */
module.exports = function graphqlStudioRoute(req, res) {
  const enabledInProduction =
    process.env.GRAPHQL_PLAYGROUND_ENABLED === "true" ||
    process.env.GRAPHQL_PLAYGROUND_ENABLED === "1";

  if (process.env.NODE_ENV === "production" && !enabledInProduction) {
    return res.status(404).json({
      error: "GraphQL Studio is disabled in production",
      hint: "Set GRAPHQL_PLAYGROUND_ENABLED=true or use GET /graphql/schema"
    });
  }

  const endpoint = `${req.protocol}://${req.get("host")}/graphql`;

  res.type("text/html; charset=utf-8").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ConnectCMS GraphQL Studio</title>
  <style>
    html, body { margin: 0; height: 100%; }
    #sandbox { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="sandbox"></div>
  <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
  <script>
    new window.EmbeddedSandbox({
      target: "#sandbox",
      initialEndpoint: ${JSON.stringify(endpoint)},
      includeCookies: false,
      initialState: {
        document: \`query JobsReportsCatalog {
  jobsReportsCatalog {
    title
    kind
    reportKey
    dataQuery
    columnsQuery
    updateColumnsMutation
    detailDataQuery
  }
}\`,
        headers: {},
        sharedHeaders: {}
      }
    });
  </script>
</body>
</html>`);
};
