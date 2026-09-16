const { z } = require("zod");
const jobsWorkflowService = require("../../src/services/jobs-workflow.service");
const jobApprovalService = require("../../src/services/job-approval.service");
const { getJobsListService } = require("../helpers/jobs-service");
const { textResult, errorResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { paginationSchema, sortSchema, jobsModeSchema, jsonRecord } = require("../helpers/schemas");

const JOB_LIST_QUERY = {
  search: z.string().optional(),
  statusId: z.number().int().positive().optional(),
  kpi: z.string().optional(),
  ...paginationSchema,
  ...sortSchema
};

const JOB_ACTIONS = Object.freeze({
  assign_technician: "assignTechnician",
  assign_follow_up: "assignFollowUpBy",
  start_travel: "startTravel",
  stop_travel: "stopTravel",
  start_work: "startJob",
  stop_work: "stopJob",
  complete_work: "completeJob",
  resolve: "resolveJob",
  close: "closeJob",
  change_quotation_status: "changeQuotationStatus",
  update_first_response: "updateFirstResponse",
  acknowledge_customer: "acknowledgeCustomer"
});

const JOB_CHILD_LISTERS = Object.freeze({
  attachments: "listAttachments",
  assignments: "listAssignments",
  products: "listProducts",
  services: "listServices",
  status_logs: "listStatusLogs",
  travel_history: "listTravelHistory",
  work_history: "listWorkHistory",
  job_remarks: "listJobRemarks",
  customer_remarks: "listCustomerRemarks",
  quotation_status_logs: "listQuotationStatusLogs"
});

function registerJobsTools(server) {
  server.registerTool(
    "cms_list_jobs",
    {
      description:
        "List jobs (my = assigned to user, all = branch-wide for managers, team = manager's team).",
      inputSchema: {
        mode: jobsModeSchema,
        ...JOB_LIST_QUERY
      }
    },
    withAuth(async (auth, { mode = "my", ...query }) => {
      const service = getJobsListService(mode);
      const data = await service.list(auth, query);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_jobs_stats_kpis",
    {
      description: "Job KPI counts for dashboard tiles (same as GET /api/jobs/*/stats-kpis).",
      inputSchema: {
        mode: jobsModeSchema,
        kpi: z.string().optional(),
        search: z.string().optional(),
        statusId: z.number().int().positive().optional()
      }
    },
    withAuth(async (auth, { mode = "my", ...query }) => {
      const service = getJobsListService(mode);
      const data = await service.statsKpis(auth, query);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_jobs_dashboard",
    {
      description: "Job list dashboard summary (same as GET /api/jobs/*/dashboard).",
      inputSchema: {
        mode: jobsModeSchema
      }
    },
    withAuth(async (auth, { mode = "my" }) => {
      const service = getJobsListService(mode);
      const data = await service.dashboard(auth);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_jobs_reports",
    {
      description:
        "Job breakdown reports by priority, assignee, service, and status (GET /api/jobs/*/reports).",
      inputSchema: {
        mode: jobsModeSchema,
        search: z.string().optional(),
        statusId: z.number().int().positive().optional()
      }
    },
    withAuth(async (auth, { mode = "my", ...query }) => {
      const service = getJobsListService(mode);
      const data = await service.reports(auth, query);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_next_job_code",
    {
      description: "Get the next suggested job code for the current tenant/branch."
    },
    withAuth(async (auth) => {
      const data = await jobsWorkflowService.getNextJobCode(auth);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_get_job",
    {
      description: "Get job form payload by id (same as GET /api/jobs/:id).",
      inputSchema: {
        jobId: z.union([z.string(), z.number()])
      }
    },
    withAuth(async (auth, { jobId }) => {
      const data = await jobsWorkflowService.getById(auth, jobId);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_get_job_details",
    {
      description: "Get extended job details by id (same as GET /api/jobs/:id/details).",
      inputSchema: {
        jobId: z.union([z.string(), z.number()])
      }
    },
    withAuth(async (auth, { jobId }) => {
      const data = await jobsWorkflowService.details(auth, jobId);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_get_job_timeline",
    {
      description: "Get job timeline events by id.",
      inputSchema: {
        jobId: z.union([z.string(), z.number()])
      }
    },
    withAuth(async (auth, { jobId }) => {
      const data = await jobsWorkflowService.timeline(auth, jobId);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_create_job",
    {
      description: "Create a job (same as POST /api/jobs). Payload matches REST body.",
      inputSchema: {
        data: z.record(z.unknown())
      }
    },
    withAuth(async (auth, { data }) => {
      const created = await jobsWorkflowService.create(auth, data);
      const approval = await jobApprovalService.maybeSubmitOnCreate(auth, created.recno);
      return textResult({ ...created, approval });
    })
  );

  server.registerTool(
    "cms_update_job",
    {
      description: "Update a job (same as PUT /api/jobs/:id).",
      inputSchema: {
        jobId: z.union([z.string(), z.number()]),
        data: z.record(z.unknown())
      }
    },
    withAuth(async (auth, { jobId, data }) => {
      const updated = await jobsWorkflowService.update(auth, jobId, data);
      return textResult(updated);
    })
  );

  server.registerTool(
    "cms_list_job_children",
    {
      description: "List child records for a job (attachments, products, services, etc.).",
      inputSchema: {
        jobId: z.union([z.string(), z.number()]),
        child: z.enum(Object.keys(JOB_CHILD_LISTERS))
      }
    },
    withAuth(async (auth, { jobId, child }) => {
      const method = JOB_CHILD_LISTERS[child];
      const data = await jobsWorkflowService[method](auth, jobId);
      return textResult({ child, data });
    })
  );

  server.registerTool(
    "cms_job_action",
    {
      description:
        "Run a job workflow action. Actions: " +
        Object.keys(JOB_ACTIONS).join(", ") +
        ". Pass optional payload matching the REST action body.",
      inputSchema: {
        jobId: z.union([z.string(), z.number()]),
        action: z.enum(Object.keys(JOB_ACTIONS)),
        payload: jsonRecord
      }
    },
    withAuth(async (auth, { jobId, action, payload = {} }) => {
      const methodName = JOB_ACTIONS[action];
      const fn = jobsWorkflowService[methodName];
      if (typeof fn !== "function") {
        return errorResult(new Error(`Action handler missing: ${action}`));
      }
      const data = await fn.call(jobsWorkflowService, auth, jobId, payload);
      return textResult({ action, data });
    })
  );

  server.registerTool(
    "cms_job_actions_catalog",
    {
      description: "List supported job workflow actions for cms_job_action."
    },
    async () =>
      textResult({
        actions: Object.keys(JOB_ACTIONS).map((action) => ({
          action,
          serviceMethod: JOB_ACTIONS[action]
        })),
        childLists: Object.keys(JOB_CHILD_LISTERS)
      })
  );
}

module.exports = {
  registerJobsTools
};
