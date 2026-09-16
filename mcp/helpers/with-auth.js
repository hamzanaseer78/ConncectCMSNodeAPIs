const { resolveAuthContext } = require("../auth-context");
const { errorResult } = require("../format-result");

/**
 * Wrap an MCP tool handler with auth resolution and error formatting.
 * @param {(auth: object|null, args: object) => Promise<object>} handler
 * @param {{ requireAuth?: boolean, authOptions?: object }} [options]
 */
function withAuth(handler, options = {}) {
  const requireAuth = options.requireAuth !== false;

  return async (args = {}) => {
    try {
      if (!requireAuth) {
        return await handler(null, args);
      }
      const ctx = await resolveAuthContext(options.authOptions || {});
      return await handler(ctx.auth, args);
    } catch (err) {
      return errorResult(err);
    }
  };
}

module.exports = {
  withAuth
};
