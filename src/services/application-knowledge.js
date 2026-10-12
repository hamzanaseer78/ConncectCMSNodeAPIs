const { sanitizeState } = require("./conversation-context");
const { asksForMoneyTotals } = require("./money-question");
const STOP = new Set(["the", "and", "for", "with", "that", "this", "what", "how", "does", "did", "are", "was", "were", "our", "you", "your", "can", "from", "into", "when", "why", "who", "its", "it"]);

const FACTS = [
  {
    id: "job.identity",
    module: "jobs",
    entity: "jobs",
    kind: "definition",
    terms: ["job", "jobs", "complaint", "complaints", "service", "request"],
    text: "A job is the customer-reported issue this application tracks. The Jobs menu opens the complaints list, complaint screens use the jobs permission, and the stored record is a job. Job, complaint, and service request are names for the same job record."
  },
  {
    id: "job.assign",
    module: "jobs",
    entity: "jobs",
    kind: "workflow",
    terms: ["assign", "assigned", "create", "created", "technician", "workflow"],
    text: "A job is created from the complaint form. Assign Technician, in the complaints list row actions, sets job.assignedto to the selected technician. Assignment is the user id on the job, not a separate complaint record."
  },
  {
    id: "job.status",
    module: "jobs",
    entity: "jobs",
    kind: "status",
    terms: ["pending", "resolved", "completed", "status", "difference", "new", "assigned", "cancelled"],
    text: "Pending is not its own status. It is new plus assigned: new means no technician and not in a terminal status, and assigned means a technician is set and the status is not terminal. Resolved and completed are separate flags on job statuses, isresolvedstatus and iscompletedstatus, and they are counted separately. Cancelled uses iscancelledstatus."
  },
  {
    id: "job.completed",
    module: "jobs",
    entity: "jobs",
    kind: "workflow",
    terms: ["completed", "complete", "happens", "closed", "acknowledge"],
    text: "Completing a job moves it into a status marked iscompletedstatus. The job view can show a close time from acknowledge or completion. Completion does not by itself post money. Expenses and collections stay on their own rows."
  },
  {
    id: "expense.identity",
    module: "expenses",
    entity: "expenses",
    kind: "definition",
    terms: ["expense", "expenses", "spent", "spend", "cost"],
    text: "An expense is a row in jobexpenses. Each row stores a description, an amount, the user who created it, and createdat. It is money recorded against a job, not a profit figure."
  },
  {
    id: "expense.job",
    module: "expenses",
    entity: "expenses",
    kind: "relationship",
    terms: ["expense", "expenses", "job", "jobs", "link", "linked", "relate", "related", "relationship", "trace", "source"],
    text: "jobexpenses.jobid references job.recno, so every stored expense points at one job. The expense also stores tenantid and branchid. To trace an expense, start from its recno and follow jobid to the job. There is no separate expense that is stored without that job link."
  },
  {
    id: "expense.calculation",
    module: "expenses",
    entity: "expenses",
    kind: "calculation",
    terms: ["expense", "expenses", "calculated", "calculation", "technician", "sum", "total", "report", "zero", "profit"],
    text: "Expense totals are the sum of jobexpenses.amount. Expenses on a job are the rows for that jobid. Expenses in a period use createdat, not the job date. A technician expense total is that sum for jobs assigned to the technician. Amount to collect minus expenses is not treated as net profit. A zero total means no expense rows matched the tenant, branch, job scope, and createdat range. That is an empty result, not a failed query."
  },
  {
    id: "collection.identity",
    module: "collections",
    entity: "collections",
    kind: "definition",
    terms: ["collection", "collections", "collected", "cash", "payment"],
    text: "A collection is a row in jobcollections. It stores an amount and collectedat, and jobid references the job. Collected cash in a period uses the collection date. It is not the same figure as amount to collect."
  },
  {
    id: "collection.workflow",
    module: "collections",
    entity: "collections",
    kind: "workflow",
    terms: ["collection", "collections", "expense", "expenses", "workflow", "compare", "difference"],
    text: "Collections and expenses are both child rows of a job, but they are different tables. An expense uses jobexpenses.amount and createdat. A collection uses jobcollections.amount and collectedat. One does not update the other. Outstanding on a job is amount to collect minus collected cash on that job, and it is not net profit."
  },
  {
    id: "revenue.identity",
    module: "revenue",
    entity: "revenue",
    kind: "definition",
    terms: ["revenue", "collect", "totalcost", "amount"],
    text: "Amount to collect is the sum of job.totalcost for jobs whose job date is in the range. It is not cash collected and it is not profit."
  },
  {
    id: "attendance.identity",
    module: "attendance",
    entity: "attendance",
    kind: "definition",
    terms: ["attendance", "checked", "checkin", "kpi", "technician"],
    text: "Attendance in this chat is the open attendance session: checked in or on break. Absent, late, and leave are not stored. Job KPIs count jobs and amounts. No rule in this assistant adds or subtracts attendance time from those job KPIs."
  },
  {
    id: "cpair.identity",
    module: "cpair",
    entity: "cpair",
    kind: "definition",
    terms: ["cpair", "pair", "quantity"],
    text: "C-Pair figures are quantities on jobcpairsummary for a job. They are not money."
  },
  {
    id: "technician.identity",
    module: "technicians",
    entity: "technicians",
    kind: "definition",
    terms: ["technician", "technicians", "assigned"],
    text: "A technician is a user who can be stored on job.assignedto. Technician job totals count jobs assigned to that user. The chat does not invent a separate technician-performance formula beyond those job and amount totals."
  },
  {
    id: "customer.identity",
    module: "customers",
    entity: "jobs",
    kind: "relationship",
    terms: ["customer", "customers"],
    text: "A job can store customerid. Customer reports group jobs by that link. A customer is not itself a job."
  }
];

