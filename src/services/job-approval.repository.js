const fs = require("fs");
const path = require("path");
const { Prisma } = require("@prisma/client");
const prisma = require("../database/prisma");

function schemaFileHasApprovalModels() {
  try {
    const schemaPath = path.join(__dirname, "../../prisma/schema.prisma");
    return fs.readFileSync(schemaPath, "utf8").includes("model jobapprovalsettings");
  } catch {
    return false;
  }
}

function prismaModelsReady() {
  return Boolean(
    prisma.jobapprovalsettings?.findFirst &&
    prisma.jobapprovallevels?.findFirst &&
    prisma.jobapprovalrequests?.findFirst
  );
}

function useRawStore() {
  return !prismaModelsReady() && schemaFileHasApprovalModels();
}

async function loadSettingsRowRaw(scope) {
  const rows = await prisma.$queryRaw`
    SELECT recno, tenantid, branchid, isenabled, levelcount, lastupdatedat
    FROM jobapprovalsettings
    WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
    LIMIT 1
  `;
  const settings = rows[0];
  if (!settings) return null;

  const levels = await prisma.$queryRaw`
    SELECT l.recno, l.settingsid, l.levelno, l.levelname
    FROM jobapprovallevels l
    WHERE l.settingsid = ${settings.recno}
    ORDER BY l.levelno ASC
  `;

  const levelIds = levels.map((l) => l.recno);
  let approverRows = [];
  if (levelIds.length) {
    approverRows = await prisma.$queryRaw`
      SELECT lu.levelid, lu.userid, u.name, u.email
      FROM jobapprovallevelusers lu
      JOIN users u ON u.userid = lu.userid
      WHERE lu.levelid IN (${Prisma.join(levelIds)})
    `;
  }

  const approversByLevel = new Map();
  for (const row of approverRows) {
    if (!approversByLevel.has(row.levelid)) approversByLevel.set(row.levelid, []);
    approversByLevel.get(row.levelid).push({
      userid: row.userid,
      users: { userid: row.userid, name: row.name, email: row.email }
    });
  }

  return {
    ...settings,
    levels: levels.map((l) => ({
      ...l,
      approvers: approversByLevel.get(l.recno) || []
    }))
  };
}

async function loadSettingsRowByIdRaw(recno) {
  const rows = await prisma.$queryRaw`
    SELECT recno, tenantid, branchid, isenabled, levelcount, lastupdatedat
    FROM jobapprovalsettings WHERE recno = ${recno} LIMIT 1
  `;
  if (!rows[0]) return null;
  const scope = { tenantid: rows[0].tenantid, branchid: rows[0].branchid };
  return loadSettingsRowRaw(scope);
}

async function saveSettingsRaw(scope, { isenabled, levelcount, levels, uid, now }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw`
      SELECT recno FROM jobapprovalsettings
      WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}
      LIMIT 1
    `;

    let settingsRecno;
    if (existing[0]) {
      settingsRecno = existing[0].recno;
      await tx.$executeRaw`
        UPDATE jobapprovalsettings
        SET isenabled = ${isenabled}, levelcount = ${levelcount},
            lastupdatedby = ${uid}, lastupdatedat = ${now}
        WHERE recno = ${settingsRecno}
      `;
    } else {
      const inserted = await tx.$queryRaw`
        INSERT INTO jobapprovalsettings
          (tenantid, branchid, isenabled, levelcount, createdby, createdat, lastupdatedby, lastupdatedat)
        VALUES
          (${scope.tenantid}, ${scope.branchid}, ${isenabled}, ${levelcount}, ${uid}, ${now}, ${uid}, ${now})
        RETURNING recno
      `;
      settingsRecno = inserted[0].recno;
    }

    await tx.$executeRaw`DELETE FROM jobapprovallevels WHERE settingsid = ${settingsRecno}`;

    for (const level of levels) {
      const created = await tx.$queryRaw`
        INSERT INTO jobapprovallevels
          (settingsid, tenantid, branchid, levelno, levelname, createdat)
        VALUES
          (${settingsRecno}, ${scope.tenantid}, ${scope.branchid}, ${level._levelno}, ${level._levelname}, ${now})
        RETURNING recno
      `;
      const levelId = created[0].recno;
      for (const userid of level._userids) {
        await tx.$executeRaw`
          INSERT INTO jobapprovallevelusers (levelid, userid, tenantid, branchid, createdat)
          VALUES (${levelId}, ${userid}, ${scope.tenantid}, ${scope.branchid}, ${now})
        `;
      }
    }

    return settingsRecno;
  });
}

