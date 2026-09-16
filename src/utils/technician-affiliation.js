const AFFILIATIONS = Object.freeze(["in_house", "third_party"]);

const ALIASES = Object.freeze({
  inhouse: "in_house",
  "in-house": "in_house",
  in_house: "in_house",
  thirdparty: "third_party",
  "third-party": "third_party",
  third_party: "third_party",
  external: "third_party",
  contractor: "third_party"
});

function normalizeTechnicianAffiliation(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      const err = new Error(
        `technicianAffiliation is required for technicians (${AFFILIATIONS.join(", ")})`
      );
      err.status = 400;
      throw err;
    }
    return null;
  }

  const raw = String(value).trim().toLowerCase();
  const mapped = ALIASES[raw] || raw;

  if (!AFFILIATIONS.includes(mapped)) {
    const err = new Error(
      `technicianAffiliation must be one of: ${AFFILIATIONS.join(", ")}`
    );
    err.status = 400;
    throw err;
  }

  return mapped;
}

function trimCompanyName(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function resolveAffiliationFromInput(input = {}) {
  if (input.technicianAffiliation !== undefined) return input.technicianAffiliation;
  if (input.technicianaffiliation !== undefined) return input.technicianaffiliation;
  if (input.technicianType !== undefined) return input.technicianType;
  if (input.techniciantype !== undefined) return input.techniciantype;
  if (input.affiliation !== undefined) return input.affiliation;
  return undefined;
}

function resolveCompanyNameFromInput(input = {}) {
  if (input.companyName !== undefined) return input.companyName;
  if (input.companyname !== undefined) return input.companyname;
  if (input.thirdPartyCompany !== undefined) return input.thirdPartyCompany;
  if (input.thirdpartycompany !== undefined) return input.thirdpartycompany;
  return undefined;
}

/**
 * Build users.technicianaffiliation / users.companyname from API body.
 * Required when usertype is technician (create); validated on explicit updates.
 */
function applyTechnicianAffiliationFields(input = {}, usertype, options = {}) {
  const { mode = "create" } = options;
  const isTechnician = usertype === "technician";

  const affiliationRaw = resolveAffiliationFromInput(input);
  const companyRaw = resolveCompanyNameFromInput(input);
  const hasAffiliationInput = affiliationRaw !== undefined;
  const hasCompanyInput = companyRaw !== undefined;

  if (!isTechnician) {
    const usertypeExplicit =
      input.usertype !== undefined ||
      input.userType !== undefined ||
      input.type !== undefined;
    if (usertypeExplicit || hasAffiliationInput || hasCompanyInput) {
      return {
        technicianaffiliation: null,
        companyname: null
      };
    }
    return {};
  }

  const affiliation = normalizeTechnicianAffiliation(affiliationRaw, {
    required: mode === "create" || hasAffiliationInput
  });

  let companyname = hasCompanyInput ? trimCompanyName(companyRaw) : undefined;

  if (affiliation === "third_party") {
    if (companyname === undefined && mode === "create") {
      const err = new Error("companyName is required when technicianAffiliation is third_party");
      err.status = 400;
      throw err;
    }
    if (companyname === null || companyname === undefined) {
      if (hasAffiliationInput || hasCompanyInput || mode === "create") {
        const err = new Error("companyName is required when technicianAffiliation is third_party");
        err.status = 400;
        throw err;
      }
    }
  } else if (affiliation === "in_house") {
    companyname = null;
  }

  const data = {};
  if (affiliation != null) {
    data.technicianaffiliation = affiliation;
  }
  if (companyname !== undefined) {
    data.companyname = companyname;
  }

  return data;
}

function formatTechnicianAffiliationFields(user) {
  if (!user) {
    return {
      technicianAffiliation: null,
      companyName: null
    };
  }
  return {
    technicianAffiliation: user.technicianaffiliation ?? null,
    companyName: user.companyname ?? null
  };
}

module.exports = {
  AFFILIATIONS,
  normalizeTechnicianAffiliation,
  applyTechnicianAffiliationFields,
  formatTechnicianAffiliationFields
};
