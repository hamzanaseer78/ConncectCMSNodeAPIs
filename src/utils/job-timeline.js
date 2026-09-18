const USER_SELECT = { select: { userid: true, name: true, email: true } };

const JOB_ASSIGNMENT_LOG_INCLUDE = {
  include: {
    users_jobassignmentlog_useridTousers: USER_SELECT,
    users_jobassignmentlog_assignedbyTousers: USER_SELECT
  }
};

const JOB_TRAVEL_HISTORY_INCLUDE = {
  include: {
    users: USER_SELECT
  }
};

const JOB_WORK_HISTORY_INCLUDE = {
  include: {
    users: USER_SELECT
  }
};

const JOB_DETAIL_CREATED_SELECT = {
  createdat: true,
  createdby: true,
  users_jobdetails_createdbyTousers: USER_SELECT
};

function pickUserName(user) {
  return user?.name ?? null;
}

function buildJobCreatedByFields(detail) {
  if (!detail) {
    return {
      createdBy: null,
      createdByName: null,
      createdAt: null
    };
  }

  return {
    createdBy: detail.createdby ?? null,
    createdByName: pickUserName(detail.users_jobdetails_createdbyTousers),
    createdAt: detail.createdat ?? null
  };
}

function buildJobCreatedEvent(detail, createdAt, toTimelineIso) {
  if (!createdAt) {
    return null;
  }
  const { createdBy, createdByName } = buildJobCreatedByFields(detail);
  return {
    type: "JOB_CREATED",
    at: toTimelineIso(createdAt),
    remarks: "Job created",
    createdBy,
    createdByName
  };
}

function buildAssignmentEvent(row, toTimelineIso) {
  return {
    type: "TECHNICIAN_ASSIGNED",
    at: toTimelineIso(row.assignedat),
    remarks: row.remarks ?? null,
    userid: row.userid ?? null,
    userName: pickUserName(row.users_jobassignmentlog_useridTousers),
    assignedBy: row.assignedby ?? null,
    assignedByName: pickUserName(row.users_jobassignmentlog_assignedbyTousers)
  };
}

function buildStatusChangedEvent(row, formatted, toTimelineIso) {
  if (!formatted) {
    return null;
  }
  return {
    type: "STATUS_CHANGED",
    at: toTimelineIso(row.changedat),
    remarks: formatted.remarks,
    fromStatus: formatted.fromStatus,
    fromStatusName: formatted.fromStatusName,
    toStatus: formatted.toStatus,
    toStatusName: formatted.toStatusName,
    changedby: formatted.changedby,
    changedByName: formatted.changedByName,
    userName: formatted.changedByName
  };
}

function buildQuotationStatusChangedEvent(row, formatted, toTimelineIso) {
  if (!formatted) {
    return null;
  }
  return {
    type: "QUOTATION_STATUS_CHANGED",
    at: toTimelineIso(row.changedat),
    remarks: formatted.remarks,
    fromStatus: formatted.fromStatus,
    fromStatusName: formatted.fromStatusName,
    toStatus: formatted.toStatus,
    toStatusName: formatted.toStatusName,
    changedby: formatted.changedby,
    changedByName: formatted.changedByName,
    userName: formatted.changedByName,
    quotedById: formatted.quotedById ?? null,
    quotedByName: formatted.quotedByName ?? null
  };
}

function buildTravelEvent(type, row, at, toTimelineIso) {
  if (!at) {
    return null;
  }
  return {
    type,
    at: toTimelineIso(at),
    remarks: row.remarks ?? null,
    userid: row.traveledby ?? null,
    userName: pickUserName(row.users),
    travelHistoryId: row.recno ?? null
  };
}

function buildWorkEvent(type, row, at, toTimelineIso) {
  if (!at) {
    return null;
  }
  return {
    type,
    at: toTimelineIso(at),
    remarks: row.remarks ?? null,
    userid: row.workedby ?? null,
    userName: pickUserName(row.users),
    workHistoryId: row.recno ?? null
  };
}

function buildAttachmentEvent(row, toTimelineIso) {
  if (!row.addedat) {
    return null;
  }
  const formatted = row.users
    ? { name: row.users.name, email: row.users.email }
    : null;
  return {
    type: "ATTACHMENT_ADDED",
    at: toTimelineIso(row.addedat),
    remarks: row.remarks ?? null,
    userid: row.addedby ?? null,
    userName: formatted?.name ?? null,
    addedby: row.addedby ?? null,
    addedByName: formatted?.name ?? null,
    attachmentId: row.recno,
    attachmentname: row.attachmentname ?? null,
    url: row.url ?? null
  };
}

module.exports = {
  USER_SELECT,
  JOB_ASSIGNMENT_LOG_INCLUDE,
  JOB_TRAVEL_HISTORY_INCLUDE,
  JOB_WORK_HISTORY_INCLUDE,
  JOB_DETAIL_CREATED_SELECT,
  buildJobCreatedByFields,
  buildJobCreatedEvent,
  buildAssignmentEvent,
  buildStatusChangedEvent,
  buildQuotationStatusChangedEvent,
  buildTravelEvent,
  buildWorkEvent,
  buildAttachmentEvent
};
