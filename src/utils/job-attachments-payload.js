function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeAttachmentItem(item, index) {
  const label = index != null ? `Attachment #${index + 1}: ` : "";

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw clientError(`${label}must be an object with url (and optional attachmentname, remarks)`);
  }

  const url =
    item.url != null && String(item.url).trim() !== "" ? String(item.url).trim() : null;
  const attachmentname =
    item.attachmentname != null && String(item.attachmentname).trim() !== ""
      ? String(item.attachmentname).trim()
      : item.name != null && String(item.name).trim() !== ""
        ? String(item.name).trim()
        : null;

  if (!url) {
    throw clientError(`${label}url is required`);
  }

  const remarks =
    item.remarks != null && String(item.remarks).trim() !== ""
      ? String(item.remarks).trim()
      : null;

  return {
    url,
    attachmentname: attachmentname || url.split("/").pop() || "attachment",
    remarks
  };
}

function pickAttachmentList(payload = {}) {
  const raw =
    payload.attachments ??
    payload.Attachments ??
    (payload.attachment != null ? [payload.attachment] : null);

  if (raw == null || raw === "") {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw clientError("attachments must be an array");
  }

  return raw.map((item, i) => normalizeAttachmentItem(item, i));
}

function formatJobAttachmentRow(row) {
  if (!row) return null;
  return {
    recno: row.recno,
    jobid: row.jobid,
    attachmentname: row.attachmentname ?? null,
    url: row.url ?? null,
    remarks: row.remarks ?? null,
    addedby: row.addedby ?? null,
    addedByName: row.users?.name ?? null,
    addedByEmail: row.users?.email ?? null,
    addedat: row.addedat ?? null
  };
}

const JOB_ATTACHMENT_USER_SELECT = {
  select: { userid: true, name: true, email: true }
};

const JOB_ATTACHMENT_INCLUDE = {
  orderBy: { addedat: "desc" },
  include: {
    users: JOB_ATTACHMENT_USER_SELECT
  }
};

module.exports = {
  pickAttachmentList,
  normalizeAttachmentItem,
  formatJobAttachmentRow,
  JOB_ATTACHMENT_INCLUDE,
  JOB_ATTACHMENT_USER_SELECT,
  clientError
};
