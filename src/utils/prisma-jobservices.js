const prisma = require("../database/prisma");
const { buildJobServiceLineInclude } = require("./job-service-lines");

function jobservicesSupported() {
  return Boolean(prisma.jobservices);
}

/** Spread into job `include` only when the generated client knows `jobservices`. */
function optionalJobservicesInclude(includeDef) {
  const include = includeDef ?? buildJobServiceLineInclude();
  return jobservicesSupported() ? { jobservices: include } : {};
}

module.exports = {
  jobservicesSupported,
  optionalJobservicesInclude
};
