const { formatTechnicianAffiliationFields } = require("./technician-affiliation");
const { formatManagerFields } = require("./user-manager");

function formatUserDropdownRow(item, { idField = "userid", labelField = "name" } = {}) {
  const value = item[idField];
  const label = item[labelField] || `users #${value}`;

  return {
    value,
    label,
    email: item.email ?? null,
    usertype: item.usertype ?? null,
    ...formatTechnicianAffiliationFields(item),
    ...formatManagerFields(item)
  };
}

module.exports = {
  formatUserDropdownRow
};
