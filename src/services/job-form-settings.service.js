const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");
const { normalizeFormType, getDefaultJobFormFieldsByName } = require("../config/job-form-fields.registry");
const {
  JOB_FORM_LABEL_MAX_LENGTH,
  hasCustomLabelValue,
  parseSavedFieldsJson,
  mergeJobFormFields
} = require("../utils/job-form-fields");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function buildScope(auth, formType) {
  return {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid),
    formtype: normalizeFormType(formType)
  };
}

function formatSettingsResponse(scope, fields, row) {
  return {
    tenantid: scope.tenantid,
    branchid: scope.branchid,
    formType: scope.formtype,
    fields,
    lastUpdatedAt: row?.lastupdatedat ?? null
  };
}

function isSystemAdminUser(auth) {
  const raw = process.env.SYSTEM_ADMIN_USER_IDS || process.env.SYSTEM_ADMIN_USERID || "";
  const allowed = String(raw)
    .split(",")
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!allowed.length) {
    return auth?.isSystemAdmin === true || auth?.isSuperAdmin === true;
  }

  return allowed.includes(Number(auth?.userid));
}

class JobFormSettingsService {
  buildScope(auth, formType) {
    return buildScope(auth, formType);
  }

  async assertBranchInTenant(scope) {
    const branch = await prisma.branches.findFirst({
      where: { branchid: scope.branchid, tenantid: scope.tenantid },
      select: { branchid: true }
    });
    if (!branch) {
      throw clientError("Branch does not belong to your organization", 403);
    }
  }

  async ensureAdmin(auth) {
    await serviceContainer.getAuthService().ensureAdmin(auth.userid, auth.tenantid, auth.branchid);
  }

  async loadSettingsRow(scope) {
    return prisma.jobformsettings.findFirst({
      where: {
        tenantid: scope.tenantid,
        branchid: scope.branchid,
        formtype: scope.formtype
      }
    });
  }

  async getSettings(auth, formType = "admin") {
    const scope = this.buildScope(auth, formType);
    await this.assertBranchInTenant(scope);
    const row = await this.loadSettingsRow(scope);
    const saved = parseSavedFieldsJson(row?.fieldsjson);
    const fields = mergeJobFormFields(scope.formtype, saved);
    return formatSettingsResponse(scope, fields, row);
  }

  async getResolvedFields(auth, formType = "admin") {
    const settings = await this.getSettings(auth, formType);
    return settings.fields;
  }

  normalizeInputFieldLabel(field, defaultsByName) {
    const fieldName = String(field.fieldName);
    const def = defaultsByName.get(fieldName);
    const fallbackLabel = def?.label ?? fieldName;

    if (!hasCustomLabelValue(field.label) && !hasCustomLabelValue(field.displayName)) {
      return field;
    }

    const rawLabel = hasCustomLabelValue(field.label) ? field.label : field.displayName;
    const label = String(rawLabel).trim();
    if (!label) {
      throw clientError(`Display name for "${fallbackLabel}" cannot be blank`);
    }
    if (label.length > JOB_FORM_LABEL_MAX_LENGTH) {
      throw clientError(
        `Display name for "${fallbackLabel}" must be at most ${JOB_FORM_LABEL_MAX_LENGTH} characters`
      );
    }

    const { displayName: _displayName, ...rest } = field;
    return { ...rest, label };
  }

  validateInputFields(formType, inputFields = [], { allowHideableChanges = false } = {}) {
    if (!Array.isArray(inputFields) || !inputFields.length) {
      throw clientError("fields array is required");
    }

    const defaultsByName = getDefaultJobFormFieldsByName(formType);
    const unknown = inputFields
      .map((field) => String(field.fieldName))
      .filter((name) => !defaultsByName.has(name));

    if (unknown.length) {
      throw clientError(`Unknown field(s): ${unknown.join(", ")}`);
    }

    const normalizedInput = inputFields.map((field, index) =>
      this.normalizeInputFieldLabel(
        { ...field, sortNo: field.sortNo ?? index + 1 },
        defaultsByName
      )
    );

    const merged = mergeJobFormFields(formType, normalizedInput);

    merged.forEach((field) => {
      if (field.isMandatory && field.isShow !== true) {
        throw clientError(`Field "${field.label}" is mandatory and cannot be hidden`);
      }
      if (!field.isHideable && field.isShow !== true) {
        throw clientError(`Field "${field.label}" cannot be hidden`);
      }

      const def = defaultsByName.get(field.fieldName);
      if (!allowHideableChanges && def && field.isHideable !== (def.isHideable !== false)) {
        throw clientError(
          `Only system administrators can change hideable setting for "${field.label}"`
        );
      }
    });

    return merged;
  }

  async saveSettings(auth, body = {}) {
    await this.ensureAdmin(auth);
    const formType = normalizeFormType(body.formType ?? body.formtype);
    const scope = this.buildScope(auth, formType);
    await this.assertBranchInTenant(scope);

    const allowHideableChanges = isSystemAdminUser(auth) && body.allowHideableChanges === true;
    const rawFields = body.fields || body.fieldSettings || [];
    const inputFields = allowHideableChanges
      ? rawFields
      : rawFields.map(({ isHideable, ...rest }) => rest);
    const merged = this.validateInputFields(formType, inputFields, {
      allowHideableChanges
    });

    const now = utcNow();
    const uid = Number(auth.userid);
    const existing = await this.loadSettingsRow(scope);
    const fieldsjson = JSON.stringify(merged);

    if (existing) {
      await prisma.jobformsettings.update({
        where: { recno: existing.recno },
        data: {
          fieldsjson,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    } else {
      await prisma.jobformsettings.create({
        data: {
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          formtype: scope.formtype,
          fieldsjson,
          createdby: uid,
          createdat: now,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    }

    const saved = await this.loadSettingsRow(scope);
    return {
      message: "Job form settings saved",
      settings: formatSettingsResponse(scope, merged, saved)
    };
  }
}

module.exports = new JobFormSettingsService();
module.exports.isSystemAdminUser = isSystemAdminUser;
