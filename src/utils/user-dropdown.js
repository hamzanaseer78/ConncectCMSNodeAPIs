const { formatTechnicianAffiliationFields } = require("./technician-affiliation");
const { formatManagerFields } = require("./user-manager");
const { normalizeUserType } = require("./user-type");

function pickQueryText(query = {}, ...keys) {
  for (const key of keys) {
    const value = query[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function applyUserDropdownFilters(where, query = {}) {
  const applied = {};
  const userTypeRaw = pickQueryText(query, "userType", "usertype", "type");

  if (userTypeRaw) {
    applied.usertype = normalizeUserType(userTypeRaw, { required: true });
    where.usertype = applied.usertype;
  }

  return applied;
}

function formatUserDropdownRow(item, { idField = "userid", labelField = "name" } = {}) {
  const value = item[idField];
  const label = item[labelField] || `users #${value}`;
  const userType = item.usertype ?? null;

  return {
    value,
    label,
    email: item.email ?? null,
    usertype: userType,
    userType,
    ...formatTechnicianAffiliationFields(item),
    ...formatManagerFields(item)
  };
}

module.exports = {
  pickQueryText,
  applyUserDropdownFilters,
  formatUserDropdownRow
};
