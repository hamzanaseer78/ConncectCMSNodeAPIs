/**
 * Duplicate rules for lookup / definition resources (tenant-scoped CRUD).
 * Names are compared case-insensitively after trim.
 */
const DEFINITION_UNIQUENESS_RULES = Object.freeze({
  countries: { nameField: "name", scopeFields: ["tenantid"], label: "country" },
  cities: { nameField: "name", scopeFields: ["tenantid", "countryid"], label: "city" },
  areas: { nameField: "name", scopeFields: ["tenantid", "cityid"], label: "area" },
  units: {
    nameField: "name",
    scopeFields: ["tenantid"],
    label: "unit",
    extraFields: [{ field: "symbol", label: "unit symbol" }]
  },
  brands: { nameField: "name", scopeFields: ["tenantid"], label: "brand" },
  jobtypes: { nameField: "name", scopeFields: ["tenantid"], label: "job type" },
  jobsources: { nameField: "name", scopeFields: ["tenantid"], label: "job source" },
  deliverytypes: { nameField: "name", scopeFields: ["tenantid"], label: "delivery type" },
  expensetypes: { nameField: "name", scopeFields: ["tenantid"], label: "expense type" },
  jobgroups: { nameField: "name", scopeFields: ["tenantid", "branchid"], label: "job group" },
  jobcategories: {
    nameField: "name",
    scopeFields: ["tenantid", "branchid", "groupid"],
    label: "job category"
  },
  jobsubcategories: {
    nameField: "name",
    scopeFields: ["tenantid", "branchid", "categoryid"],
    label: "job subcategory"
  },
  jobstauses: {
    nameField: "title",
    scopeFields: ["tenantid"],
    label: "job status"
  }
});

function getDefinitionUniquenessRule(resourceName) {
  return DEFINITION_UNIQUENESS_RULES[resourceName] || null;
}

function hasDefinitionUniquenessRules(resourceName) {
  return Boolean(getDefinitionUniquenessRule(resourceName));
}

module.exports = {
  DEFINITION_UNIQUENESS_RULES,
  getDefinitionUniquenessRule,
  hasDefinitionUniquenessRules
};
