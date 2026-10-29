const { extractMention, isReservedName } = require("../services/entity-resolution");

function cleanMention(value) {
  const name = String(value || "").replace(/[?.!,]+$/g, "").replace(/['’]s$/i, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) return null;
  if (typeof isReservedName === "function" && isReservedName(name)) return null;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) return name.replace(/[^\w .'-]/g, "").trim() || null;
  return name;
}

const TYPE_LABEL = Object.freeze({
  customer: "Customer",
  technician: "Technician",
  manager: "Manager",
  admin: "Admin",
  user: "User",
  status: "Status",
  branch: "Branch"
});

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const left = String(a);
  const right = String(b);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost
      );
    }
  }
  return grid[left.length][right.length];
}

function matchKind(displayName, query) {
  const name = normalizeName(displayName);
  const q = normalizeName(query);
  if (!name || !q) return null;
  if (name === q) return "exact";
  const parts = name.split(" ");
  if (parts.includes(q) || parts.some((part) => part.startsWith(q) && q.length >= 3)) return "partial";
  if (name.includes(q) || (q.length >= 5 && q.includes(name))) return "partial";
  const distance = levenshtein(name, q);
  const limit = q.length >= 8 ? 2 : 1;
  if (q.length >= 4 && distance <= limit) return "fuzzy";
  return null;
}

function userTypeLabel(usertype) {
  const value = String(usertype || "").toLowerCase();
  if (value === "technician") return "technician";
  if (value === "manager") return "manager";
  if (value === "admin") return "admin";
  return "user";
}

function searchEntities(snapshot, query, hintedType) {
  const q = cleanMention(query) || String(query || "").trim();
  if (!q) return [];
  const entities = Array.isArray(snapshot?.entities) ? snapshot.entities : [];
  const matches = [];
  entities.forEach((entity) => {
    const kind = matchKind(entity.displayName, q);
    if (!kind) return;
    if (hintedType && entity.entityType !== hintedType && !(hintedType === "user" && ["technician", "manager", "admin", "user"].includes(entity.entityType))) {
      return;
    }
    matches.push({ ...entity, match: kind });
  });
  matches.sort((a, b) => {
    const rank = { exact: 0, partial: 1, fuzzy: 2 };
    return (rank[a.match] - rank[b.match]) || String(a.displayName).localeCompare(String(b.displayName));
  });
  return matches;
}

function formatCandidate(entity) {
  const label = TYPE_LABEL[entity.entityType] || entity.entityType;
  return `${entity.displayName} (${label})`;
}

function resolveChoice(message, pending) {
  const list = Array.isArray(pending) ? pending : [];
  if (!list.length) return null;
  const text = String(message || "").trim().toLowerCase();
  if (!text) return null;
  if (list.length === 1 && /^(yes|that one|the first|first one)$/i.test(text)) return list[0];
  const numbered = text.match(/^(\d+)\b/);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (list[index]) return list[index];
  }
  const byType = list.filter((item) => text.includes(String(item.entityType || "").toLowerCase()));
  if (byType.length === 1) return byType[0];
  const byName = list.filter((item) => normalizeName(item.displayName) && text.includes(normalizeName(item.displayName)));
  if (byName.length === 1) return byName[0];
  return null;
}

function decideMatch({ query, hintedType, preferredType, candidates, contextType }) {
  const name = cleanMention(query) || String(query || "").trim();
  const all = Array.isArray(candidates) ? candidates : [];
  const hinted = hintedType || preferredType || contextType || null;
  let pool = all.filter((item) => item.match === "exact");
  if (hinted) {
    const typed = pool.filter((item) => item.entityType === hinted);
    if (typed.length) pool = typed;
  }
  if (!pool.length) {
    pool = all.filter((item) => item.match === "partial");
    if (hinted) {
      const typed = pool.filter((item) => item.entityType === hinted);
      if (typed.length === 1) pool = typed;
      else if (typed.length) pool = typed;
    }
  }

  if (pool.length === 1 && (pool[0].match === "exact" || (hinted && pool[0].entityType === hinted) || all.filter((item) => item.match !== "fuzzy").length === 1)) {
    const match = pool[0];
    return {
      outcome: "resolved",
      requestedName: name,
      subject: {
        type: match.entityType,
        id: Number(match.entityId),
        name: match.displayName
      },
      message: null,
      choices: []
    };
  }

  const clarifyPool = (pool.length > 1 ? pool : all.filter((item) => item.match !== "fuzzy" || pool.length === 0)).slice(0, 8);
  const useful = clarifyPool.length ? clarifyPool : all.slice(0, 8);
  if (!useful.length) {
    return {
      outcome: "none",
      requestedName: name,
      subject: null,
      message: `I could not find "${name}" in the authorized records.`,
      choices: []
    };
  }
  if (useful.length === 1 && useful[0].match !== "fuzzy") {
    const match = useful[0];
    return {
      outcome: "resolved",
      requestedName: name,
      subject: {
        type: match.entityType,
        id: Number(match.entityId),
        name: match.displayName
      },
      message: null,
      choices: []
    };
  }
  const names = useful.map(formatCandidate).join(", ").replace(/, ([^,]*)$/, ", or $1");
  return {
    outcome: "clarify",
    requestedName: name,
    subject: null,
    message: useful.length === 2
      ? `I found two matching people. Do you mean ${formatCandidate(useful[0])} or ${formatCandidate(useful[1])}?`
      : `Which ${name} do you mean: ${names}?`,
    choices: useful
  };
}

function entitySqlFilter(subject) {
  if (!subject?.id) return null;
  if (subject.type === "customer") return { column: "customerid", value: subject.id };
  if (["technician", "manager", "admin", "user"].includes(subject.type)) {
    return { column: "assignedto", value: subject.id };
  }
  if (subject.type === "status") return { column: "statusid", value: subject.id };
  return null;
}

module.exports = {
  normalizeName,
  matchKind,
  searchEntities,
  decideMatch,
  resolveChoice,
  formatCandidate,
  extractMention,
  userTypeLabel,
  entitySqlFilter,
  TYPE_LABEL
};
