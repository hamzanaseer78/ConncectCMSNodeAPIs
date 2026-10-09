const { Prisma } = require("@prisma/client");

const JOB_LINKS = Object.freeze({
  customer: "customerid",
  technician: "assignedto",
  user: "assignedto",
  brand: "brandid",
  category: "serviceid",
  fault: "faultid",
  group: "groupid"
});

const TYPE_WORD = Object.freeze({
  customer: "customer",
  technician: "technician",
  employee: "user",
  user: "user",
  brand: "brand",
  category: "category",
  service: "category",
  subcategory: "fault",
  fault: "fault",
  group: "group"
});

const TYPE_LABEL = Object.freeze({
  customer: "Customer",
  technician: "Technician",
  user: "User",
  brand: "Brand",
  category: "Category",
  fault: "Subcategory",
  group: "Group"
});

const MENTION_STOP = new Set([
  "a", "an", "the", "me", "my", "those", "them", "their", "jobs", "job", "pending",
  "summary", "list", "report", "attendance", "status", "revenue", "expenses",
  "performance", "this", "that", "today", "yesterday", "year", "month", "week",
  "completed", "cancelled", "canceled", "resolved", "assigned", "new", "only",
  "chart", "charts", "graph", "graphs", "show", "for", "of", "in", "as", "by",
  "pie", "donut", "doughnut", "bar", "line", "visualize", "plot", "table",
  "bullet", "heatmap", "radar", "stacked", "horizontal", "pareto", "funnel",
  "waterfall", "gauge", "scatter", "bubble", "treemap", "combo", "forecast",
  "legend", "trendline", "histogram", "polar", "radial", "axis", "axes",
  "column",
  "grouped", "breakdown", "count", "total", "trend", "comparison", "make", "it",
  "category", "technician", "customer", "brand", "fault", "group", "and"
]);