async function getActiveRequestRaw(jobid, scope) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM jobapprovalrequests
    WHERE jobid = ${Number(jobid)}
      AND tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
      AND status = 'pending'
    ORDER BY recno DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getLatestRequestRaw(jobid, scope) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM jobapprovalrequests
    WHERE jobid = ${Number(jobid)}
      AND tenantid = ${scope.tenantid}
      AND branchid = ${scope.branchid}
    ORDER BY recno DESC
    LIMIT 1
  `;
  const request = rows[0];
  if (!request) return null;

  const actions = await prisma.$queryRaw`
    SELECT a.*, u.name, u.email
    FROM jobapprovalactions a
    JOIN users u ON u.userid = a.userid
    WHERE a.requestid = ${request.recno}
    ORDER BY a.actedat ASC NULLS LAST
  `;

  let submittedBy = null;
  if (request.submittedby) {
    const u = await prisma.$queryRaw`
      SELECT userid, name, email FROM users WHERE userid = ${request.submittedby} LIMIT 1
    `;
    submittedBy = u[0] || null;
  }

  let rejectedBy = null;
  if (request.rejectedby) {
    const u = await prisma.$queryRaw`
      SELECT userid, name, email FROM users WHERE userid = ${request.rejectedby} LIMIT 1
    `;
    rejectedBy = u[0] || null;
  }

  return {
    ...request,
    actions: actions.map((a) => ({
      recno: a.recno,
      requestid: a.requestid,
      levelno: a.levelno,
      levelname: a.levelname,
      userid: a.userid,
      action: a.action,
      remarks: a.remarks,
      actedat: a.actedat,
      users: { userid: a.userid, name: a.name, email: a.email }
    })),
    users_jobapprovalrequests_submittedbyTousers: submittedBy,
    users_jobapprovalrequests_rejectedbyTousers: rejectedBy
  };
}

async function createRequestRaw(data) {
  const rows = await prisma.$queryRaw`
    INSERT INTO jobapprovalrequests
      (jobid, tenantid, branchid, status, currentlevel, levelcount, submittedby, submittedat)
    VALUES
      (${data.jobid}, ${data.tenantid}, ${data.branchid}, ${data.status},
       ${data.currentlevel}, ${data.levelcount}, ${data.submittedby}, ${data.submittedat})
    RETURNING *
  `;
  return rows[0];
}

async function createActionRaw(data) {
  await prisma.$executeRaw`
    INSERT INTO jobapprovalactions
      (requestid, levelno, levelname, userid, action, remarks, actedat)
    VALUES
      (${data.requestid}, ${data.levelno}, ${data.levelname}, ${data.userid},
       ${data.action}, ${data.remarks}, ${data.actedat})
  `;
}

async function updateRequestRaw(recno, data) {
  if (data.status === "approved") {
    await prisma.$executeRaw`
      UPDATE jobapprovalrequests
      SET status = ${data.status}, currentlevel = ${data.currentlevel}, completedat = ${data.completedat}
      WHERE recno = ${recno}
    `;
    return;
  }
  if (data.status === "rejected") {
    await prisma.$executeRaw`
      UPDATE jobapprovalrequests
      SET status = ${data.status}, rejectedby = ${data.rejectedby}, rejectedat = ${data.rejectedat},
          rejectremarks = ${data.rejectremarks}
      WHERE recno = ${recno}
    `;
    return;
  }
  if (data.currentlevel != null) {
    await prisma.$executeRaw`
      UPDATE jobapprovalrequests SET currentlevel = ${data.currentlevel} WHERE recno = ${recno}
    `;
  }
}

async function findApproveActionRaw(requestid, levelno, userid) {
  const rows = await prisma.$queryRaw`
    SELECT recno FROM jobapprovalactions
    WHERE requestid = ${requestid}
      AND levelno = ${levelno}
      AND userid = ${userid}
      AND action = 'approve'
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getLatestRequestsForJobsRaw(jobIds, scope) {
  if (!jobIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ON (r.jobid) r.*
    FROM jobapprovalrequests r
    WHERE r.jobid IN (${Prisma.join(jobIds)})
      AND r.tenantid = ${scope.tenantid}
      AND r.branchid = ${scope.branchid}
    ORDER BY r.jobid, r.recno DESC
  `;
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.jobid), row);
  }
  return map;
}

async function getActionsForRequestIdsRaw(requestIds) {
  if (!requestIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT a.*, u.name, u.email
    FROM jobapprovalactions a
    JOIN users u ON u.userid = a.userid
    WHERE a.requestid IN (${Prisma.join(requestIds)})
    ORDER BY a.actedat ASC NULLS LAST
  `;
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.requestid)) map.set(row.requestid, []);
    map.get(row.requestid).push({
      recno: row.recno,
      requestid: row.requestid,
      levelno: row.levelno,
      levelname: row.levelname,
      userid: row.userid,
      action: row.action,
      remarks: row.remarks,
      actedat: row.actedat,
      users: { userid: row.userid, name: row.name, email: row.email }
    });
  }
  return map;
}

