const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { assertResourceRight } = require("../middlewares/authorization.middleware");

const FACE_APPROVAL_RESOURCE = "faceapproval";

const STATUS_PENDING = "pending";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";

const USER_SELECT = {
  userid: true,
  name: true,
  email: true,
  usertype: true,
  profileimage: true,
  allowfaceapprovalrequest: true,
  faceattendanceenabled: true
};

const REQUEST_INCLUDE = {
  users: { select: USER_SELECT },
  reviewer: { select: { userid: true, name: true, email: true } }
};

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function buildScope(auth) {
  return {
    tenantid: Number(auth.tenantid),
    branchid: Number(auth.branchid)
  };
}

async function assertBranchInTenant(branchid, tenantid) {
  const branch = await prisma.branches.findFirst({
    where: { branchid: Number(branchid), tenantid: Number(tenantid) },
    select: { branchid: true }
  });
  if (!branch) {
    throw clientError("Branch does not belong to your organization", 403);
  }
}

async function assertUserInBranch(userid, tenantid, branchid) {
  const membership = await prisma.userorganizations.findFirst({
    where: {
      userid: Number(userid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      isblocked: false
    },
    select: { recno: true }
  });
  if (!membership) {
    throw clientError("User is not assigned to this branch", 403);
  }
}

async function assertFaceApprovalView(auth) {
  await assertResourceRight(auth, FACE_APPROVAL_RESOURCE, "view");
}

async function assertFaceApprovalManage(auth) {
  await assertResourceRight(auth, FACE_APPROVAL_RESOURCE, "update");
}

function parseBoolean(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw clientError(`${label} must be a boolean`);
}

function parseImageUrl(value, label = "requestImage") {
  const url = value == null ? "" : String(value).trim();
  if (!url) {
    throw clientError(`${label} is required`);
  }
  return url;
}

function mapReviewer(reviewer) {
  if (!reviewer) return null;
  return {
    userid: reviewer.userid,
    name: reviewer.name ?? null,
    email: reviewer.email ?? null
  };
}

function mapRequestRow(row) {
  const user = row.users ?? null;
  return {
    requestId: row.recno,
    userid: row.userid,
    tenantid: row.tenantid,
    branchid: row.branchid,
    status: row.status,
    requestImage: row.requestimage,
    profileImage: user?.profileimage ?? row.profileimagesnapshot ?? null,
    profileImageSnapshot: row.profileimagesnapshot ?? null,
    remarks: row.remarks ?? null,
    reviewRemarks: row.reviewremarks ?? null,
    submittedAt: row.submittedat,
    reviewedAt: row.reviewedat ?? null,
    reviewedBy: mapReviewer(row.reviewer),
    user: user
      ? {
          userid: user.userid,
          name: user.name ?? null,
          email: user.email ?? null,
          usertype: user.usertype ?? null,
          profileImage: user.profileimage ?? null,
          allowFaceApprovalRequest: user.allowfaceapprovalrequest === true,
          faceAttendanceEnabled: user.faceattendanceenabled === true
        }
      : null
  };
}

function mapUserFaceSettings(user) {
  return {
    userid: user.userid,
    name: user.name ?? null,
    email: user.email ?? null,
    usertype: user.usertype ?? null,
    profileImage: user.profileimage ?? null,
    allowFaceApprovalRequest: user.allowfaceapprovalrequest === true,
    faceAttendanceEnabled: user.faceattendanceenabled === true
  };
}

class FaceApprovalService {
  buildScope(auth) {
    return buildScope(auth);
  }

  async loadBranchSettings(scope) {
    const row = await prisma.faceapprovalsettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid }
    });
    return {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      isEnabled: row?.isenabled === true
    };
  }

  async getSettings(auth) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalView(auth);
    return this.loadBranchSettings(scope);
  }

  async saveSettings(auth, body = {}) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalManage(auth);

    const isEnabled = parseBoolean(
      body.isEnabled ?? body.isenabled,
      "isEnabled"
    );
    if (isEnabled === undefined) {
      throw clientError("isEnabled is required");
    }

    const now = utcNow();
    const uid = Number(auth.userid);
    const existing = await prisma.faceapprovalsettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid }
    });

    if (existing) {
      await prisma.faceapprovalsettings.update({
        where: { recno: existing.recno },
        data: {
          isenabled: isEnabled,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    } else {
      await prisma.faceapprovalsettings.create({
        data: {
          ...scope,
          isenabled: isEnabled,
          createdby: uid,
          createdat: now,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    }

    return this.loadBranchSettings(scope);
  }

  async getUserSettings(auth, userid) {
    const scope = this.buildScope(auth);
    const targetUserid = Number(userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalView(auth);
    await assertUserInBranch(targetUserid, scope.tenantid, scope.branchid);

    const user = await prisma.users.findUnique({
      where: { userid: targetUserid },
      select: USER_SELECT
    });
    if (!user) {
      throw clientError("User not found", 404);
    }

    return mapUserFaceSettings(user);
  }

  async saveUserSettings(auth, userid, body = {}) {
    const scope = this.buildScope(auth);
    const targetUserid = Number(userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalManage(auth);
    await assertUserInBranch(targetUserid, scope.tenantid, scope.branchid);

    const allowFaceApprovalRequest = parseBoolean(
      body.allowFaceApprovalRequest ?? body.allowfaceapprovalrequest,
      "allowFaceApprovalRequest"
    );
    const faceAttendanceEnabled = parseBoolean(
      body.faceAttendanceEnabled ?? body.faceattendanceenabled,
      "faceAttendanceEnabled"
    );

    if (allowFaceApprovalRequest === undefined && faceAttendanceEnabled === undefined) {
      throw clientError("Provide allowFaceApprovalRequest and/or faceAttendanceEnabled");
    }

    const updateData = {
      lastupdatedby: Number(auth.userid),
      lastupdatedat: utcNow()
    };
    if (allowFaceApprovalRequest !== undefined) {
      updateData.allowfaceapprovalrequest = allowFaceApprovalRequest;
      if (allowFaceApprovalRequest === false && faceAttendanceEnabled === undefined) {
        updateData.faceattendanceenabled = false;
      }
    }
    if (faceAttendanceEnabled !== undefined) {
      updateData.faceattendanceenabled = faceAttendanceEnabled;
    }

    const user = await prisma.users.update({
      where: { userid: targetUserid },
      data: updateData,
      select: USER_SELECT
    });

    return mapUserFaceSettings(user);
  }

  async getMyStatus(auth) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);

    const [branchSettings, user, pendingRequest, latestRequest] = await Promise.all([
      this.loadBranchSettings(scope),
      prisma.users.findUnique({
        where: { userid },
        select: USER_SELECT
      }),
      prisma.faceapprovalrequests.findFirst({
        where: {
          ...scope,
          userid,
          status: STATUS_PENDING
        },
        orderBy: { submittedat: "desc" },
        include: REQUEST_INCLUDE
      }),
      prisma.faceapprovalrequests.findFirst({
        where: { ...scope, userid },
        orderBy: { submittedat: "desc" },
        include: REQUEST_INCLUDE
      })
    ]);

    if (!user) {
      throw clientError("User not found", 404);
    }

    return {
      branchSettings,
      user: mapUserFaceSettings(user),
      canSubmitRequest:
        branchSettings.isEnabled === true &&
        user.allowfaceapprovalrequest === true &&
        !pendingRequest,
      pendingRequest: pendingRequest ? mapRequestRow(pendingRequest) : null,
      latestRequest: latestRequest ? mapRequestRow(latestRequest) : null
    };
  }

  async submitRequest(auth, body = {}) {
    const scope = this.buildScope(auth);
    const userid = Number(auth.userid);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertUserInBranch(userid, scope.tenantid, scope.branchid);

    const branchSettings = await this.loadBranchSettings(scope);
    if (!branchSettings.isEnabled) {
      throw clientError("Face approval is disabled for this branch");
    }

    const user = await prisma.users.findUnique({
      where: { userid },
      select: USER_SELECT
    });
    if (!user) {
      throw clientError("User not found", 404);
    }
    if (user.allowfaceapprovalrequest !== true) {
      throw clientError("You are not allowed to submit face approval requests");
    }
    if (!user.profileimage) {
      throw clientError("Set a profile image before submitting a face approval request");
    }

    const existingPending = await prisma.faceapprovalrequests.findFirst({
      where: { ...scope, userid, status: STATUS_PENDING }
    });
    if (existingPending) {
      throw clientError("You already have a pending face approval request");
    }

    const requestImage = parseImageUrl(
      body.requestImage ?? body.requestimage ?? body.imageUrl
    );
    const remarks =
      body.remarks != null && String(body.remarks).trim() !== ""
        ? String(body.remarks).trim()
        : null;
    const now = utcNow();

    const created = await prisma.$transaction(async (tx) => {
      if (user.faceattendanceenabled === true) {
        await tx.users.update({
          where: { userid },
          data: {
            faceattendanceenabled: false,
            lastupdatedby: userid,
            lastupdatedat: now
          }
        });
      }

      return tx.faceapprovalrequests.create({
        data: {
          userid,
          ...scope,
          requestimage: requestImage,
          profileimagesnapshot: user.profileimage,
          status: STATUS_PENDING,
          remarks,
          submittedat: now,
          createdat: now
        },
        include: REQUEST_INCLUDE
      });
    });

    return {
      message: "Face approval request submitted",
      request: mapRequestRow(created)
    };
  }

  async listRequests(auth, query = {}) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalView(auth);

    const statusRaw =
      query.status != null && String(query.status).trim() !== ""
        ? String(query.status).trim().toLowerCase()
        : null;
    if (
      statusRaw &&
      ![STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED].includes(statusRaw)
    ) {
      throw clientError("status must be pending, approved, or rejected");
    }

    const userid =
      query.userid != null && query.userid !== "" ? Number(query.userid) : null;
    if (userid != null && !Number.isFinite(userid)) {
      throw clientError("userid must be a number");
    }

    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.limit) || 25, 1), 100);

    const where = { ...scope };
    if (statusRaw) where.status = statusRaw;
    if (userid) where.userid = userid;

    const [total, rows] = await Promise.all([
      prisma.faceapprovalrequests.count({ where }),
      prisma.faceapprovalrequests.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { submittedat: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      filters: {
        status: statusRaw,
        userid
      },
      data: rows.map(mapRequestRow),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0
      }
    };
  }

  async listPending(auth, query = {}) {
    return this.listRequests(auth, { ...query, status: STATUS_PENDING });
  }

  async getRequest(auth, requestId) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalView(auth);

    const row = await prisma.faceapprovalrequests.findFirst({
      where: { ...scope, recno: Number(requestId) },
      include: REQUEST_INCLUDE
    });
    if (!row) {
      throw clientError("Face approval request not found", 404);
    }
    return mapRequestRow(row);
  }

  async approveRequest(auth, requestId, body = {}) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalManage(auth);

    const now = utcNow();
    const reviewerId = Number(auth.userid);
    const reviewRemarks =
      body.reviewRemarks ?? body.reviewremarks ?? body.remarks ?? null;

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.faceapprovalrequests.findFirst({
        where: { ...scope, recno: Number(requestId) },
        include: REQUEST_INCLUDE
      });
      if (!request) {
        throw clientError("Face approval request not found", 404);
      }
      if (request.status !== STATUS_PENDING) {
        throw clientError(`Request is already ${request.status}`);
      }

      const row = await tx.faceapprovalrequests.update({
        where: { recno: request.recno },
        data: {
          status: STATUS_APPROVED,
          reviewedat: now,
          reviewedby: reviewerId,
          reviewremarks:
            reviewRemarks != null && String(reviewRemarks).trim() !== ""
              ? String(reviewRemarks).trim()
              : null
        },
        include: REQUEST_INCLUDE
      });

      await tx.users.update({
        where: { userid: request.userid },
        data: {
          faceattendanceenabled: true,
          lastupdatedby: reviewerId,
          lastupdatedat: now
        }
      });

      await tx.faceapprovalrequests.updateMany({
        where: {
          ...scope,
          userid: request.userid,
          status: STATUS_PENDING,
          recno: { not: request.recno }
        },
        data: {
          status: STATUS_REJECTED,
          reviewedat: now,
          reviewedby: reviewerId,
          reviewremarks: "Superseded by another approved request"
        }
      });

      return row;
    });

    return {
      message: "Face approval request approved",
      request: mapRequestRow(updated)
    };
  }

  async rejectRequest(auth, requestId, body = {}) {
    const scope = this.buildScope(auth);
    await assertBranchInTenant(scope.branchid, scope.tenantid);
    await assertFaceApprovalManage(auth);

    const reviewRemarks = body.reviewRemarks ?? body.reviewremarks ?? body.remarks;
    if (reviewRemarks == null || String(reviewRemarks).trim() === "") {
      throw clientError("reviewRemarks is required when rejecting a request");
    }

    const now = utcNow();
    const reviewerId = Number(auth.userid);

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.faceapprovalrequests.findFirst({
        where: { ...scope, recno: Number(requestId) },
        include: REQUEST_INCLUDE
      });
      if (!request) {
        throw clientError("Face approval request not found", 404);
      }
      if (request.status !== STATUS_PENDING) {
        throw clientError(`Request is already ${request.status}`);
      }

      return tx.faceapprovalrequests.update({
        where: { recno: request.recno },
        data: {
          status: STATUS_REJECTED,
          reviewedat: now,
          reviewedby: reviewerId,
          reviewremarks: String(reviewRemarks).trim()
        },
        include: REQUEST_INCLUDE
      });
    });

    return {
      message: "Face approval request rejected",
      request: mapRequestRow(updated)
    };
  }

  /** Used by attendance check-in/out when method=face. */
  async assertFaceAttendanceAllowed(userid) {
    const user = await prisma.users.findUnique({
      where: { userid: Number(userid) },
      select: { faceattendanceenabled: true, isactive: true, isdeleted: true }
    });
    if (!user || user.isactive === false || user.isdeleted === true) {
      throw clientError("User not found", 404);
    }
    if (user.faceattendanceenabled !== true) {
      throw clientError(
        "Face attendance is not approved. Submit a face approval request and wait for approval."
      );
    }
  }
}

module.exports = new FaceApprovalService();
module.exports.STATUS_PENDING = STATUS_PENDING;
module.exports.STATUS_APPROVED = STATUS_APPROVED;
module.exports.STATUS_REJECTED = STATUS_REJECTED;