function isReservedName(value) {
  const name = String(value || "").replace(/[?.!,]+$/g, "").replace(/['’]s$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!name) return true;
  return name.split(" ").some((token) => MENTION_STOP.has(token));
}

function cleanMention(value) {
  const name = String(value || "").replace(/[?.!,]+$/g, "").replace(/['’]s$/i, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) return null;
  if (isReservedName(name)) return null;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) return null;
  return name;
}

function extractMention(message) {
  const text = String(message || "").trim();
  const typed = text.match(/\b(customer|technician|employee|user|brand|category|service|subcategory|fault|group)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?=\s+jobs?\b|\s+for\b|\s+as\b|[.?!]|$)/i);
  if (typed) {
    const name = cleanMention(typed[2]);
    if (name) return { name, hintedType: TYPE_WORD[typed[1].toLowerCase()] };
  }
  const show = text.match(/\b(?:show|list|get|give|find)\s+(?:me\s+)?(?:the\s+)?([A-Za-z][A-Za-z .'-]{1,60}?)(?:['’]s)?\s+jobs?\b/i);
  if (show) {
    const name = cleanMention(show[1]);
    if (name) return { name, hintedType: null };
  }
  const possessive = text.match(/\b([A-Za-z][A-Za-z .'-]{1,60}?)['’]s\s+jobs?\b/);
  if (possessive) {
    const name = cleanMention(possessive[1]);
    if (name) return { name, hintedType: null };
  }
  const jobsFor = text.match(/\bjobs?\s+(?:for|of)\s+([A-Za-z][A-Za-z .'-]{1,60})/i);
  if (jobsFor) {
    const name = cleanMention(jobsFor[1]);
    if (name) return { name, hintedType: null };
  }
  return null;
}

function explicitRecord(message) {
  const match = String(message || "").match(/\b(customer|technician|employee|user|brand|category|service|subcategory|fault|group)\s+id\s+(\d+)\b/i);
  if (!match) return null;
  const id = Number(match[2]);
  if (!id) return null;
  return { type: TYPE_WORD[match[1].toLowerCase()], id };
}

function choiceTypeFromMessage(message, pending) {
  if (!Array.isArray(pending) || !pending.length) return null;
  const text = String(message || "").trim().toLowerCase();
  if (/\b(jobs?|attendance|revenue|expenses?|report|list|chart|graph)\b/.test(text)) return null;
  const match = text.match(/^(?:the\s+|a\s+)?(customer|technician|employee|user|brand|category|service|subcategory|fault|group)s?[.?!]?$/);
  if (!match) return null;
  return TYPE_WORD[match[1]];
}

function inScope(candidate, scope) {
  if (!candidate) return false;
  if (candidate.tenantid != null && Number(candidate.tenantid) !== Number(scope?.tenantid)) return false;
  if (candidate.entityType === "brand") return true;
  if (candidate.branchid == null) return true;
  return Number(candidate.branchid) === Number(scope?.branchid);
}

function noMatchMessage(name) {
  return `I couldn't find an exact match for ${name} in the available records. Would you like me to search for similar names or check another entity type?`;
}

function suggestionFor(candidate, uniqueWithinType) {
  const labelName = TYPE_LABEL[candidate.entityType] || candidate.entityType;
  const detail = candidate.detail ? ` · ${candidate.detail}` : "";
  const word = candidate.entityType === "fault" ? "fault" : candidate.entityType;
  return {
    label: `${labelName}: ${candidate.displayName}${detail}`,
    message: uniqueWithinType ? `The ${labelName.toLowerCase()}` : `${word} id ${candidate.entityId}`,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    displayName: candidate.displayName,
    detail: candidate.detail || null,
    match: candidate.match || "exact"
  };
}

function decideResolution({ requestedName, hintedType, preferredType, candidates }, scope) {
  const name = cleanMention(requestedName) || String(requestedName || "").trim();
  const scoped = (Array.isArray(candidates) ? candidates : []).filter((candidate) => inScope(candidate, scope));
  const exact = scoped.filter((candidate) => candidate.match !== "partial");
  const partial = scoped.filter((candidate) => candidate.match === "partial");
  let pool = exact;
  if (hintedType) pool = pool.filter((candidate) => candidate.entityType === hintedType);
  else if (preferredType) {
    const preferred = pool.filter((candidate) => candidate.entityType === preferredType);
    if (preferred.length) pool = preferred;
  }

  if (!pool.length) {
    const similar = (hintedType ? partial.filter((candidate) => candidate.entityType === hintedType) : partial).slice(0, 8);
    return {
      outcome: "none",
      requestedName: name,
      message: noMatchMessage(name),
      suggestions: similar.map((candidate) => suggestionFor(candidate, false)),
      choices: similar,
      subject: null
    };
  }

  if (pool.length === 1) {
    const match = pool[0];
    return {
      outcome: "resolved",
      requestedName: name,
      message: null,
      suggestions: [],
      choices: [],
      subject: {
        type: match.entityType,
        id: Number(match.entityId),
        name: match.displayName
      }
    };
  }

  const types = new Set(pool.map((candidate) => candidate.entityType));
  const counts = {};
  pool.forEach((candidate) => {
    counts[candidate.entityType] = (counts[candidate.entityType] || 0) + 1;
  });
  const choices = pool.slice(0, 8).map((candidate) => suggestionFor(candidate, counts[candidate.entityType] === 1));
  const message = types.size > 1
    ? `I found ${name} in multiple areas. Which one do you mean?`
    : `More than one ${TYPE_LABEL[pool[0].entityType].toLowerCase()} is named ${name}. Which one do you mean?`;
  return {
    outcome: "clarify",
    requestedName: name,
    message,
    suggestions: choices.map((choice) => ({ label: choice.label, message: choice.message })),
    choices,
    subject: null
  };
}

function executionPlan(state) {
  const requested = state?.filters?.requestedName || null;
  const subject = state?.filters?.subject || null;
  if (requested && !subject?.id) {
    return { ok: false, reason: "unresolved_name", requestedName: requested };
  }
  return {
    ok: true,
    entity: state?.entity || null,
    subjectType: subject?.type || null,
    subjectId: subject?.id || null,
    relationship: subject?.type ? (JOB_LINKS[subject.type] || null) : null,
    status: state?.filters?.status || null,
    range: state?.filters?.range || null,
    outputFormat: state?.outputFormat || null,
    tenantScoped: true
  };
}

function likeTerm(name) {
  return `%${String(name || "").replace(/[%_\\]/g, "")}%`;
}

function matchKind(displayName, query) {
  return String(displayName || "").trim().toLowerCase() === String(query || "").trim().toLowerCase()
    ? "exact"
    : "partial";
}

function detailOf(parts) {
  return parts.map((part) => (part == null ? "" : String(part).trim())).filter(Boolean).slice(0, 3).join(" · ") || null;
}

async function searchJobEntities(db, scope, name) {
  const like = likeTerm(name);
  const tenantid = Number(scope.tenantid);
  const branchid = Number(scope.branchid);
  const [customers, users, brands, categories, faults, groups] = await Promise.all([
    db.$queryRaw`
      SELECT c.customerid AS id, c.name, c.tenantid, c.branchid, ci.name AS city_name, ar.name AS area_name
      FROM customers c
      LEFT JOIN cities ci ON ci.recno = c.city AND ci.tenantid = c.tenantid
      LEFT JOIN areas ar ON ar.recno = c.area AND ar.tenantid = c.tenantid
      WHERE c.tenantid = ${tenantid}
        AND (c.branchid IS NULL OR c.branchid = ${branchid})
        AND c.name ILIKE ${like}
      ORDER BY c.name
      LIMIT 8
    `,
    db.$queryRaw`
      SELECT u.userid AS id, u.name, uo.tenantid, uo.branchid, u.usertype::text AS usertype,
             u.technicianaffiliation::text AS affiliation, u.companyname
      FROM users u
      INNER JOIN userorganizations uo ON uo.userid = u.userid
      WHERE uo.tenantid = ${tenantid}
        AND uo.branchid = ${branchid}
        AND (uo.isblocked = false OR uo.isblocked IS NULL)
        AND (u.isdeleted = false OR u.isdeleted IS NULL)
        AND u.name ILIKE ${like}
      ORDER BY u.name
      LIMIT 8
    `,
    db.$queryRaw`
      SELECT b.recno AS id, b.name, b.tenantid
      FROM brands b
      WHERE b.tenantid = ${tenantid}
        AND b.name ILIKE ${like}
      ORDER BY b.name
      LIMIT 8
    `,
    db.$queryRaw`
      SELECT c.categoryid AS id, c.name, c.tenantid, c.branchid, g.name AS group_name
      FROM jobcategories c
      LEFT JOIN jobgroups g ON g.groupid = c.groupid
      WHERE c.tenantid = ${tenantid}
        AND (c.branchid IS NULL OR c.branchid = ${branchid})
        AND c.name ILIKE ${like}
      ORDER BY c.name
      LIMIT 8
    `,
    db.$queryRaw`
      SELECT s.subcategoryid AS id, s.name, s.tenantid, s.branchid, c.name AS category_name
      FROM jobsubcategories s
      LEFT JOIN jobcategories c ON c.categoryid = s.categoryid
      WHERE s.tenantid = ${tenantid}
        AND (s.branchid IS NULL OR s.branchid = ${branchid})
        AND s.name ILIKE ${like}
      ORDER BY s.name
      LIMIT 8
    `,
    db.$queryRaw`
      SELECT g.groupid AS id, g.name, g.tenantid, g.branchid
      FROM jobgroups g
      WHERE g.tenantid = ${tenantid}
        AND (g.branchid IS NULL OR g.branchid = ${branchid})
        AND g.name ILIKE ${like}
      ORDER BY g.name
      LIMIT 8
    `
  ]);

  const candidates = [];
  customers.forEach((row) => candidates.push({
    entityType: "customer",
    entityId: Number(row.id),
    displayName: row.name,
    detail: detailOf([row.city_name, row.area_name]),
    tenantid: row.tenantid,
    branchid: row.branchid,
    match: matchKind(row.name, name),
    relationship: JOB_LINKS.customer
  }));
  users.forEach((row) => {
    const entityType = String(row.usertype || "").toLowerCase() === "technician" ? "technician" : "user";
    candidates.push({
      entityType,
      entityId: Number(row.id),
      displayName: row.name,
      detail: detailOf([row.usertype, row.affiliation, row.companyname]),
      tenantid: row.tenantid,
      branchid: row.branchid,
      match: matchKind(row.name, name),
      relationship: JOB_LINKS[entityType]
    });
  });
  brands.forEach((row) => candidates.push({
    entityType: "brand",
    entityId: Number(row.id),
    displayName: row.name,
    detail: null,
    tenantid: row.tenantid,
    branchid: null,
    match: matchKind(row.name, name),
    relationship: JOB_LINKS.brand
  }));
  categories.forEach((row) => candidates.push({
    entityType: "category",
    entityId: Number(row.id),
    displayName: row.name,
    detail: detailOf([row.group_name ? `group ${row.group_name}` : null]),
    tenantid: row.tenantid,
    branchid: row.branchid,
    match: matchKind(row.name, name),
    relationship: JOB_LINKS.category
  }));
  faults.forEach((row) => candidates.push({
    entityType: "fault",
    entityId: Number(row.id),
    displayName: row.name,
    detail: detailOf([row.category_name ? `category ${row.category_name}` : null]),
    tenantid: row.tenantid,
    branchid: row.branchid,
    match: matchKind(row.name, name),
    relationship: JOB_LINKS.fault
  }));
  groups.forEach((row) => candidates.push({
    entityType: "group",
    entityId: Number(row.id),
    displayName: row.name,
    detail: null,
    tenantid: row.tenantid,
    branchid: row.branchid,
    match: matchKind(row.name, name),
    relationship: JOB_LINKS.group
  }));
  return candidates.filter((candidate) => candidate.entityId && candidate.displayName);
}

async function subjectInScope(db, scope, subject) {
  if (!subject?.id || !JOB_LINKS[subject.type]) return false;
  const id = Number(subject.id);
  const tenantid = Number(scope.tenantid);
  const branchid = Number(scope.branchid);
  let rows = [];
  if (subject.type === "customer") {
    rows = await db.$queryRaw`
      SELECT customerid AS id FROM customers
      WHERE customerid = ${id} AND tenantid = ${tenantid}
        AND (branchid IS NULL OR branchid = ${branchid})
      LIMIT 1
    `;
  } else if (subject.type === "technician" || subject.type === "user") {
    const typeSql = subject.type === "technician"
      ? Prisma.sql`AND u.usertype::text = 'technician'`
      : Prisma.sql``;
    rows = await db.$queryRaw`
      SELECT u.userid AS id
      FROM users u
      INNER JOIN userorganizations uo ON uo.userid = u.userid
      WHERE u.userid = ${id}
        AND uo.tenantid = ${tenantid}
        AND uo.branchid = ${branchid}
        AND (uo.isblocked = false OR uo.isblocked IS NULL)
        ${typeSql}
      LIMIT 1
    `;
  } else if (subject.type === "brand") {
    rows = await db.$queryRaw`
      SELECT recno AS id FROM brands
      WHERE recno = ${id} AND tenantid = ${tenantid}
      LIMIT 1
    `;
  } else if (subject.type === "category") {
    rows = await db.$queryRaw`
      SELECT categoryid AS id FROM jobcategories
      WHERE categoryid = ${id} AND tenantid = ${tenantid}
        AND (branchid IS NULL OR branchid = ${branchid})
      LIMIT 1
    `;
  } else if (subject.type === "fault") {
    rows = await db.$queryRaw`
      SELECT subcategoryid AS id FROM jobsubcategories
      WHERE subcategoryid = ${id} AND tenantid = ${tenantid}
        AND (branchid IS NULL OR branchid = ${branchid})
      LIMIT 1
    `;
  } else if (subject.type === "group") {
    rows = await db.$queryRaw`
      SELECT groupid AS id FROM jobgroups
      WHERE groupid = ${id} AND tenantid = ${tenantid}
        AND (branchid IS NULL OR branchid = ${branchid})
      LIMIT 1
    `;
  }
  return rows.length > 0;
}

module.exports = {
  JOB_LINKS,
  TYPE_LABEL,
  extractMention,
  isReservedName,
  explicitRecord,
  choiceTypeFromMessage,
  decideResolution,
  executionPlan,
  searchJobEntities,
  subjectInScope,
  inScope
};
