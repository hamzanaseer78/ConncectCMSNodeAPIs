const fs = require("fs");
const path = require("path");

const DISPLAY_FIELDS = Object.freeze(["name", "title", "label", "displayname"]);
const SECRET_FIELDS = Object.freeze(["password", "apikeycipher", "resettoken", "signuptoken", "token"]);

function parseModelBlock(name, body) {
  const fields = [];
  const relations = [];
  let idField = null;
  String(body || "").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) return;
    const idMatch = trimmed.match(/^(\w+)\s+\w+.*@id\b/);
    if (idMatch) idField = idMatch[1];
    const relation = trimmed.match(/^(\w+)\s+(\w+)\??\s+@relation\((.*)\)/);
    if (relation) {
      const attrs = relation[3];
      const source = attrs.match(/fields:\s*\[([^\]]+)\]/);
      const target = attrs.match(/references:\s*\[([^\]]+)\]/);
      if (source && target) {
        relations.push({
          sourceTable: name,
          sourceColumns: source[1].split(",").map((part) => part.trim()),
          targetTable: relation[2],
          targetColumns: target[1].split(",").map((part) => part.trim())
        });
      }
      return;
    }
    const scalar = trimmed.match(/^(\w+)\s+(\w+)/);
    if (scalar) {
      fields.push({ name: scalar[1], type: scalar[2] });
    }
  });
  const names = new Set(fields.map((field) => field.name));
  const displayFields = DISPLAY_FIELDS.filter((field) => names.has(field));
  if (!displayFields.length && names.has("code")) displayFields.push("code");
  return {
    name,
    idField: idField || (names.has("recno") ? "recno" : names.has("userid") ? "userid" : fields[0]?.name),
    fields,
    relations,
    displayFields,
    hasTenantid: names.has("tenantid"),
    hasBranchid: names.has("branchid"),
    secretFields: SECRET_FIELDS.filter((field) => names.has(field))
  };
}

function parsePrismaSchema(source) {
  const models = [];
  const matcher = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = matcher.exec(String(source || "")))) {
    models.push(parseModelBlock(match[1], match[2]));
  }
  return models;
}

function loadPrismaRelations(schemaPath) {
  const file = schemaPath || path.join(__dirname, "../../prisma/schema.prisma");
  let source = "";
  try {
    source = fs.readFileSync(file, "utf8");
  } catch {
    source = "";
  }
  const models = parsePrismaSchema(source);
  const byName = new Map(models.map((model) => [model.name, model]));
  const relations = [];
  models.forEach((model) => {
    model.relations.forEach((relation) => {
      if (relation.sourceColumns.length !== 1 || relation.targetColumns.length !== 1) return;
      if (relation.sourceColumns[0] === "tenantid") return;
      relations.push({
        ...relation,
        target: byName.get(relation.targetTable) || null
      });
    });
  });
  return { models, byName, relations };
}

const CATALOG = loadPrismaRelations();

function relationsForColumn(column, sourceTable) {
  const name = String(column || "");
  const matches = CATALOG.relations.filter((relation) => relation.sourceColumns[0] === name);
  if (sourceTable) {
    const scoped = matches.filter((relation) => relation.sourceTable === sourceTable);
    if (scoped.length) return scoped;
  }
  return matches;
}

function inferSourceTable(columns) {
  const names = new Set((columns || []).map((column) => String(column).toLowerCase()));
  let best = null;
  let bestScore = 0;
  CATALOG.models.forEach((model) => {
    const score = model.fields.reduce((sum, field) => sum + (names.has(field.name) ? 1 : 0), 0);
    if (score > bestScore) {
      best = model.name;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : null;
}

module.exports = {
  DISPLAY_FIELDS,
  parsePrismaSchema,
  parseModelBlock,
  loadPrismaRelations,
  CATALOG,
  relationsForColumn,
  inferSourceTable
};
