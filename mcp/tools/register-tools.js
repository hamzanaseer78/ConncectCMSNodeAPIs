const { registerAuthTools } = require("./auth.tools");
const { registerReferenceTools } = require("./reference.tools");
const { registerGenericTools } = require("./generic.tools");
const { registerJobsTools } = require("./jobs.tools");
const { registerReportsTools } = require("./reports.tools");
const { registerDashboardTools } = require("./dashboard.tools");
const { registerAnalyticsTools } = require("./analytics.tools");

function registerTools(server) {
  registerAuthTools(server);
  registerReferenceTools(server);
  registerGenericTools(server);
  registerJobsTools(server);
  registerReportsTools(server);
  registerDashboardTools(server);
  registerAnalyticsTools(server);
}

module.exports = {
  registerTools
};
