/**
 * Terms verified in this application:
 * - Menu label "Jobs" opens /complaints/complaints-list (connect-cms navigation).
 * - Complaint routes and the Complaint screen controller use SCREEN.JOBS.
 * - Creating a record is documented as a complaint/job. The table is job.
 * - Pending is new plus assigned, the Jobs List rule.
 * - Assign Technician on the complaints list writes job.assignedto.
 * Locale files en/ar/fr do not define a different business name for this record.
 */

const JOB = Object.freeze({
  id: "job",
  entity: "jobs",
  label: "job",
  record: "job record",
  phrases: ["job", "jobs", "complaint", "complaints", "service request", "service requests"],
  groups: [
    ["job", "jobs"],
    ["complaint", "complaints"],
    ["service request", "service requests"]
  ],
  summary: "A job is a customer-reported issue or service request that a branch tracks through its workflow.",
  workflow: [
    "It can be assigned to a technician.",
    "Its status follows the Jobs List rules.",
    "Expenses and collections can be recorded against it when those entries exist."
  ],
  statuses: {
    pending: "Pending is not a separate stored status. In the Jobs List it means new plus assigned.",
    assigned: "Assigned means the job has a technician in job.assignedto and is in the assigned status.",
    new: "New means the job has been created and is not yet in the assigned status.",
    completed: "Completed means the job is in the completed status on the Jobs List.",
    cancelled: "Cancelled means the job is in the cancelled status on the Jobs List."
  },
  operations: {
    assign: {
      label: "Assign Technician",
      where: "the complaints list, in the row actions",
      effect: "That action sets job.assignedto to the technician you choose."
    }
  }
});

const CONCEPTS = Object.freeze([JOB]);

function getConcept(id) {
  const key = id === "jobs" ? "job" : id;
  const found = CONCEPTS.find((concept) => concept.id === key);
  if (found) return found;
  if (["expenses", "collections", "revenue", "attendance", "cpair", "technicians", "customers"].includes(key)) {
    return { id: key, entity: key === "customers" ? "jobs" : key };
  }
  return null;
}

function findPhrase(text) {
  const source = String(text || "").toLowerCase();
  const phrases = CONCEPTS.flatMap((concept) => concept.phrases.map((phrase) => ({ concept, phrase })));
  phrases.sort((left, right) => right.phrase.length - left.phrase.length);
  return phrases.find((item) => new RegExp(`\\b${item.phrase}\\b`, "i").test(source)) || null;
}

function matchedGroups(text, concept) {
  const source = String(text || "").toLowerCase();
  return concept.groups.filter((group) => group.some((phrase) => new RegExp(`\\b${phrase}\\b`, "i").test(source)));
}

function matchStatus(text) {
  const source = String(text || "").toLowerCase();
  return Object.keys(JOB.statuses).find((status) => new RegExp(`\\b${status}\\b`).test(source)) || null;
}

function matchOperation(text) {
  const source = String(text || "").toLowerCase();
  if (/\bassign(?:ing|ed|ment)?\b/.test(source)) return JOB.operations.assign;
  return null;
}

