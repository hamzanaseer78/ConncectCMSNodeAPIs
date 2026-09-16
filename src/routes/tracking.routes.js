const express = require("express");
const authenticateJwt = require("../middlewares/auth.middleware");
const trackingController = require("../controllers/user-tracking.controller");
const attendanceController = require("../controllers/user-attendance.controller");
const faceApprovalController = require("../controllers/face-approval.controller");

const router = express.Router();

router.use(authenticateJwt);
router.use(trackingController.requireAuthContext);

router.post("/ping", trackingController.postPing);
router.get("/live", trackingController.getLive);
router.get("/technicians/summary", trackingController.getTechniciansSummary);
router.get("/technicians/:userid/detail", trackingController.getTechnicianDetail);

router.get("/attendance/me", attendanceController.getMyStatus);
router.get("/attendance/me/history", attendanceController.listMyAttendance);
router.post("/attendance/check-in", attendanceController.checkIn);
router.post("/attendance/check-out", attendanceController.checkOut);
router.post("/attendance/break-in", attendanceController.breakIn);
router.post("/attendance/break-out", attendanceController.breakOut);
router.get("/attendance/users", attendanceController.listBranchUsers);
router.get("/attendance/logs", attendanceController.getSessionLogs);

router.get("/face-approval/settings", faceApprovalController.getSettings);
router.put("/face-approval/settings", faceApprovalController.saveSettings);
router.get("/face-approval/users/:userid/settings", faceApprovalController.getUserSettings);
router.put("/face-approval/users/:userid/settings", faceApprovalController.saveUserSettings);
router.get("/face-approval/me", faceApprovalController.getMyStatus);
router.post("/face-approval/requests", faceApprovalController.submitRequest);
router.get("/face-approval/requests/pending", faceApprovalController.listPending);
router.get("/face-approval/requests", faceApprovalController.listRequests);
router.get("/face-approval/requests/:requestId", faceApprovalController.getRequest);
router.post("/face-approval/requests/:requestId/approve", faceApprovalController.approveRequest);
router.post("/face-approval/requests/:requestId/reject", faceApprovalController.rejectRequest);

module.exports = router;
