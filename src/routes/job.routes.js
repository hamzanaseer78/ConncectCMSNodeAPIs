const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const { uploadJobActionFiles } = require("../middlewares/upload.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.get("/next-code", jobController.getNextJobCode);
router.get("/quotation-statuses", jobController.listQuotationStatusOptions);
router.get("/quotation/settings", jobController.getQuotationSettings);
router.put("/quotation/settings", jobController.saveQuotationSettings);
router.get("/form/settings", jobController.getFormSettings);
router.put("/form/settings", jobController.saveFormSettings);
router.get("/erp-products/dropdown", jobController.getErpProductsDropdown);
router.get("/cash/settings", jobController.getCashSettings);
router.put("/cash/settings", jobController.saveCashSettings);
router.get("/cash/expenses/pending", jobController.listJobPendingExpensesAll);
router.get("/cash/collections/pending", jobController.listJobPendingCollectionsAll);
router.get("/cash/collections", jobController.listJobCollectionsAll);
router.get("/cpair/overview", jobController.getJobCpairOverview);
router.get("/cpair/summaries", jobController.listJobCpairSummaries);
router.post("/cpair/summaries/:summaryId/receive", jobController.receiveJobCpair);
router.post("/cpair/summaries/:summaryId/issue", jobController.issueJobCpair);
router.delete("/cpair/summaries/:summaryId", jobController.deleteJobCpairSummary);
router.delete("/cpair/parts/:partId", jobController.deleteJobCpairPart);
router.get("/cpair/summaries/:summaryId", jobController.getJobCpairSummaryDetail);
router.post("/", jobController.createJob);

router.get("/approval/status", jobController.getApprovalDiagnostics);
router.get("/approval/settings", jobController.getApprovalSettings);
router.put("/approval/settings", jobController.saveApprovalSettings);
router.get("/approval/pending", jobController.listPendingApprovals);

router.get("/:id", jobController.getJob);
router.put("/:id", jobController.updateJob);

router.get("/:id/approval", jobController.getJobApproval);
router.post("/:id/approval/submit", jobController.submitJobApproval);
router.post("/:id/approval/approve", jobController.approveJob);
router.post("/:id/approval/reject", jobController.rejectJob);

router.get("/:id/details", jobController.getJobDetails);
router.get("/:id/quotation", jobController.getQuotationDetails);
router.get("/:id/quotation-status", jobController.getQuotationStatus);
router.post("/:id/quotation-status", jobController.changeQuotationStatus);
router.get("/:id/quotation-status-logs", jobController.listQuotationStatusLogs);
router.get("/:id/timeline", jobController.getJobTimeline);

router.post("/:id/actions/assign", jobController.assignTechnician);
router.post("/:id/actions/assign-follow-up", jobController.assignFollowUpBy);
router.post("/:id/actions/start-travel", jobController.startTravel);
router.post("/:id/actions/stop-travel", jobController.stopTravel);
router.post("/:id/actions/start-job", uploadJobActionFiles, jobController.startJobWork);
router.post("/:id/actions/stop-job", uploadJobActionFiles, jobController.stopJobWork);
router.post("/:id/actions/complete-job", uploadJobActionFiles, jobController.completeJobWork);
router.post("/:id/actions/resolve-job", uploadJobActionFiles, jobController.resolveJob);
router.post("/:id/actions/close-job", jobController.closeJob);
router.post("/:id/actions/first-response", jobController.updateFirstResponse);
router.post("/:id/actions/acknowledge", jobController.acknowledgeCustomer);

router.get("/:id/attachments", jobController.listJobAttachments);
router.post("/:id/attachments", jobController.createJobAttachment);
router.get("/:id/attachments/:attachmentId", jobController.getJobAttachment);
router.put("/:id/attachments/:attachmentId", jobController.updateJobAttachment);
router.delete("/:id/attachments/:attachmentId", jobController.deleteJobAttachment);

router.get("/:id/assignments", jobController.listJobAssignments);
router.post("/:id/assignments", jobController.createJobAssignment);
router.put("/:id/assignments/:assignmentId", jobController.updateJobAssignment);
router.delete("/:id/assignments/:assignmentId", jobController.deleteJobAssignment);

router.get("/:id/status-logs", jobController.listJobStatusLogs);
router.post("/:id/status-logs", jobController.createJobStatusLog);
router.put("/:id/status-logs/:statusLogId", jobController.updateJobStatusLog);
router.delete("/:id/status-logs/:statusLogId", jobController.deleteJobStatusLog);

router.get("/:id/travel-history", jobController.listJobTravelHistory);
router.get("/:id/work-history", jobController.listJobWorkHistory);

router.get("/:id/products", jobController.listJobProducts);
router.post("/:id/products", jobController.createJobProduct);
router.put("/:id/products/:productLineId", jobController.updateJobProduct);
router.delete("/:id/products/:productLineId", jobController.deleteJobProduct);

router.get("/:id/services", jobController.listJobServices);
router.post("/:id/services", jobController.createJobService);
router.put("/:id/services/:serviceLineId", jobController.updateJobService);
router.delete("/:id/services/:serviceLineId", jobController.deleteJobService);

router.get("/:id/remarks", jobController.listJobRemarks);
router.post("/:id/remarks", jobController.createJobRemark);
router.put("/:id/remarks/:remarkId", jobController.updateJobRemark);
router.delete("/:id/remarks/:remarkId", jobController.deleteJobRemark);

router.get("/:id/customer-remarks", jobController.listCustomerRemarks);
router.post("/:id/customer-remarks", jobController.createCustomerRemark);

router.get("/:id/customer-feedback", jobController.getCustomerFeedback);
router.put("/:id/customer-feedback", jobController.saveCustomerFeedback);
router.put("/:id/customer-remarks/:remarkId", jobController.updateCustomerRemark);
router.delete("/:id/customer-remarks/:remarkId", jobController.deleteCustomerRemark);

router.get("/:id/cash/collection", jobController.getJobCollection);
router.put("/:id/cash/collection", jobController.saveJobCollection);
router.get("/:id/cash/expenses", jobController.listJobExpenses);
router.post("/:id/cash/expenses", jobController.createJobExpense);
router.put("/:id/cash/expenses", jobController.syncJobExpenses);
router.put("/:id/cash/expenses/:expenseId", jobController.updateJobExpense);
router.delete("/:id/cash/expenses/:expenseId", jobController.deleteJobExpense);

router.get("/:id/cpair/schema", jobController.getJobCpairSchema);
router.post("/:id/cpair", jobController.createJobCpair);
router.put("/:id/cpair", jobController.updateJobCpair);

module.exports = router;
