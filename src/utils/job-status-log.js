const JOB_STATUS_LOG_INCLUDE = {
  include: {
    users: { select: { userid: true, name: true, email: true } },
    jobstatuses_jobstatuslog_fromstatusTojobstatuses: { select: { recno: true, title: true } },
    jobstatuses_jobstatuslog_tostatusTojobstatuses: { select: { recno: true, title: true } }
  }
};

function jobStatusTitle(statusRow) {
  if (!statusRow?.title) {
    return null;
  }
  const title = String(statusRow.title).trim();
  return title || null;
}

function formatJobStatusLogRow(row) {
  if (!row) {
    return null;
  }

  const changedUser = row.users ?? null;

  return {
    recno: row.recno,
    jobid: row.jobid ?? null,
    tenantid: row.tenantid ?? null,
    branchid: row.branchid ?? null,
    fromStatus: row.fromstatus ?? null,
    fromStatusName: jobStatusTitle(row.jobstatuses_jobstatuslog_fromstatusTojobstatuses),
    toStatus: row.tostatus ?? null,
    toStatusName: jobStatusTitle(row.jobstatuses_jobstatuslog_tostatusTojobstatuses),
    remarks: row.remarks ?? null,
    changedby: row.changedby ?? null,
    changedByName: changedUser?.name ?? null,
    changedByEmail: changedUser?.email ?? null,
    changedat: row.changedat ?? null
  };
}

module.exports = {
  JOB_STATUS_LOG_INCLUDE,
  jobStatusTitle,
  formatJobStatusLogRow
};
