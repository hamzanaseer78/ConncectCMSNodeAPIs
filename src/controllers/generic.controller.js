const serviceContainer = require("../utils/service-container");

/**
 * Create a generic controller with singleton service
 * @param {string} resourceName - Name of the resource
 * @returns {Object} Controller with CRUD handlers
 */
function createGenericController(resourceName) {
  return serviceContainer.getGenericController(resourceName);
}

module.exports = createGenericController;
