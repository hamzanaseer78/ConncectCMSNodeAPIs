/**
 * Request Validation Middleware
 * Validates required fields in request body
 */
function validateRequest(requiredFields = []) {
  return (req, res, next) => {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body required' });
    }

    const missing = requiredFields.filter(field => 
      req.body[field] === undefined || 
      req.body[field] === null || 
      req.body[field] === ''
    );

    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        missingFields: missing 
      });
    }

    next();
  };
}

module.exports = validateRequest;
