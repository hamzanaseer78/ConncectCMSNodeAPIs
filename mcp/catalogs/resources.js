const resources = require("../../src/config/resources");

function buildResourceCatalog() {
  return Object.entries(resources)
    .filter(([, config]) => !config.backendOnly)
    .map(([name, config]) => ({
      resource: name,
      label: config.tag,
      idField: config.id,
      tenantScoped: config.tenantScoped !== false,
      branchScoped: config.branchScoped === true,
      organizationScoped: config.organizationScoped === true,
      canCreate: !config.noCreate,
      canDelete: !config.noRemove,
      requiredOnCreate: config.requiredOnCreate || []
    }));
}

function buildDropdownCatalog() {
  const availableResources = Object.entries(resources)
    .filter(
      ([, config]) =>
        !config.backendOnly && !config.noCreate && config.tenantScoped !== false
    )
    .map(([name, config]) => ({
      resource: name,
      label: config.tag,
      filters: (config.dropdownFilters || []).map((def) => ({
        field: def.field,
        queryParams: def.params
      }))
    }));

  return {
    data: [
      {
        resource: "customer-addresses",
        label: "Customer Addresses",
        requiredQuery: ["customerId"],
        filters: [
          {
            field: "customerid",
            queryParams: ["customerId", "customerid"]
          }
        ]
      },
      ...availableResources
    ],
    total: availableResources.length + 1
  };
}

module.exports = {
  buildResourceCatalog,
  buildDropdownCatalog
};
