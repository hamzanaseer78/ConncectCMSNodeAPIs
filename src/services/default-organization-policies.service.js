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
 * @returns {Promise<{ admin: object, manager: object, technician: object, policies: object[] }>}
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
    policies: DEFAULT_ORGANIZATION_POLICY_TEMPLATES.map((template) => createdPolicies[template.key])
  };
}

module.exports = {
  buildUserRightsRows,
  loadAccessibleScreens,
  createDefaultOrganizationPolicies
};
