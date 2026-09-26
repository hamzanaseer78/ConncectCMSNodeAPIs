const jobsWorkflowService = require("../services/jobs-workflow.service");
const { buildJobActionPayload } = require("../utils/job-action-request");
const jobsAllService = require("../services/jobs-all.service");
const jobsMyService = require("../services/jobs-my.service");
const jobsTeamService = require("../services/jobs-team.service");
const jobApprovalService = require("../services/job-approval.service");
const jobQuotationSettingsService = require("../services/job-quotation-settings.service");
const jobFormSettingsService = require("../services/job-form-settings.service");
const jobCodeSettingsService = require("../services/job-code-settings.service");
const jobCashService = require("../services/job-cash.service");
const {
  jobCollectionsAllService,
  jobCollectionsMyService
} = require("../services/job-collections-list.service");
const {
  jobPendingCollectionsAllService,
  jobPendingCollectionsMyService
} = require("../services/job-pending-collections-list.service");
const {
  jobPendingExpensesAllService,
  jobPendingExpensesMyService
} = require("../services/job-pending-expenses-list.service");
const jobCpairService = require("../services/job-cpair.service");
const dropdownController = require("./dropdown.controller");

async function getNextJobCode(req, res, next) {
  try {
    const data = await jobsWorkflowService.getNextJobCode(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getJobCodeSettings(req, res, next) {
  try {
    const data = await jobCodeSettingsService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveJobCodeSettings(req, res, next) {
  try {
    const data = await jobCodeSettingsService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function createJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.create(req.auth, req.body);
    const approval = await jobApprovalService.maybeSubmitOnCreate(req.auth, data.recno);
    res.status(201).json({ ...data, approval });
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getApprovalDiagnostics(req, res, next) {
  try {
    const data = await jobApprovalService.getDiagnostics(req.auth);
    res.status(data.ready ? 200 : 503).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getApprovalSettings(req, res, next) {
  try {
    const data = await jobApprovalService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveApprovalSettings(req, res, next) {
  try {
    const data = await jobApprovalService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getQuotationSettings(req, res, next) {
  try {
    const data = await jobQuotationSettingsService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveQuotationSettings(req, res, next) {
  try {
    const data = await jobQuotationSettingsService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getFormSettings(req, res, next) {
  try {
    const data = await jobFormSettingsService.getSettings(req.auth, req.query.formType);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveFormSettings(req, res, next) {
  try {
    const data = await jobFormSettingsService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getErpProductsDropdown(req, res, next) {
  try {
    const settings = await jobQuotationSettingsService.getSettings(req.auth);
    const dropdown = await dropdownController.getDropdown("erpproducts", req.auth, req.query);
    res.status(200).json({
      useERPProducts: settings.useERPProducts === true,
      ...dropdown
    });
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getCashSettings(req, res, next) {
  try {
    const data = await jobCashService.getSettings(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveCashSettings(req, res, next) {
  try {
    const data = await jobCashService.saveSettings(req.auth, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJobCollection(req, res, next) {
  try {
    const data = await jobCashService.getCollection(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveJobCollection(req, res, next) {
  try {
    const data = await jobCashService.saveCollection(req.auth, req.params.id, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobExpenses(req, res, next) {
  try {
    const data = await jobCashService.listExpenses(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function createJobExpense(req, res, next) {
  try {
    const data = await jobCashService.createExpense(req.auth, req.params.id, req.body);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function syncJobExpenses(req, res, next) {
  try {
    const data = await jobCashService.syncExpenses(req.auth, req.params.id, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function updateJobExpense(req, res, next) {
  try {
    const data = await jobCashService.updateExpense(
      req.auth,
      req.params.id,
      req.params.expenseId,
      req.body
    );
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function deleteJobExpense(req, res, next) {
  try {
    const data = await jobCashService.deleteExpense(
      req.auth,
      req.params.id,
      req.params.expenseId
    );
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobCollectionsAll(req, res, next) {
  try {
    const data = await jobCollectionsAllService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobCollectionsMy(req, res, next) {
  try {
    const data = await jobCollectionsMyService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobPendingCollectionsAll(req, res, next) {
  try {
    const data = await jobPendingCollectionsAllService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobPendingCollectionsMy(req, res, next) {
  try {
    const data = await jobPendingCollectionsMyService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobPendingExpensesAll(req, res, next) {
  try {
    const data = await jobPendingExpensesAllService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobPendingExpensesMy(req, res, next) {
  try {
    const data = await jobPendingExpensesMyService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJobCpairSchema(req, res, next) {
  try {
    const data = await jobCpairService.getSchema(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function createJobCpair(req, res, next) {
  try {
    const data = await jobCpairService.createForJob(req.auth, req.params.id, req.body);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function updateJobCpair(req, res, next) {
  try {
    const data = await jobCpairService.updateForJob(req.auth, req.params.id, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listJobCpairSummaries(req, res, next) {
  try {
    const data = await jobCpairService.listSummaries(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJobCpairSummaryDetail(req, res, next) {
  try {
    const data = await jobCpairService.getSummaryDetail(req.auth, req.params.summaryId);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJobCpairOverview(req, res, next) {
  try {
    const data = await jobCpairService.getOverview(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function receiveJobCpair(req, res, next) {
  try {
    const data = await jobCpairService.receiveForSummary(
      req.auth,
      req.params.summaryId,
      req.body
    );
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function issueJobCpair(req, res, next) {
  try {
    const data = await jobCpairService.issueForSummary(req.auth, req.params.summaryId, req.body);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function deleteJobCpairSummary(req, res, next) {
  try {
    const data = await jobCpairService.deleteSummary(req.auth, req.params.summaryId);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function deleteJobCpairPart(req, res, next) {
  try {
    const data = await jobCpairService.deletePart(req.auth, req.params.partId);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listPendingApprovals(req, res, next) {
  try {
    const data = await jobApprovalService.listPending(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJobApproval(req, res, next) {
  try {
    const data = await jobApprovalService.getJobApproval(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function submitJobApproval(req, res, next) {
  try {
    const data = await jobApprovalService.submit(req.auth, req.params.id, req.body?.remarks);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function approveJob(req, res, next) {
  try {
    const data = await jobApprovalService.approve(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function rejectJob(req, res, next) {
  try {
    const data = await jobApprovalService.reject(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.getById(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function updateJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.update(req.auth, req.params.id, req.body);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getAllJobs(req, res, next) {
  try {
    const data = await jobsAllService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getMyJobs(req, res, next) {
  try {
    const data = await jobsMyService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getTeamJobs(req, res, next) {
  try {
    const data = await jobsTeamService.list(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getJobDetails(req, res, next) {
  try {
    const data = await jobsWorkflowService.details(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getQuotationDetails(req, res, next) {
  try {
    const data = await jobsWorkflowService.quotationDetails(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listQuotationStatusOptions(req, res, next) {
  try {
    const data = jobsWorkflowService.listQuotationStatusOptions();
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

async function getQuotationStatus(req, res, next) {
  try {
    const data = await jobsWorkflowService.getQuotationStatus(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function changeQuotationStatus(req, res, next) {
  try {
    const data = await jobsWorkflowService.changeQuotationStatus(
      req.auth,
      req.params.id,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listQuotationStatusLogs(req, res, next) {
  try {
    const data = await jobsWorkflowService.listQuotationStatusLogs(req.auth, req.params.id);
    res.status(200).json({
      jobid: Number(req.params.id),
      total: data.length,
      data
    });
  } catch (err) {
    next(err);
  }
}

async function getJobTimeline(req, res, next) {
  try {
    const data = await jobsWorkflowService.timeline(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), timeline: data });
  } catch (err) {
    next(err);
  }
}

async function assignTechnician(req, res, next) {
  try {
    const data = await jobsWorkflowService.assignTechnician(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function assignFollowUpBy(req, res, next) {
  try {
    const data = await jobsWorkflowService.assignFollowUpBy(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function startTravel(req, res, next) {
  try {
    const data = await jobsWorkflowService.startTravel(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function stopTravel(req, res, next) {
  try {
    const data = await jobsWorkflowService.stopTravel(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function startJobWork(req, res, next) {
  try {
    const payload = buildJobActionPayload(req);
    const data = await jobsWorkflowService.startJob(req.auth, req.params.id, payload);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function stopJobWork(req, res, next) {
  try {
    const payload = buildJobActionPayload(req);
    const data = await jobsWorkflowService.stopJob(req.auth, req.params.id, payload);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function completeJobWork(req, res, next) {
  try {
    const payload = buildJobActionPayload(req);
    const data = await jobsWorkflowService.completeJob(req.auth, req.params.id, payload);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function resolveJob(req, res, next) {
  try {
    const payload = buildJobActionPayload(req);
    const data = await jobsWorkflowService.resolveJob(req.auth, req.params.id, payload);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function closeJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.closeJob(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobAttachments(req, res, next) {
  try {
    const data = await jobsWorkflowService.listAttachments(req.auth, req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getJobAttachment(req, res, next) {
  try {
    const data = await jobsWorkflowService.getAttachment(req.auth, req.params.id, req.params.attachmentId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createJobAttachment(req, res, next) {
  try {
    const data = await jobsWorkflowService.createAttachment(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateJobAttachment(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateAttachment(req.auth, req.params.id, req.params.attachmentId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobAttachment(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteAttachment(req.auth, req.params.id, req.params.attachmentId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobAssignments(req, res, next) {
  try {
    const data = await jobsWorkflowService.listAssignments(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function createJobAssignment(req, res, next) {
  try {
    const data = await jobsWorkflowService.createAssignment(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateJobAssignment(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateAssignment(req.auth, req.params.id, req.params.assignmentId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobAssignment(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteAssignment(req.auth, req.params.id, req.params.assignmentId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobStatusLogs(req, res, next) {
  try {
    const data = await jobsWorkflowService.listStatusLogs(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function createJobStatusLog(req, res, next) {
  try {
    const data = await jobsWorkflowService.createStatusLog(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateJobStatusLog(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateStatusLog(req.auth, req.params.id, req.params.statusLogId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobStatusLog(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteStatusLog(req.auth, req.params.id, req.params.statusLogId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobTravelHistory(req, res, next) {
  try {
    const data = await jobsWorkflowService.listTravelHistory(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function listJobWorkHistory(req, res, next) {
  try {
    const data = await jobsWorkflowService.listWorkHistory(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function listJobProducts(req, res, next) {
  try {
    const data = await jobsWorkflowService.listProducts(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function createJobProduct(req, res, next) {
  try {
    const data = await jobsWorkflowService.createProduct(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateJobProduct(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateProduct(req.auth, req.params.id, req.params.productLineId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobProduct(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteProduct(req.auth, req.params.id, req.params.productLineId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobServices(req, res, next) {
  try {
    const data = await jobsWorkflowService.listServices(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function createJobService(req, res, next) {
  try {
    const data = await jobsWorkflowService.createService(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateJobService(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateService(
      req.auth,
      req.params.id,
      req.params.serviceLineId,
      req.body || {}
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobService(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteService(
      req.auth,
      req.params.id,
      req.params.serviceLineId
    );
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listJobRemarks(req, res, next) {
  try {
    const data = await jobsWorkflowService.listJobRemarks(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, remarks: data, data });
  } catch (err) {
    next(err);
  }
}

async function createJobRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.createJobRemark(req.auth, req.params.id, req.body || {});
    const list = Array.isArray(data) ? data : [data];
    res.status(201).json(
      list.length === 1 ? list[0] : { jobid: Number(req.params.id), total: list.length, remarks: list }
    );
  } catch (err) {
    next(err);
  }
}

async function updateJobRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateJobRemark(req.auth, req.params.id, req.params.remarkId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteJobRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteJobRemark(req.auth, req.params.id, req.params.remarkId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getCustomerFeedback(req, res, next) {
  try {
    const data = await jobsWorkflowService.getCustomerFeedback(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), customerFeedback: data });
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function saveCustomerFeedback(req, res, next) {
  try {
    const data = await jobsWorkflowService.saveCustomerFeedback(req.auth, req.params.id, req.body || {});
    res.status(200).json({ jobid: Number(req.params.id), customerFeedback: data });
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function listCustomerRemarks(req, res, next) {
  return listJobRemarks(req, res, next);
}

async function createCustomerRemark(req, res, next) {
  return createJobRemark(req, res, next);
}

async function updateCustomerRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateCustomerRemark(req.auth, req.params.id, req.params.remarkId, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteCustomerRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.deleteCustomerRemark(req.auth, req.params.id, req.params.remarkId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateFirstResponse(req, res, next) {
  try {
    const data = await jobsWorkflowService.updateFirstResponse(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function acknowledgeCustomer(req, res, next) {
  try {
    const data = await jobsWorkflowService.acknowledgeCustomer(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getDashboardAll(req, res, next) {
  try {
    const data = await jobsAllService.dashboard(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getDashboardMy(req, res, next) {
  try {
    const data = await jobsMyService.dashboard(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getDashboardTeam(req, res, next) {
  try {
    const data = await jobsTeamService.dashboard(req.auth);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getStatsKpisAll(req, res, next) {
  try {
    const data = await jobsAllService.statsKpis(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getStatsKpisMy(req, res, next) {
  try {
    const data = await jobsMyService.statsKpis(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getStatsKpisTeam(req, res, next) {
  try {
    const data = await jobsTeamService.statsKpis(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function getReportAll(req, res, next) {
  try {
    const data = await jobsAllService.reports(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getReportMy(req, res, next) {
  try {
    const data = await jobsMyService.reports(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getReportTeam(req, res, next) {
  try {
    const data = await jobsTeamService.reports(req.auth, req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

const jobsListExportService = require("../services/jobs-list-export.service");

function parseJobsListExportRequest(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const query = req.query || {};
  const source = { ...query, ...body };
  const { format, exportFormat, columns, filter, ...rest } = source;
  return {
    format: format ?? exportFormat,
    columns,
    filter: filter && typeof filter === "object" ? filter : rest,
    sortBy: source.sortBy,
    sortOrder: source.sortOrder
  };
}

async function getJobsListReportColumns(req, res, next) {
  try {
    const data = await jobsListExportService.getColumns(req.auth);
    res.status(200).json(data);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function updateJobsListReportColumns(req, res, next) {
  try {
    const columns = await jobsListExportService.updateColumns(req.auth, req.body?.columns || []);
    res.status(200).json({
      reportKey: "jobs_list",
      columns
    });
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function exportJobsList(req, res, next, scope = "all") {
  try {
    const payload = parseJobsListExportRequest(req);
    const result = await jobsListExportService.export(req.auth, {
      scope,
      ...payload
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("X-Export-Row-Count", String(result.rowCount));
    res.setHeader("X-Export-Truncated", result.truncated ? "true" : "false");
    res.setHeader("X-Export-Max-Rows", String(result.maxExportRows));
    res.status(200).send(result.buffer);
  } catch (err) {
    if (err.status) err.statusCode = err.status;
    next(err);
  }
}

async function exportJobsListAll(req, res, next) {
  return exportJobsList(req, res, next, "all");
}

async function exportJobsListMy(req, res, next) {
  return exportJobsList(req, res, next, "my");
}

async function exportJobsListTeam(req, res, next) {
  return exportJobsList(req, res, next, "team");
}

module.exports = {
  assignTechnician,
  assignFollowUpBy,
  approveJob,
  closeJob,
  completeJobWork,
  createCustomerRemark,
  getCustomerFeedback,
  saveCustomerFeedback,
  createJobRemark,
  createJobAssignment,
  createJobAttachment,
  createJobProduct,
  createJobService,
  createJobStatusLog,
  createJob,
  getApprovalDiagnostics,
  getApprovalSettings,
  getJob,
  getJobApproval,
  getNextJobCode,
  getJobCodeSettings,
  saveJobCodeSettings,
  listPendingApprovals,
  rejectJob,
  saveApprovalSettings,
  getQuotationSettings,
  saveQuotationSettings,
  getFormSettings,
  saveFormSettings,
  getErpProductsDropdown,
  getCashSettings,
  saveCashSettings,
  getJobCollection,
  saveJobCollection,
  listJobExpenses,
  createJobExpense,
  syncJobExpenses,
  updateJobExpense,
  deleteJobExpense,
  listJobCollectionsAll,
  listJobCollectionsMy,
  listJobPendingCollectionsAll,
  listJobPendingCollectionsMy,
  listJobPendingExpensesAll,
  listJobPendingExpensesMy,
  getJobCpairSchema,
  createJobCpair,
  updateJobCpair,
  listJobCpairSummaries,
  getJobCpairSummaryDetail,
  getJobCpairOverview,
  receiveJobCpair,
  issueJobCpair,
  deleteJobCpairSummary,
  deleteJobCpairPart,
  submitJobApproval,
  deleteCustomerRemark,
  deleteJobRemark,
  deleteJobAssignment,
  deleteJobAttachment,
  deleteJobProduct,
  deleteJobService,
  deleteJobStatusLog,
  getAllJobs,
  getDashboardAll,
  getDashboardMy,
  getDashboardTeam,
  getStatsKpisAll,
  getStatsKpisMy,
  getStatsKpisTeam,
  getJobAttachment,
  getJobDetails,
  getJobTimeline,
  getMyJobs,
  getTeamJobs,
  getQuotationDetails,
  getQuotationStatus,
  listQuotationStatusOptions,
  changeQuotationStatus,
  listQuotationStatusLogs,
  getReportAll,
  getReportMy,
  getReportTeam,
  getJobsListReportColumns,
  updateJobsListReportColumns,
  exportJobsListAll,
  exportJobsListMy,
  exportJobsListTeam,
  listCustomerRemarks,
  listJobRemarks,
  listJobAssignments,
  listJobAttachments,
  listJobProducts,
  listJobServices,
  listJobStatusLogs,
  listJobTravelHistory,
  listJobWorkHistory,
  acknowledgeCustomer,
  resolveJob,
  startJobWork,
  startTravel,
  stopJobWork,
  stopTravel,
  updateCustomerRemark,
  updateJobRemark,
  updateFirstResponse,
  updateJobAssignment,
  updateJobAttachment,
  updateJobProduct,
  updateJobService,
  updateJobStatusLog,
  updateJob
};
