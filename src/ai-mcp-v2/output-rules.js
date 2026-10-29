const OUTPUT_RULES = [
  "Interpret the user's requested output precisely.",
  "When the user asks for a job list, list jobs as individual records. Do not return only status counts or an aggregate summary.",
  "When the user asks for status-wise jobs, group jobs by status.",
  "When the user asks for jobs with a specific status, return the individual matching job records.",
  "When the user asks for a count, return the count.",
  "Include relevant fields such as job number, customer, technician, status, and date when those fields exist and are authorized.",
  "Resolve related entity names using authorized database relationships.",
  "If results exceed the response limit, paginate or clearly report how many records are displayed and how to retrieve the rest.",
  "Never invent job records, names, or totals."
].join(" ");

module.exports = {
  OUTPUT_RULES
};
