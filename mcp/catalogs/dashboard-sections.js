const dashboardService = require("../../src/services/dashboard.service");

const DASHBOARD_SECTIONS = Object.freeze([
  { key: "section1", handler: "section1", acceptsQuery: true },
  { key: "jobSummary", handler: "jobSummary", acceptsQuery: true },
  { key: "technicians", handler: "technicians", acceptsQuery: true },
  { key: "techniciansLiveStatus", handler: "techniciansLiveStatus", acceptsQuery: true },
  { key: "technicianStats", handler: "technicianStats", acceptsQuery: true },
  { key: "jobPipeline", handler: "jobPipeline", acceptsQuery: true },
  { key: "todayJobs", handler: "todayJobs", acceptsQuery: true },
  { key: "liveActivityFeed", handler: "liveActivityFeed", acceptsQuery: true },
  { key: "jobsByGroup", handler: "jobsByGroup", acceptsQuery: true },
  { key: "locationWiseJobs", handler: "locationWiseJobs", acceptsQuery: true },
  { key: "categoryWiseJobs", handler: "categoryWiseJobs", acceptsQuery: true },
  { key: "topFaults", handler: "topFaults", acceptsQuery: true },
  { key: "technicianPerformance", handler: "technicianPerformance", acceptsQuery: true },
  { key: "managerJobs", handler: "managerJobs", acceptsQuery: true },
  { key: "managerTechnicians", handler: "managerTechnicians", acceptsQuery: true },
  { key: "activeJobs", handler: "activeJobs", acceptsQuery: true },
  { key: "todaysProgress", handler: "todaysProgress", acceptsQuery: true },
  { key: "warrantySplit", handler: "warrantySplit", acceptsQuery: true },
  { key: "weeklyJobVolume", handler: "weeklyJobVolume", acceptsQuery: true },
  { key: "avgResolutionByCategory", handler: "avgResolutionByCategory", acceptsQuery: true },
  { key: "ticketReopeningRate", handler: "ticketReopeningRate", acceptsQuery: true },
  { key: "managerSummary", handler: "managerSummary", acceptsQuery: false }
]);

function listDashboardSections() {
  return DASHBOARD_SECTIONS.map(({ key, acceptsQuery }) => ({
    section: key,
    acceptsQuery
  }));
}

async function runDashboardSection(auth, sectionKey, query = {}) {
  const entry = DASHBOARD_SECTIONS.find((item) => item.key === sectionKey);
  if (!entry) {
    throw new Error(`Unknown dashboard section: ${sectionKey}`);
  }

  const handler = dashboardService[entry.handler];
  if (typeof handler !== "function") {
    throw new Error(`Dashboard handler not available: ${entry.handler}`);
  }

  return entry.acceptsQuery ? handler.call(dashboardService, auth, query) : handler.call(dashboardService, auth);
}

module.exports = {
  listDashboardSections,
  runDashboardSection
};
