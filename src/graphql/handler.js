const { buildSchema } = require("graphql");
const { createHandler } = require("graphql-http/lib/use/express");

const { verifyToken } = require("../config/jwt");
const { typeDefs, resolvers } = require("./schema");

/**
 * Build Schema
 */
const schema = buildSchema(typeDefs);

/**
 * Verify JWT
 */
function getAuth(req) {
  const authHeader =
    req.headers.authorization || "";

  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token =
    authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function getGraphqlPayload(req) {
  const query =
    req.body?.query ||
    req.query?.query ||
    "";

  const operationName =
    req.body?.operationName ||
    req.query?.operationName ||
    "";

  return { query: String(query), operationName: String(operationName) };
}

/**
 * Detect Introspection Query (Apollo Studio / Altair load schema via this).
 * Must succeed without a valid JWT so the explorer sidebar can populate.
 */
function isIntrospection(req) {
  try {
    const url = String(req.url || req.originalUrl || "");

    if (url.includes("__schema") || url.includes("__type")) {
      return true;
    }

    const { query, operationName } = getGraphqlPayload(req);

    if (operationName === "IntrospectionQuery") {
      return true;
    }

    return (
      query.includes("__schema") ||
      query.includes("__type") ||
      query.includes("IntrospectionQuery")
    );
  } catch {
    return false;
  }
}

/**
 * GraphQL Handler
 */
const graphqlHandler = createHandler({
  schema,

  rootValue: resolvers,

  context: async (ctx) => {
    const req = ctx.raw;

    if (isIntrospection(req)) {
      return {
        auth: {
          tenantid: 1,
          branchid: 1,
          userid: 1,
          introspection: true
        }
      };
    }

    const auth = getAuth(req);

    return {
      auth
    };
  },

  graphiql: false
});

module.exports = graphqlHandler;
module.exports.schema = schema;
module.exports.isIntrospection = isIntrospection;
module.exports.getGraphqlPayload = getGraphqlPayload;
