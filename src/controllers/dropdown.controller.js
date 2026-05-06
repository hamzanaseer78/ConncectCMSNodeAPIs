/**
 * Dropdown Controller
 * Handles dropdown list requests without RBAC
 * Used for form dropdowns, filters, etc.
 */

const prisma = require("../database/prisma");
const { getListScalarFields } = require("../utils/prisma-metadata");
const resources = require("../config/resources");

class DropdownController {
  /**
   * Get dropdown list for a resource
   * Only requires JWT authentication (no rights checking)
   * Returns only data for the authenticated user's tenant and branch
   */
  async getDropdown(resourceName, auth) {
    const config = resources[resourceName];

    if (!config) {
      throw new Error(`Unknown resource: ${resourceName}`);
    }

    const idField = config.id;
    const model = prisma[resourceName];

    // Build where clause based on tenant/branch scoping
    const where = {};

    if (config.tenantScoped && auth?.tenantid) {
      where.tenantid = Number(auth.tenantid);
    }

    if (config.branchScoped && auth?.branchid) {
      where.branchid = Number(auth.branchid);
    }

    // Get scalar fields to select
    const scalarFields = getListScalarFields(resourceName, config);
    const selectFields = scalarFields.reduce((acc, field) => {
      acc[field.name] = true;
      return acc;
    }, {});

    // Add ID field
    selectFields[idField] = true;

    // Fetch data
    const items = await model.findMany({
      where,
      select: selectFields,
      orderBy: { [idField]: 'asc' },
      take: 500 // Limit dropdown items
    });

    // Format as array of {value, label} pairs
    // Use the first text field as label, ID as value
    const labelField = scalarFields.find(f => f.type === 'String')?.name || 'name';

    const dropdown = items.map(item => ({
      value: item[idField],
      label: item[labelField] || `${resourceName} #${item[idField]}`
    }));

    return {
      data: dropdown,
      total: dropdown.length,
      resource: resourceName
    };
  }
}

// Create singleton instance
const dropdownController = new DropdownController();

module.exports = dropdownController;
