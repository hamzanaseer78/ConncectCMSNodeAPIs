const {
  getDefaultJobFormFields,
  getDefaultJobFormFieldsByName,
  NON_HIDEABLE_FIELD_NAMES
} = require("../config/job-form-fields.registry");

function parseSavedFieldsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.fields)) return parsed.fields;
    return [];
  } catch {
    return [];
  }
}

function normalizeField(field, index, defaultsByName) {
  const def = defaultsByName.get(String(field.fieldName)) || {};
  const merged = { ...def, ...field };
  const isHideable = NON_HIDEABLE_FIELD_NAMES.has(merged.fieldName)
    ? false
    : def.isHideable !== false;

  const row = {
    fieldName: String(merged.fieldName),
    label: merged.label ?? merged.fieldName,
    section: merged.section ?? "customer",
    sortNo: Number.isFinite(Number(merged.sortNo)) ? Number(merged.sortNo) : index + 1,
    isMandatory: merged.isMandatory === true,
    isShow: merged.isShow !== false,
    isHideable,
    formType: merged.formType
  };

  if (!row.isHideable) {
    row.isShow = true;
  }
  if (row.isMandatory) {
    row.isShow = true;
  }

  return row;
}

function mergeJobFormFields(formType, savedFields = []) {
  const defaults = getDefaultJobFormFields(formType);
  const defaultsByName = getDefaultJobFormFieldsByName(formType);
  const savedByName = new Map(
    (Array.isArray(savedFields) ? savedFields : [])
      .filter((field) => field && field.fieldName)
      .map((field) => [String(field.fieldName), field])
  );

  const merged = defaults.map((def, index) => {
    const saved = savedByName.get(def.fieldName);
    return normalizeField(saved ? { ...def, ...saved, formType } : { ...def, formType }, index, defaultsByName);
  });

  return merged.sort((left, right) => left.sortNo - right.sortNo);
}

module.exports = {
  parseSavedFieldsJson,
  normalizeField,
  mergeJobFormFields
};
