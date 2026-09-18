const {
  getDefaultJobFormFields,
  getDefaultJobFormFieldsByName,
  NON_HIDEABLE_FIELD_NAMES
} = require("../config/job-form-fields.registry");

const JOB_FORM_LABEL_MAX_LENGTH = 120;

function hasCustomLabelValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function resolveFieldLabels(field, def = {}) {
  const defaultLabel = String(def.label ?? def.fieldName ?? field.fieldName ?? "");
  const rawCustom = field.label ?? field.displayName;

  if (!hasCustomLabelValue(rawCustom)) {
    return { label: defaultLabel, defaultLabel };
  }

  return {
    label: String(rawCustom).trim(),
    defaultLabel
  };
}

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

function normalizeField(field, index, defaultsByName, options = {}) {
  const def = defaultsByName.get(String(field.fieldName)) || {};
  const savedField = options.savedField ?? null;
  const { defaultLabel: _savedDefaultLabel, displayName: _displayName, ...fieldSettings } = field || {};
  const merged = { ...def, ...fieldSettings };
  const isHideable = NON_HIDEABLE_FIELD_NAMES.has(merged.fieldName)
    ? false
    : def.isHideable !== false;
  const labelSource =
    savedField &&
    (hasCustomLabelValue(savedField.label) || hasCustomLabelValue(savedField.displayName))
      ? savedField
      : {};
  const { label, defaultLabel } = resolveFieldLabels(labelSource, def);

  const row = {
    fieldName: String(merged.fieldName),
    label,
    defaultLabel,
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
    return normalizeField(
      saved ? { ...def, ...saved, formType } : { ...def, formType },
      index,
      defaultsByName,
      { savedField: saved || null }
    );
  });

  return merged.sort((left, right) => left.sortNo - right.sortNo);
}

module.exports = {
  JOB_FORM_LABEL_MAX_LENGTH,
  hasCustomLabelValue,
  resolveFieldLabels,
  parseSavedFieldsJson,
  normalizeField,
  mergeJobFormFields
};
