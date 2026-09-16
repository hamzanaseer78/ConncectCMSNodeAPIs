const {
  isJobAdmin,
  loadAuthUserType,
  buildManagerJobScope
} = require("./job-access");
const {
  utcNow,
  formatUtcDateKey,
  buildLastUtcWeekRanges,
  buildLastUtcMonthRanges
} = require("./date");

const WEEKLY_JOB_VOLUME_WEEKS = 8;
const TICKET_REOPENING_MONTHS = 12;

/**
 * Dashboard visibility:
 * - admin (default policy or usertype admin): branch-wide manager + technician widgets
 * - manager: branch-wide jobs, technicians, and dashboard widgets
 * - technician: no dashboard data
 */
async function resolveDashboardAccess(auth) {
  const user = await loadAuthUserType(auth?.userid);

  if (!user || user.isactive === false || user.isdeleted === true) {
    return {
      canView: false,
      role: "none",
      managerScopeMode: "none"
    };
  }

  if (user.usertype === "technician") {
    return {
      canView: false,
      role: "technician",
      managerScopeMode: "none"
    };
  }

  const admin = await isJobAdmin(auth);
  if (admin || user.usertype === "admin") {
    return {
      canView: true,
      role: "admin",
      managerScopeMode: "branch"
    };
  }

  if (user.usertype === "manager") {
    return {
      canView: true,
      role: "manager",
      managerScopeMode: "branch"
    };
  }

  if (admin) {
    return {
      canView: true,
      role: "admin",
      managerScopeMode: "branch"
    };
  }

  return {
    canView: false,
    role: user.usertype || "unknown",
    managerScopeMode: "none"
  };
}

async function buildDashboardManagerScope(auth, access) {
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);

  if (access?.managerScopeMode === "branch") {
    return { tenantid, branchid };
  }

  if (access?.managerScopeMode === "manager") {
    return buildManagerJobScope(auth);
  }

  return { tenantid, branchid, faultid: { in: [-1] } };
}

function zeroTrendMetric(label, subtitle = null) {
  const metric = {
    label,
    value: 0,
    trend: 0,
    yesterday: 0,
    delta: 0
  };
  if (subtitle != null) {
    metric.subtitle = subtitle;
  }
  return metric;
}

