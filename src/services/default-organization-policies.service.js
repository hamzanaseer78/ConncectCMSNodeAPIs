const { utcNow } = require("../utils/date");
const { syncPostgresSequence } = require("../utils/postgres-sequence");
const {
  DEFAULT_ORGANIZATION_POLICY_TEMPLATES,
  resolveDefaultPolicyRights
} = require("../config/default-organization-policies");

function buildUserRightsRows({
  screens,
  policy,
  tenantid,
  branchid,
  templateKey,
  createdBy
}) {
  const now = utcNow();
  const createdby = createdBy != null ? Number(createdBy) : null;

  return screens.map((screen) => ({
    screenid: screen.screenid,
    policyid: policy.recno,
    tenantid,
    branchid,
    ...resolveDefaultPolicyRights(templateKey, screen),
    createdby,
    createdat: now
  }));
}

async function loadAccessibleScreens(tx) {
  return tx.screens.findMany({
    where: {
      OR: [{ accessible: true }, { accessible: null }]
    },
    select: {
      screenid: true,
      screenname: true,
      controllername: true,
      screengroup: true
    },
    orderBy: { screenid: "asc" }
  });
}

/**
 * Create Admin, Manager, and Technician policies with default rights for a new organization.
 * Must run inside an existing Prisma transaction.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ tenantid: number, branchid: number, createdBy: number }} context
 * @returns {Promise<{ admin: object, manager: object, technician: object, distributor: object, policies: object[] }>}
 */
async function createDefaultOrganizationPolicies(tx, context) {
  const tenantid = Number(context.tenantid);
  const branchid = Number(context.branchid);
  const createdBy = Number(context.createdBy);
  const now = utcNow();

  const screens = await loadAccessibleScreens(tx);
  const createdPolicies = {};

  for (const template of DEFAULT_ORGANIZATION_POLICY_TEMPLATES) {
    const policy = await tx.policies.create({
      data: {
        tenantid,
        description: template.description,
        isdefaultpolicy: template.isDefaultPolicy === true,
        createdby: createdBy,
        createdat: now
      }
    });
    createdPolicies[template.key] = policy;
  }

  const rightsData = DEFAULT_ORGANIZATION_POLICY_TEMPLATES.flatMap((template) =>
    buildUserRightsRows({
      screens,
      policy: createdPolicies[template.key],
      tenantid,
      branchid,
      templateKey: template.key,
      createdBy
    })
  );

  if (rightsData.length) {
    await syncPostgresSequence(tx, "userrights", "recno");
    await tx.userrights.createMany({ data: rightsData });
  }

  return {
    admin: createdPolicies.admin,
    manager: createdPolicies.manager,
    technician: createdPolicies.technician,
    distributor: createdPolicies.distributor,
    policies: DEFAULT_ORGANIZATION_POLICY_TEMPLATES.map((template) => createdPolicies[template.key])
  };
}

async function findOrganizationPolicyByDescription(client, tenantid, description) {
  return client.policies.findFirst({
    where: {
      tenantid: Number(tenantid),
      description: { equals: description, mode: "insensitive" }
    },
    orderBy: { recno: "asc" }
  });
}

/**
 * Ensure a default policy template exists for an organization (backfill for orgs created before Distributor role).
 */
async function ensureOrganizationPolicyTemplate(client, context, templateKey) {
  const template = DEFAULT_ORGANIZATION_POLICY_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!template) {
    throw new Error(`Unknown default policy template: ${templateKey}`);
  }

  const tenantid = Number(context.tenantid);
  const branchid = Number(context.branchid);
  const createdBy = Number(context.createdBy);
  const existing = await findOrganizationPolicyByDescription(client, tenantid, template.description);
  if (existing) {
    return existing;
  }

  const now = utcNow();
  const screens = await loadAccessibleScreens(client);
  const policy = await client.policies.create({
    data: {
      tenantid,
      description: template.description,
      isdefaultpolicy: template.isDefaultPolicy === true,
      createdby: createdBy,
      createdat: now
    }
  });

  const rightsData = buildUserRightsRows({
    screens,
    policy,
    tenantid,
    branchid,
    templateKey,
    createdBy
  });

  if (rightsData.length) {
    await syncPostgresSequence(client, "userrights", "recno");
    await client.userrights.createMany({ data: rightsData });
  }

  return policy;
}

module.exports = {
  buildUserRightsRows,
  loadAccessibleScreens,
  createDefaultOrganizationPolicies,
  ensureOrganizationPolicyTemplate,
  findOrganizationPolicyByDescription
};
