const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const jobController = require("../controllers/job.controller");

const router = express.Router();

router.use(authenticateJwt);

router.post("/", jobController.createJob);
router.put("/:id", jobController.updateJob);

router.get("/:id/details", jobController.getJobDetails);
router.get("/:id/quotation", jobController.getQuotationDetails);
router.get("/:id/timeline", jobController.getJobTimeline);

router.post("/:id/actions/assign", jobController.assignTechnician);
router.post("/:id/actions/start-travel", jobController.startTravel);
router.post("/:id/actions/stop-travel", jobController.stopTravel);
router.post("/:id/actions/start-job", jobController.startJobWork);
router.post("/:id/actions/complete-job", jobController.completeJobWork);
router.post("/:id/actions/resolve-job", jobController.resolveJob);
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

router.get("/:id/customer-remarks", jobController.listCustomerRemarks);
router.post("/:id/customer-remarks", jobController.createCustomerRemark);
router.put("/:id/customer-remarks/:remarkId", jobController.updateCustomerRemark);
router.delete("/:id/customer-remarks/:remarkId", jobController.deleteCustomerRemark);

module.exports = router;
