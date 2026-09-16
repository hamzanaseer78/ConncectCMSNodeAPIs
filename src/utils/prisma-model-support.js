/**
 * Helpers for optional Prisma relations when migrations/client generation lag behind code deploy.
 */

function getModelFields(prisma, modelName) {
  return prisma?._runtimeDataModel?.models?.[modelName]?.fields ?? [];
}

function modelHasRelation(prisma, modelName, relationName) {
  return getModelFields(prisma, modelName).some(
    (field) => field.name === relationName && field.kind === "object"
  );
}

function modelHasScalarField(prisma, modelName, fieldName) {
  return getModelFields(prisma, modelName).some(
    (field) => field.name === fieldName && field.kind === "scalar"
  );
}

function modelDelegateExists(prisma, delegateName) {
  return Boolean(prisma?.[delegateName]);
}

module.exports = {
  getModelFields,
  modelHasRelation,
  modelHasScalarField,
  modelDelegateExists
};
