const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");
const {
  parseOptionalText,
  parseOptionalBoolean,
  buildResolvedQuotationFields,
  applyQuotationTextDefaults
} = require("../utils/job-quotation-text");

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function buildScope(auth) {
  return {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };
}

function formatSettingsRow(row) {
  return {
    tenantid: row?.tenantid ?? null,
    branchid: row?.branchid ?? null,
    defaultNotes: row?.defaultnotes ?? null,
    defaultTermsAndConditions: row?.defaulttermsandconditions ?? null,
    enableLineItemTax: row?.enablelineitemtax === true,
    automaticCpairReceiving: row?.automaticcpairreceiving === true,
    useERPProducts: row?.useerpproducts === true,
    lastUpdatedAt: row?.lastupdatedat ?? null
  };
}

class JobQuotationSettingsService {
  buildScope(auth) {
    return buildScope(auth);
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
    return prisma.jobquotationsettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid }
    });
  }

  async getSettings(auth) {
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);
    const row = await this.loadSettingsRow(scope);
    return formatSettingsRow(row);
  }

  async saveSettings(auth, body = {}) {
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);

    const defaultNotes = parseOptionalText(
      body.defaultNotes ?? body.defaultnotes ?? body.notes
    );
    const defaultTermsAndConditions = parseOptionalText(
      body.defaultTermsAndConditions ??
        body.defaulttermsandconditions ??
        body.termsAndConditions ??
        body.terms
    );
    const enableLineItemTax = parseOptionalBoolean(
      body.enableLineItemTax ?? body.enablelineitemtax,
      "enableLineItemTax"
    );
    const automaticCpairReceiving = parseOptionalBoolean(
      body.automaticCpairReceiving ?? body.automaticcpairreceiving,
      "automaticCpairReceiving"
    );
    const useERPProducts = parseOptionalBoolean(
      body.useERPProducts ?? body.useerpproducts,
      "useERPProducts"
    );

    if (
      defaultNotes === undefined &&
      defaultTermsAndConditions === undefined &&
      enableLineItemTax === undefined &&
      automaticCpairReceiving === undefined &&
      useERPProducts === undefined
    ) {
      throw clientError(
        "At least one of defaultNotes, defaultTermsAndConditions, enableLineItemTax, automaticCpairReceiving, or useERPProducts is required"
      );
    }

    const now = utcNow();
    const uid = Number(auth.userid);
    const existing = await this.loadSettingsRow(scope);

    const data = {
      lastupdatedby: uid,
      lastupdatedat: now
    };
    if (defaultNotes !== undefined) {
      data.defaultnotes = defaultNotes;
    }
    if (defaultTermsAndConditions !== undefined) {
      data.defaulttermsandconditions = defaultTermsAndConditions;
    }
    if (enableLineItemTax !== undefined) {
      data.enablelineitemtax = enableLineItemTax;
    }
    if (automaticCpairReceiving !== undefined) {
      data.automaticcpairreceiving = automaticCpairReceiving;
    }
    if (useERPProducts !== undefined) {
      data.useerpproducts = useERPProducts;
    }

    if (existing) {
      await prisma.jobquotationsettings.update({
        where: { recno: existing.recno },
        data
      });
    } else {
      await prisma.jobquotationsettings.create({
        data: {
          ...scope,
          defaultnotes: defaultNotes ?? null,
          defaulttermsandconditions: defaultTermsAndConditions ?? null,
          enablelineitemtax: enableLineItemTax ?? false,
          automaticcpairreceiving: automaticCpairReceiving ?? false,
          useerpproducts: useERPProducts ?? false,
          createdby: uid,
          createdat: now,
          ...data
        }
      });
    }

    const saved = await this.loadSettingsRow(scope);
    return {
      message: "Job quotation settings saved",
      settings: formatSettingsRow(saved)
    };
  }

  applyQuotationTextDefaults(payload, settingsRow) {
    return applyQuotationTextDefaults(payload, settingsRow);
  }

  buildResolvedQuotationFields(job, settingsRow) {
    return buildResolvedQuotationFields(job, settingsRow);
  }
}

module.exports = new JobQuotationSettingsService();