function buildEmptyDashboardResponse(type, auth, query = {}) {
  const now = utcNow();
  const asOf = now.toISOString();
  const date = formatUtcDateKey(now);
  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.max(Number(query.pageSize || query.limit || 25), 1);

  switch (type) {
    case "section1":
      return {
        section: 1,
        asOf,
        date,
        scope: "none",
        role: "technician",
        metrics: {
          totalJobsToday: zeroTrendMetric("Total Jobs Today"),
          openJobsToday: {
            label: "Open Jobs Today",
            value: 0,
            pending: 0,
            inProgress: 0
          },
          completedJobsToday: zeroTrendMetric("Completed Jobs Today"),
          pendingApproval: {
            label: "Pending Approval",
            subtitle: "Need Action",
            value: 0
          },
          activeTechnicians: {
            label: "Active Technicians",
            subtitle: "Traveling + On Site",
            value: 0,
            traveling: 0,
            onSite: 0
          },
          unacknowledgedJobs: {
            label: "Unacknowledged Jobs",
            subtitle: "Awaiting acknowledgement",
            value: 0
          }
        }
      };
    case "technicians":
      return {
        asOf,
        tenantid,
        branchid,
        filter: "all",
        role: "technician",
        summary: { all: 0, offline: 0, onSite: 0, traveling: 0 },
        technicians: []
      };
    case "techniciansLiveStatus":
      return {
        asOf,
        tenantid,
        branchid,
        title: "ALL TECHNICIANS — LIVE STATUS",
        filter: "all",
        role: "technician",
        summary: { all: 0, onSite: 0, travelling: 0, waiting: 0, offDuty: 0 },
        technicians: []
      };
    case "technicianStats":
      return {
        asOf,
        date,
        tenantid,
        branchid,
        title: "TECHNICIAN STATS",
        filter: "all",
        role: "technician",
        summary: {
          total: 0,
          onSite: 0,
          working: 0,
          traveling: 0,
          break: 0,
          present: 0,
          idle: 0,
          absent: 0,
          presentNow: 0,
          presentToday: 0,
          absentToday: 0
        }
      };
    case "jobPipeline":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        total: 0,
        statuses: [{ statusId: null, statusName: "All", count: 0, color: null }]
      };
    case "jobSummary":
      return {
        asOf,
        tenantid,
        branchid,
        scope: "none",
        role: "technician",
        overall: { total: 0, resolved: 0, inProgress: 0 },
        today: { total: 0, resolved: 0, inProgress: 0, date, period: null },
        yesterday: { total: 0, resolved: 0, inProgress: 0, date: null, period: null },
        last7Days: { total: 0, resolved: 0, inProgress: 0, period: null },
        last30Days: { total: 0, resolved: 0, inProgress: 0, period: null }
      };
    case "todayJobs":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        filter: "all",
        summary: {
          all: 0,
          pending: 0,
          approvedQuotation: 0,
          rejectedQuotation: 0,
          pendingQuotations: 0
        },
        statuses: [
          { key: "all", label: "All", count: 0 },
          { key: "pending", label: "Pending", count: 0 },
          { key: "approved_quotation", label: "Approved (Quotation)", count: 0 },
          { key: "rejected_quotation", label: "Rejected (Quotation)", count: 0 },
          { key: "pending_quotations", label: "Pending Quotations", count: 0 }
        ],
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 }
      };
    case "liveActivityFeed":
      return {
        asOf,
        role: "technician",
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 }
      };
    case "jobsByGroup":
      return { asOf, date, scope: "none", role: "technician", total: 0, groups: [] };
    case "locationWiseJobs":
      return { asOf, date, scope: "none", role: "technician", total: 0, locations: [] };
    case "categoryWiseJobs":
      return { asOf, date, scope: "none", role: "technician", total: 0, categories: [] };
    case "topFaults":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        total: 0,
        limit: Math.min(Math.max(Number(query.limit || 10), 1), 50),
        faults: []
      };
    case "technicianPerformance":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        totalCompleted: 0,
        limit: Math.min(Math.max(Number(query.limit || 50), 1), 100),
        technicians: []
      };
    case "managerJobs":
      return {
        asOf,
        managerId: Number(auth.userid),
        role: "technician",
        list: query.list || "all",
        limit: 50,
        summary: { awaitingResponse: 0, overdue: 0, noFirstResponse: 0 },
        lists: { awaitingResponse: [], overdue: [], noFirstResponse: [] }
      };
    case "managerTechnicians":
      return {
        asOf,
        date,
        managerId: Number(auth.userid),
        role: "technician",
        total: 0,
        technicians: []
      };
    case "managerSummary":
      return {
        asOf,
        date,
        managerId: Number(auth.userid),
        role: "technician",
        text: "Dashboard not available for technicians",
        team: { members: [], total: 0 },
        metrics: {
          technicians: 0,
          openJobs: 0,
          completedToday: 0,
          pendingApprovals: 0
        }
      };
    case "activeJobs":
      return {
        asOf,
        scope: "none",
        role: "technician",
        filters: {
          customerName: null,
          statusId: null,
          status: null,
          faultId: null,
          faultName: null
        },
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 }
      };
    case "todaysProgress":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        totalJobs: 0,
        completionRate: { value: 0, completed: 0, total: 0 },
        firstResponseRate: { value: 0, responded: 0, total: 0 },
        avgCompletionHours: null
      };
    case "warrantySplit":
      return {
        asOf,
        date,
        scope: "none",
        role: "technician",
        total: 0,
        split: {
          warranty: { label: "Warranty", count: 0, percentage: 0 },
          nonWarranty: { label: "Non-Warranty", count: 0, percentage: 0 }
        }
      };
    case "weeklyJobVolume": {
      const weeks = buildLastUtcWeekRanges(WEEKLY_JOB_VOLUME_WEEKS).map((week) => ({
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        label: week.label,
        totalJobs: 0,
        volume: {
          highest: { label: "Highest Volume", value: 0, date: null },
          lowest: { label: "Lowest Volume", value: 0, date: null },
          medium: { label: "Medium Volume", value: 0 }
        },
        dailyBreakdown: []
      }));
      return {
        asOf,
        scope: "none",
        role: "technician",
        weekCount: WEEKLY_JOB_VOLUME_WEEKS,
        weeks,
        series: [
          {
            key: "highest",
            label: "Highest Volume",
            values: weeks.map((week) => ({
              weekStart: week.weekStart,
              label: week.label,
              value: 0
            }))
          },
          {
            key: "lowest",
            label: "Lowest Volume",
            values: weeks.map((week) => ({
              weekStart: week.weekStart,
              label: week.label,
              value: 0
            }))
          },
          {
            key: "medium",
            label: "Medium Volume",
            values: weeks.map((week) => ({
              weekStart: week.weekStart,
              label: week.label,
              value: 0
            }))
          }
        ]
      };
    }
    case "avgResolutionByCategory":
      return {
        asOf,
        scope: "none",
        role: "technician",
        overall: {
          avgResolutionHours: null,
          avgResolutionLabel: null,
          sampleSize: 0
        },
        categories: []
      };
    case "ticketReopeningRate": {
      const months = buildLastUtcMonthRanges(TICKET_REOPENING_MONTHS).map((month) => ({
        month: month.month,
        label: month.label,
        completedTickets: 0,
        reopenedTickets: 0,
        reopenRate: 0
      }));
      return {
        asOf,
        scope: "none",
        role: "technician",
        monthCount: TICKET_REOPENING_MONTHS,
        overall: { completedTickets: 0, reopenedTickets: 0, reopenRate: 0 },
        months,
        series: [
          {
            key: "reopenRate",
            label: "Reopening Rate (%)",
            values: months.map((row) => ({
              month: row.month,
              label: row.label,
              value: 0
            }))
          },
          {
            key: "reopenedTickets",
            label: "Reopened Tickets",
            values: months.map((row) => ({
              month: row.month,
              label: row.label,
              value: 0
            }))
          },
          {
            key: "completedTickets",
            label: "Completed Tickets",
            values: months.map((row) => ({
              month: row.month,
              label: row.label,
              value: 0
            }))
          }
        ]
      };
    }
    default:
      return { asOf, role: "technician", data: null };
  }
}

module.exports = {
  resolveDashboardAccess,
  buildDashboardManagerScope,
  buildEmptyDashboardResponse
};
