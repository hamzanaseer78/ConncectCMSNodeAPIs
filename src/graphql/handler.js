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

/**
 * Detect Introspection Query
 */
function isIntrospection(req) {
  try {
    /**
     * GET introspection
     */
    if (
      req.url.includes("__schema") ||
      req.url.includes("__type")
    ) {
      return true;
    }

    /**
     * POST introspection
     */
    const query =
      req.body?.query || "";

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

    /**
     * ALWAYS allow introspection
     */
    if (isIntrospection(req)) {
      console.log(
        "✅ Introspection query allowed"
      );

      return {
        auth: {
          tenantid: 1,
          branchid: 1,
          introspection: true,
        },
      };
    }

    /**
     * Normal JWT auth
     */
    const auth = getAuth(req);

    return {
      auth,
    };
  },

  graphiql: false,
});

module.exports = graphqlHandler;