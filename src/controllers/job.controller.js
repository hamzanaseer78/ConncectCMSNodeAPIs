const jobsWorkflowService = require("../services/jobs-workflow.service");
const jobsAllService = require("../services/jobs-all.service");
const jobsMyService = require("../services/jobs-my.service");

async function createJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.create(req.auth, req.body);
    res.status(201).json(data);
  } catch (err) {
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
    res.status(200).json({ mode: "all", total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function getMyJobs(req, res, next) {
  try {
    const data = await jobsMyService.list(req.auth, req.query);
    res.status(200).json({ mode: "my", total: data.length, data });
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
    const data = await jobsWorkflowService.startJob(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function completeJobWork(req, res, next) {
  try {
    const data = await jobsWorkflowService.completeJob(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function resolveJob(req, res, next) {
  try {
    const data = await jobsWorkflowService.resolveJob(req.auth, req.params.id, req.body || {});
    res.status(200).json(data);
  } catch (err) {
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

async function listCustomerRemarks(req, res, next) {
  try {
    const data = await jobsWorkflowService.listCustomerRemarks(req.auth, req.params.id);
    res.status(200).json({ jobid: Number(req.params.id), total: data.length, data });
  } catch (err) {
    next(err);
  }
}

async function createCustomerRemark(req, res, next) {
  try {
    const data = await jobsWorkflowService.createCustomerRemark(req.auth, req.params.id, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
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

module.exports = {
  assignTechnician,
  closeJob,
  completeJobWork,
  createCustomerRemark,
  createJobAssignment,
  createJobAttachment,
  createJobProduct,
  createJobStatusLog,
  createJob,
  deleteCustomerRemark,
  deleteJobAssignment,
  deleteJobAttachment,
  deleteJobProduct,
  deleteJobStatusLog,
  getAllJobs,
  getDashboardAll,
  getDashboardMy,
  getJobAttachment,
  getJobDetails,
  getJobTimeline,
  getMyJobs,
  getQuotationDetails,
  getReportAll,
  getReportMy,
  listCustomerRemarks,
  listJobAssignments,
  listJobAttachments,
  listJobProducts,
  listJobStatusLogs,
  listJobTravelHistory,
  listJobWorkHistory,
  acknowledgeCustomer,
  resolveJob,
  startJobWork,
  startTravel,
  stopTravel,
  updateCustomerRemark,
  updateFirstResponse,
  updateJobAssignment,
  updateJobAttachment,
  updateJobProduct,
  updateJobStatusLog,
  updateJob
};