async function listPendingRequestsRaw(scope) {
  return prisma.$queryRaw`
    SELECT r.*,
      j.recno AS job_recno, j.code AS job_code, j.date AS job_date,
      j.customerid AS job_customerid, j.serviceid AS job_serviceid,
      j.priority AS job_priority, j.manualjobno AS job_manualjobno
    FROM jobapprovalrequests r
    JOIN job j ON j.recno = r.jobid
    WHERE r.tenantid = ${scope.tenantid}
      AND r.branchid = ${scope.branchid}
      AND r.status = 'pending'
    ORDER BY r.submittedat ASC NULLS LAST
  `;
}

async function rejectRequestRaw(request, data) {
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO jobapprovalactions
        (requestid, levelno, levelname, userid, action, remarks, actedat)
      VALUES
        (${data.requestid}, ${data.levelno}, ${data.levelname}, ${data.userid},
         'reject', ${data.remarks}, ${data.actedat})
    `,
    prisma.$executeRaw`
      UPDATE jobapprovalrequests
      SET status = 'rejected', rejectedby = ${data.userid}, rejectedat = ${data.actedat},
          rejectremarks = ${data.remarks}
      WHERE recno = ${request.recno}
    `
  ]);
}

module.exports = {
  schemaFileHasApprovalModels,
  prismaModelsReady,
  useRawStore,
  loadSettingsRow(scope) {
    if (useRawStore()) return loadSettingsRowRaw(scope);
    return prisma.jobapprovalsettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid },
      include: {
        levels: {
          orderBy: { levelno: "asc" },
          include: {
            approvers: { include: { users: { select: { userid: true, name: true, email: true } } } }
          }
        }
      }
    });
  },
  loadSettingsRowById(recno) {
    if (useRawStore()) return loadSettingsRowByIdRaw(recno);
    return prisma.jobapprovalsettings.findFirst({
      where: { recno },
      include: {
        levels: {
          orderBy: { levelno: "asc" },
          include: {
            approvers: { include: { users: { select: { userid: true, name: true, email: true } } } }
          }
        }
      }
    });
  },
  saveSettings(scope, payload) {
    if (useRawStore()) return saveSettingsRaw(scope, payload);
    const { isenabled, levelcount, levels, uid, now } = payload;
    return prisma.$transaction(async (tx) => {
      const existing = await tx.jobapprovalsettings.findFirst({
        where: { tenantid: scope.tenantid, branchid: scope.branchid }
      });
      const settings = existing
        ? await tx.jobapprovalsettings.update({
            where: { recno: existing.recno },
            data: { isenabled, levelcount, lastupdatedby: uid, lastupdatedat: now }
          })
        : await tx.jobapprovalsettings.create({
            data: {
              ...scope,
              isenabled,
              levelcount,
              createdby: uid,
              createdat: now,
              lastupdatedby: uid,
              lastupdatedat: now
            }
          });
      await tx.jobapprovallevels.deleteMany({ where: { settingsid: settings.recno } });
      for (const level of levels) {
        const createdLevel = await tx.jobapprovallevels.create({
          data: {
            settingsid: settings.recno,
            tenantid: scope.tenantid,
            branchid: scope.branchid,
            levelno: level._levelno,
            levelname: level._levelname,
            createdat: now
          }
        });
        await tx.jobapprovallevelusers.createMany({
          data: level._userids.map((userid) => ({
            levelid: createdLevel.recno,
            userid,
            tenantid: scope.tenantid,
            branchid: scope.branchid,
            createdat: now
          }))
        });
      }
      return settings.recno;
    });
  },
  getActiveRequest(jobid, scope) {
    if (useRawStore()) return getActiveRequestRaw(jobid, scope);
    return prisma.jobapprovalrequests.findFirst({
      where: {
        jobid: Number(jobid),
        tenantid: scope.tenantid,
        branchid: scope.branchid,
        status: "pending"
      },
      orderBy: { recno: "desc" }
    });
  },
  getLatestRequest(jobid, scope) {
    if (useRawStore()) return getLatestRequestRaw(jobid, scope);
    return prisma.jobapprovalrequests.findFirst({
      where: {
        jobid: Number(jobid),
        tenantid: scope.tenantid,
        branchid: scope.branchid
      },
      orderBy: { recno: "desc" },
      include: {
        actions: {
          orderBy: { actedat: "asc" },
          include: { users: { select: { userid: true, name: true, email: true } } }
        },
        users_jobapprovalrequests_submittedbyTousers: {
          select: { userid: true, name: true, email: true }
        },
        users_jobapprovalrequests_rejectedbyTousers: {
          select: { userid: true, name: true, email: true }
        }
      }
    });
  },
  createRequest(data) {
    if (useRawStore()) return createRequestRaw(data);
    return prisma.jobapprovalrequests.create({ data });
  },
  createAction(data) {
    if (useRawStore()) return createActionRaw(data);
    return prisma.jobapprovalactions.create({ data });
  },
  updateRequest(recno, data) {
    if (useRawStore()) return updateRequestRaw(recno, data);
    return prisma.jobapprovalrequests.update({ where: { recno }, data });
  },
  findApproveAction(requestid, levelno, userid) {
    if (useRawStore()) return findApproveActionRaw(requestid, levelno, userid);
    return prisma.jobapprovalactions.findFirst({
      where: { requestid, levelno, userid, action: "approve" }
    });
  },
  rejectRequest(request, data) {
    if (useRawStore()) return rejectRequestRaw(request, data);
    return prisma.$transaction([
      prisma.jobapprovalactions.create({
        data: {
          requestid: data.requestid,
          levelno: data.levelno,
          levelname: data.levelname,
          userid: data.userid,
          action: "reject",
          remarks: data.remarks,
          actedat: data.actedat
        }
      }),
      prisma.jobapprovalrequests.update({
        where: { recno: request.recno },
        data: {
          status: "rejected",
          rejectedby: data.userid,
          rejectedat: data.actedat,
          rejectremarks: data.remarks
        }
      })
    ]);
  },
  listPendingRequests(scope) {
    if (useRawStore()) return listPendingRequestsRaw(scope);
    return prisma.jobapprovalrequests.findMany({
      where: { ...scope, status: "pending" },
      include: {
        job: {
          select: {
            recno: true,
            code: true,
            date: true,
            customerid: true,
            serviceid: true,
            priority: true,
            manualjobno: true
          }
        }
      },
      orderBy: { submittedat: "asc" }
    });
  },
  async getLatestRequestsForJobs(jobIds, scope) {
    if (!jobIds.length) return new Map();
    if (useRawStore()) {
      const map = await getLatestRequestsForJobsRaw(jobIds, scope);
      const requestIds = [...map.values()].map((r) => r.recno);
      const actionsMap = await getActionsForRequestIdsRaw(requestIds);
      for (const [jobid, request] of map.entries()) {
        request.actions = actionsMap.get(request.recno) || [];
        map.set(jobid, request);
      }
      return map;
    }

    const rows = await prisma.jobapprovalrequests.findMany({
      where: {
        jobid: { in: jobIds.map(Number) },
        tenantid: scope.tenantid,
        branchid: scope.branchid
      },
      orderBy: { recno: "desc" },
      include: {
        actions: {
          orderBy: { actedat: "asc" },
          include: { users: { select: { userid: true, name: true, email: true } } }
        },
        users_jobapprovalrequests_submittedbyTousers: {
          select: { userid: true, name: true, email: true }
        },
        users_jobapprovalrequests_rejectedbyTousers: {
          select: { userid: true, name: true, email: true }
        }
      }
    });

    const map = new Map();
    for (const row of rows) {
      const jobid = Number(row.jobid);
      if (!map.has(jobid)) map.set(jobid, row);
    }
    return map;
  },
  mapPendingRow(request) {
    if (!useRawStore()) return request;
    return {
      recno: request.recno,
      jobid: request.jobid,
      currentlevel: request.currentlevel,
      levelcount: request.levelcount,
      submittedat: request.submittedat,
      submittedby: request.submittedby,
      job: {
        recno: request.job_recno,
        code: request.job_code,
        date: request.job_date,
        customerid: request.job_customerid,
        serviceid: request.job_serviceid,
        priority: request.job_priority,
        manualjobno: request.job_manualjobno
      }
    };
  }
};