function speechAct(text) {
  const source = String(text || "").toLowerCase().trim();
  if (/\bwhat is this\b|\bwhat'?s this\b|\bexplain (?:this|that)\b|\bwhat does (?:this|that) mean\b/.test(source)) {
    return null;
  }
  if (/\bwhy\b/.test(source) && /\b(increas|decreas|chang|higher|lower|rise|rose|drop|dropped|more|fewer)\b/.test(source)) {
    return "diagnostic";
  }
  if (/\bhow do i\b|\bhow can i\b|\bhow to\b|\bsteps to\b/.test(source)) return "howto";
  if (/^(?:what(?:'s| is| are)|define|meaning of)\b/.test(source) || /\bwhat does\b[\s\S]+\bmean\b/.test(source)) {
    if (/\b(how many|show|list|count|compare|forecast|chart|graph)\b/.test(source)) return "data_query";
    return "definition";
  }
  if (/\b(forecast(?:ing)?|predict|estimate future)\b/.test(source)) return "forecast";
  if (/\bcompare\b/.test(source)) return "comparison";
  if (/\b(chart|graph)\b/.test(source)) return "visualization";
  if (/\breport\b/.test(source)) return "report";
  if (/\b(how many|show|list|count|give me|pending)\b/.test(source)) return "data_query";
  return null;
}

function bareConcept(text, concept) {
  if (!concept) return false;
  const stripped = String(text || "")
    .toLowerCase()
    .replace(/[?.!]/g, " ")
    .replace(/^(?:what(?:'s| is| are)|define|meaning of)\s+(?:a|an|the)?\s*/, "")
    .replace(/\s+mean\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return concept.phrases.includes(stripped);
}

function canonicalize(text) {
  return String(text || "")
    .replace(/\bservice requests?\b/gi, "jobs")
    .replace(/\bcomplaints?\b/gi, "jobs");
}

function conceptNames(concept) {
  const names = concept.groups.map((group) => group[0]);
  if (names.length < 2) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function composeDefinition(concept, mode, status) {
  if (status && concept.statuses[status] && mode === "status") {
    return `${concept.statuses[status]} ${conceptNames(concept)} are names for the same ${concept.record}.`;
  }
  const sentences = [
    concept.summary,
    `${conceptNames(concept)} are names for the same ${concept.record}.`,
    ...concept.workflow
  ];
  if (mode === "simple") return sentences.slice(0, 2).join(" ");
  return sentences.join(" ");
}

function composeHowTo(concept, operation) {
  if (!operation) {
    const known = Object.values(concept.operations).map((item) => item.label).join(", ");
    return `I don't have a verified procedure for that action on a ${concept.label}. The documented action available here is ${known}, from ${concept.operations.assign.where}.`;
  }
  return `${operation.label} is on ${operation.where}. ${operation.effect} A ${concept.label} and a complaint are the same record.`;
}

function suggestionsFor(concept) {
  return [
    { label: "How many today", message: `How many ${concept.label}s do we have today?` },
    { label: "Pending list", message: `Show pending ${concept.groups[1][1]} as a list` }
  ];
}

function interpretSemantics(message, prior) {
  const text = String(message || "").toLowerCase().trim();
  const priorConcept = getConcept(prior?.lastConcept);
  const simpler = /\b(simpler words|more simply|simple terms|explain it simply)\b/.test(text);
  const howItWorks = /\bhow (?:does|do) (?:it|this|that) work\b/.test(text);
  if ((simpler || howItWorks) && priorConcept && (prior?.intent === "DEFINITION" || prior?.intent === "HOW_TO")) {
    return {
      handled: true,
      kind: howItWorks ? "howto" : "definition",
      intent: howItWorks ? "HOW_TO" : "DEFINITION",
      conceptId: priorConcept.id,
      answer: howItWorks ? composeHowTo(priorConcept, priorConcept.operations.assign) : composeDefinition(priorConcept, "simple"),
      suggestions: suggestionsFor(priorConcept)
    };
  }

  const found = findPhrase(text);
  const concept = found?.concept || null;
  const status = matchStatus(text);
  const operation = matchOperation(text);
  const act = speechAct(text);
  const whyFollowUp = /\bwhy did (?:it|that|this|they)\b/.test(text) && Boolean(prior?.entity);

  if (act === "definition" && (bareConcept(text, concept) || (status && /\bwhat does\b|\bwhat is\b|\bmeaning of\b/.test(text)))) {
    const subject = concept || JOB;
    return {
      handled: true,
      kind: "definition",
      intent: "DEFINITION",
      conceptId: subject.id,
      answer: composeDefinition(subject, status && !bareConcept(text, concept) ? "status" : "full", status),
      suggestions: suggestionsFor(subject)
    };
  }

  if (act === "howto") {
    const subject = concept || (priorConcept && prior?.intent === "DEFINITION" ? priorConcept : null);
    if (subject) {
      return {
        handled: true,
        kind: "howto",
        intent: "HOW_TO",
        conceptId: subject.id,
        answer: composeHowTo(subject, operation),
        suggestions: suggestionsFor(subject)
      };
    }
  }

  const dataAct = ["data_query", "report", "visualization", "comparison", "forecast", "diagnostic"].includes(act) || whyFollowUp;
  if (!dataAct) return { handled: false };

  return {
    handled: false,
    canonical: concept || /\bcomplaints?\b|\bservice requests?\b/.test(text) ? canonicalize(message) : null,
    diagnostic: act === "diagnostic" || whyFollowUp,
    linked: whyFollowUp,
    collapsedAlias: Boolean(concept && matchedGroups(text, concept).length >= 2),
    conceptId: concept?.id || null
  };
}

module.exports = {
  CONCEPTS,
  getConcept,
  interpretSemantics,
  composeDefinition,
  canonicalize
};
