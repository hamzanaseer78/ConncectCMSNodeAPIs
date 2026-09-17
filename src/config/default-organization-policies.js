const resources = require("./resources");

/**
 * Default policies seeded for every new organization.
 * Extend this list to add more role templates later.
 */
const DEFAULT_ORGANIZATION_POLICY_TEMPLATES = Object.freeze([
  {
    key: "admin",
    description: "Admin",
    isDefaultPolicy: true
  },
  {
    key: "manager",
    description: "Manager",
    isDefaultPolicy: false
  },
  {
    key: "technician",
    description: "Technician",
    isDefaultPolicy: false
  },
  {
    key: "distributor",
    description: "Distributor",
    isDefaultPolicy: false
  }
]);

/** Resource keys excluded from the Manager policy. */
const MANAGER_EXCLUDED_RESOURCE_KEYS = Object.freeze([
  "users",
  "branches",
  "screens"
]);

/** Screen / group labels excluded from the Manager policy. */
const MANAGER_EXCLUDED_LABELS = Object.freeze([
  "user management",
  "screen rights",
  "users",
  "branches"
]);

/** Job screen identifiers (view-only for Technician). */
const TECHNICIAN_JOBS_IDENTIFIERS = Object.freeze(["job", "jobs"]);

/** Job definition setup resources (view-only for Technician). */
const TECHNICIAN_JOB_DEFINITION_RESOURCE_KEYS = Object.freeze([
  "jobgroups",
  "jobcategories",
  "jobsubcategories",
  "jobtypes",
  "jobstauses",
  "jobsources",
  "deliverytypes"
]);

const TECHNICIAN_JOB_DEFINITION_LABELS = Object.freeze([
  "job definitions",
  "job definition"
]);

function normalizeIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function collectScreenIdentifiers(screen = {}) {
  return [screen.screenname, screen.controllername, screen.screengroup]
    .map(normalizeIdentifier)
    .filter(Boolean);
}

function collectResourceIdentifiers(resourceKey) {
  const config = resources[resourceKey] || {};
  return [resourceKey, config.tag, ...(config.screenNames || [])]
    .map(normalizeIdentifier)
    .filter(Boolean);
}

function identifiersMatch(screenIdentifiers, candidates) {
  const normalizedCandidates = candidates.map(normalizeIdentifier).filter(Boolean);
  return screenIdentifiers.some((identifier) =>
    normalizedCandidates.some(
      (candidate) =>
        identifier === candidate ||
        identifier.includes(candidate) ||
        candidate.includes(identifier)
    )
  );
}

function isManagerExcludedScreen(screen) {
  const screenIdentifiers = collectScreenIdentifiers(screen);

  if (identifiersMatch(screenIdentifiers, MANAGER_EXCLUDED_LABELS)) {
    return true;
  }

  return MANAGER_EXCLUDED_RESOURCE_KEYS.some((resourceKey) =>
    identifiersMatch(screenIdentifiers, collectResourceIdentifiers(resourceKey))
  );
}

function isTechnicianJobsScreen(screen) {
  const screenIdentifiers = collectScreenIdentifiers(screen);
  return screenIdentifiers.some((identifier) =>
    TECHNICIAN_JOBS_IDENTIFIERS.includes(identifier)
  );
}

function isTechnicianJobDefinitionsScreen(screen) {
  const screenIdentifiers = collectScreenIdentifiers(screen);

  if (identifiersMatch(screenIdentifiers, TECHNICIAN_JOB_DEFINITION_LABELS)) {
    return true;
  }

  return TECHNICIAN_JOB_DEFINITION_RESOURCE_KEYS.some((resourceKey) =>
    identifiersMatch(screenIdentifiers, collectResourceIdentifiers(resourceKey))
  );
}

function isTechnicianAllowedScreen(screen) {
  return isTechnicianJobsScreen(screen) || isTechnicianJobDefinitionsScreen(screen);
}

function isDistributorExcludedScreen(screen) {
  return isManagerExcludedScreen(screen);
}

/**
 * Resolve userrights action flags for a screen under a default org policy template.
 * @param {"admin"|"manager"|"technician"|"distributor"} templateKey
 */
function resolveDefaultPolicyRights(templateKey, screen) {
  if (templateKey === "admin") {
    return {
      viewscreen: true,
      addscreen: true,
      updatescreen: true,
      deletescreen: true,
      others: true
    };
  }

  if (templateKey === "manager") {
    if (isManagerExcludedScreen(screen)) {
      return {
        viewscreen: false,
        addscreen: false,
        updatescreen: false,
        deletescreen: false,
        others: false
      };
    }

    return {
      viewscreen: true,
      addscreen: true,
      updatescreen: true,
      deletescreen: true,
      others: true
    };
  }

  if (templateKey === "technician") {
    const viewOnly = isTechnicianAllowedScreen(screen);
    return {
      viewscreen: viewOnly,
      addscreen: false,
      updatescreen: false,
      deletescreen: false,
      others: false
    };
  }

  if (templateKey === "distributor") {
    if (isDistributorExcludedScreen(screen)) {
      return {
        viewscreen: false,
        addscreen: false,
        updatescreen: false,
        deletescreen: false,
        others: false
      };
    }

    if (isTechnicianJobsScreen(screen)) {
      return {
        viewscreen: true,
        addscreen: true,
        updatescreen: true,
        deletescreen: false,
        others: false
      };
    }

    const viewOnly = isTechnicianJobDefinitionsScreen(screen);
    return {
      viewscreen: viewOnly,
      addscreen: false,
      updatescreen: false,
      deletescreen: false,
      others: false
    };
  }

  throw new Error(`Unknown default policy template: ${templateKey}`);
}

module.exports = {
  DEFAULT_ORGANIZATION_POLICY_TEMPLATES,
  MANAGER_EXCLUDED_RESOURCE_KEYS,
  MANAGER_EXCLUDED_LABELS,
  TECHNICIAN_JOBS_IDENTIFIERS,
  TECHNICIAN_JOB_DEFINITION_RESOURCE_KEYS,
  normalizeIdentifier,
  collectScreenIdentifiers,
  isManagerExcludedScreen,
  isTechnicianJobsScreen,
  isTechnicianJobDefinitionsScreen,
  isTechnicianAllowedScreen,
  isDistributorExcludedScreen,
  resolveDefaultPolicyRights
};
