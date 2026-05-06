/**
 * Tenant & Branch Filter Middleware
 * Ensures all responses are filtered by tenant and branch from JWT token
 */
function tenantBranchFilter(req, res, next) {
  // Store original JSON response function
  const originalJson = res.json;

  // Override JSON response function
  res.json = function (data) {
    // If data is not an object, return as is
    if (!data || typeof data !== 'object') {
      return originalJson.call(this, data);
    }

    // If user is authenticated, add tenant and branch context
    if (req.auth) {
      data._context = {
        tenantid: req.auth.tenantid,
        branchid: req.auth.branchid,
        userid: req.auth.userid
      };
    }

    return originalJson.call(this, data);
  };

  next();
}

module.exports = tenantBranchFilter;