const MODULE_TERMS = [
  ["jobs", ["job", "jobs", "complaint", "complaints", "service request", "service requests"]],
  ["expenses", ["expense", "expenses", "spent", "spend"]],
  ["collections", ["collection", "collections", "collected", "cash collected"]],
  ["revenue", ["revenue", "amount to collect"]],
  ["attendance", ["attendance", "checked in", "check-in"]],
  ["cpair", ["c-pair", "cpair"]],
  ["technicians", ["technician", "technicians"]],
  ["customers", ["customer", "customers"]]
];

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function detectModule(text, prior) {
  const source = String(text || "").toLowerCase();
  const found = MODULE_TERMS.filter(([, words]) => words.some((word) => source.includes(word))).map(([module]) => module);
  if (/\b(it|that|this|they)\b/.test(source) && prior?.lastConcept && !found.includes(prior.lastConcept)) {
    found.push(prior.lastConcept);
  }
  return found;
}

function needsLiveData(text) {
  const source = String(text || "").toLowerCase();
  if (asksForMoneyTotals(source)) return true;
  if (/\b(workflow|what is|what are|what's|how does|how do|how is|how are|explain|difference|linked|relate|related|trace|happens when|defined|calculated|why)\b/.test(source)) {
    return false;
  }
  return /\b(how many|how much|show|list|chart|graph|forecast|compare|report|today|this month|pending|figures)\b/.test(source);
}

function retrieveFacts(message, prior) {
  const words = new Set(tokens(message));
  const modules = detectModule(message, prior);
  const ranked = FACTS.map((fact) => {
    let score = fact.terms.reduce((sum, term) => sum + (words.has(term) || String(message || "").toLowerCase().includes(term) ? 1 : 0), 0);
    if (modules.includes(fact.module)) score += 2;
    return { fact, score };
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.fact);
  return ranked;
}

function assessKnowledge(message, prior) {
  if (needsLiveData(message)) return null;
  let facts = retrieveFacts(message, prior);
  if (/^(?:what(?:'s| is| are))\b/.test(String(message || "").toLowerCase())) {
    const narrow = facts.filter((fact) => fact.kind === "definition" || fact.kind === "status");
    if (narrow.length) facts = narrow.slice(0, 2);
  }
  if (!facts.length) return null;
  const source = String(message || "").toLowerCase();
  let kind = "definition";
  if (/\b(why|zero|missing|wrong|failed)\b/.test(source)) kind = "troubleshoot";
  else if (/\b(relate|related|linked|link|difference|compare)\b/.test(source)) kind = "relationship";
  else if (/\b(how do i|how to|how can i)\b/.test(source)) kind = "howto";
  else if (/\b(how|workflow|happen|assign|create|trace)\b/.test(source)) kind = "workflow";
  const module = facts[0].module;
  const entity = facts[0].entity;
  return { kind, module, entity, facts };
}

function assembleEvidence(message, facts) {
  const verified = facts.map((fact) => fact.text);
  const uncertain = "Anything not stated above is not verified from the current job, expense, collection, attendance, or C-Pair implementation.";
  return {
    text: [...verified, uncertain].join("\n\n"),
    generatedBy: "evidence"
  };
}

function knowledgeState(prior, assessment) {
  const base = prior && typeof prior === "object" ? prior : {};
  const filters = base.filters && typeof base.filters === "object" ? { ...base.filters } : {};
  filters.chartType = null;
  filters.groupBy = null;
  filters.forecast = false;
  filters.diagnostic = assessment.kind === "troubleshoot";
  return sanitizeState({
    ...base,
    entity: assessment.entity,
    intent: assessment.kind === "workflow" || assessment.kind === "howto" ? "HOW_TO" : "DEFINITION",
    lastConcept: assessment.module === "jobs" ? "job" : assessment.module,
    filters
  });
}

module.exports = {
  FACTS,
  assessKnowledge,
  asksForMoneyTotals,
  retrieveFacts,
  assembleEvidence,
  knowledgeState,
  needsLiveData
};
