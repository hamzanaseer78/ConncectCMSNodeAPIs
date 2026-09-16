const dashboardService = require("../services/dashboard.service");
const {
  resolveDashboardAccess,
  buildEmptyDashboardResponse
} = require("../utils/dashboard-access");

function requireAuthContext(req, res, next) {
  if (!req.auth?.userid || !req.auth?.tenantid || !req.auth?.branchid) {
    return res.status(401).json({
      message: "JWT must include userid, tenantid and branchid"
    });
  }
  return next();
}

async function runDashboard(req, res, next, handler, emptyKey) {
  try {
    const access = await resolveDashboardAccess(req.auth);
    if (!access.canView) {
      return res.status(200).json(
        buildEmptyDashboardResponse(emptyKey, req.auth, req.query || {})
      );
    }
    const data = await handler(req.auth, req.query || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function runDashboardNoQuery(req, res, next, handler, emptyKey) {
  try {
    const access = await resolveDashboardAccess(req.auth);
    if (!access.canView) {
      return res.status(200).json(buildEmptyDashboardResponse(emptyKey, req.auth));
    }
    const data = await handler(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

const getSection1 = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.section1.bind(dashboardService), "section1");

const getJobSummary = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.jobSummary.bind(dashboardService), "jobSummary");

const getTechnicians = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.technicians.bind(dashboardService), "technicians");

const getTechniciansLiveStatus = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.techniciansLiveStatus.bind(dashboardService),
    "techniciansLiveStatus"
  );

const getTechnicianStats = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.technicianStats.bind(dashboardService),
    "technicianStats"
  );

const getJobPipeline = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.jobPipeline.bind(dashboardService), "jobPipeline");

const getTodayJobs = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.todayJobs.bind(dashboardService), "todayJobs");

const getLiveActivityFeed = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.liveActivityFeed.bind(dashboardService),
    "liveActivityFeed"
  );

const getJobsByGroup = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.jobsByGroup.bind(dashboardService), "jobsByGroup");

const getLocationWiseJobs = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.locationWiseJobs.bind(dashboardService),
    "locationWiseJobs"
  );

const getCategoryWiseJobs = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.categoryWiseJobs.bind(dashboardService),
    "categoryWiseJobs"
  );

const getTopFaults = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.topFaults.bind(dashboardService), "topFaults");

const getTechnicianPerformance = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.technicianPerformance.bind(dashboardService),
    "technicianPerformance"
  );

const getManagerJobs = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.managerJobs.bind(dashboardService), "managerJobs");

const getManagerTechnicians = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.managerTechnicians.bind(dashboardService),
    "managerTechnicians"
  );

const getActiveJobs = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.activeJobs.bind(dashboardService), "activeJobs");

const getTodaysProgress = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.todaysProgress.bind(dashboardService),
    "todaysProgress"
  );

const getWarrantySplit = (req, res, next) =>
  runDashboard(req, res, next, dashboardService.warrantySplit.bind(dashboardService), "warrantySplit");

const getWeeklyJobVolume = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.weeklyJobVolume.bind(dashboardService),
    "weeklyJobVolume"
  );

const getAvgResolutionByCategory = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.avgResolutionByCategory.bind(dashboardService),
    "avgResolutionByCategory"
  );

const getTicketReopeningRate = (req, res, next) =>
  runDashboard(
    req,
    res,
    next,
    dashboardService.ticketReopeningRate.bind(dashboardService),
    "ticketReopeningRate"
  );

const getManagerSummary = (req, res, next) =>
  runDashboardNoQuery(
    req,
    res,
    next,
    dashboardService.managerSummary.bind(dashboardService),
    "managerSummary"
  );

module.exports = {
  requireAuthContext,
  getSection1,
  getJobSummary,
  getTechnicians,
  getTechniciansLiveStatus,
  getTechnicianStats,
  getJobPipeline,
  getTodayJobs,
  getLiveActivityFeed,
  getJobsByGroup,
  getLocationWiseJobs,
  getCategoryWiseJobs,
  getTopFaults,
  getTechnicianPerformance,
  getManagerJobs,
  getManagerTechnicians,
  getActiveJobs,
  getTodaysProgress,
  getWarrantySplit,
  getWeeklyJobVolume,
  getAvgResolutionByCategory,
  getTicketReopeningRate,
  getManagerSummary
};
