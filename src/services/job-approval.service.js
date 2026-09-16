const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");
const approvalRepo = require("./job-approval.repository");

const MAX_LEVELS = 4;
const STATUS_PENDING = "pending";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";
const APPROVAL_DEPLOY_HINT =
  "Job approval is not available on this server. Deploy the latest code, run: npx prisma migrate deploy && npx prisma generate (Node.js 18+), then restart the API.";

function schemaDefinesApprovalModels() {
  try {
    const { Prisma } = require("@prisma/client");
    return Prisma.dmmf.datamodel.models.some((m) => m.name === "jobapprovalsettings");
  } catch {
    return false;
  }
}

function approvalModelsReady() {
  return approvalRepo.prismaModelsReady();
}

async function checkApprovalTablesExist() {
  try {
    await prisma.$queryRaw`SELECT 1 AS ok FROM "jobapprovalsettings" LIMIT 1`;
    return true;
  } catch (err) {
    const msg = String(err.message || "");
    if (err.code === "42P01" || /does not exist/i.test(msg)) {
      return false;
    }
    return true;
  }
}

async function getApprovalDiagnostics() {
  const clientReady = approvalModelsReady();
  const schemaHasModels = schemaDefinesApprovalModels();
  const schemaFileHasModels = approvalRepo.schemaFileHasApprovalModels();
  const rawMode = approvalRepo.useRawStore();
  let tablesExist = false;
  try {
    tablesExist = await checkApprovalTablesExist();
  } catch {
    tablesExist = false;
  }

  const nodeVersion = process.version;
  const nodeOk = Number(process.versions.node.split(".")[0]) >= 18;

  let fix = APPROVAL_DEPLOY_HINT;
  if (!tablesExist) {
    fix =
      "Database tables missing. Run: npx prisma migrate deploy (then npx prisma generate and restart).";
  } else if (!schemaFileHasModels) {
    fix =
      "Approval tables exist but prisma/schema.prisma on the server is outdated. Run git pull to deploy the latest code, then npx prisma generate and restart.";
  } else if (!clientReady && !nodeOk) {
    fix = `Prisma client was not regenerated (Node ${nodeVersion}; Prisma 6 needs Node 18+). Run: npx prisma generate using Node 18+, then restart. Approval is using SQL fallback until then.`;
  } else if (!clientReady) {
    fix =
      "Tables exist but Prisma client is outdated. Run: npx prisma generate && restart the API. Approval is using SQL fallback until then.";
  } else if (rawMode) {
    fix = "Running in SQL fallback mode. Run: npx prisma generate && restart for full Prisma support.";
  }

  const ready = tablesExist && (clientReady || schemaFileHasModels);

  return {
    clientReady,
    schemaHasModels,
    schemaFileHasModels,
    tablesExist,
    rawMode,
    nodeVersion,
    nodeOk,
    ready,
    fix
  };
}

function clampLevelCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_LEVELS, Math.max(1, Math.floor(n)));
}

function mapApproverUser(row) {
  return {
    userid: row.userid,
    name: row.users?.name ?? null,
    email: row.users?.email ?? null
  };
}

function mapLevel(level) {
  return {
    levelno: level.levelno,
    levelname: level.levelname,
    approvers: (level.approvers || []).map(mapApproverUser)
  };
}

/** Job existed before approval was turned on for this branch (no workflow record). */
function isPreApprovalJob(job, settingsRow) {
  if (!settingsRow?.isenabled) return false;
  const cutoff = settingsRow.lastupdatedat || settingsRow.createdat;
  if (!cutoff) return true;
  const jobTime = job?.date ? new Date(job.date) : null;
  if (!jobTime || Number.isNaN(jobTime.getTime())) return true;
  return jobTime < new Date(cutoff);
}

function approvedThroughLevel(request, settings) {
  if (!request) return null;
  if (request.status === STATUS_APPROVED) {
    return request.levelcount ?? settings?.levelcount ?? null;
  }
  const completed = (request.actions || [])
    .filter((a) => a.action === "approve")
    .map((a) => a.levelno);
  if (!completed.length) return request.status === STATUS_PENDING ? 0 : null;
  return Math.max(...completed);
}

class JobApprovalService {
  buildScope(auth) {
    return {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    };
  }

  isApprovalAvailable() {
    return approvalModelsReady();
  }

  async assertApprovalAvailable() {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      const err = new Error(diagnostics.fix);
      err.status = 503;
      err.diagnostics = diagnostics;
      throw err;
    }
  }

  unavailableApprovalState(diagnostics = null) {
    const message = diagnostics?.fix || APPROVAL_DEPLOY_HINT;
    return {
      required: false,
      status: "not_configured",
      message,
      diagnostics,
      isenabled: false,
      levelcount: 0,
      levels: [],
      actions: []
    };
  }

  async getDiagnostics(auth) {
    const diagnostics = await getApprovalDiagnostics();
    return {
      ...diagnostics,
      tenantid: Number(auth?.tenantid),
      branchid: Number(auth?.branchid)
    };
  }

  async ensureAdmin(auth) {
    await serviceContainer.getAuthService().ensureAdmin(auth.userid, auth.tenantid, auth.branchid);
  }

  async ensureBranchMember(userid, tenantid, branchid) {
    const membership = await prisma.userorganizations.findFirst({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        isblocked: { not: true }
      }
    });
    if (!membership) {
      const err = new Error(`User ${userid} is not a member of this branch`);
      err.status = 400;
      throw err;
    }
  }

  validateLevelsInput(levelcount, levels) {
    if (!Array.isArray(levels) || levels.length !== levelcount) {
      const err = new Error(`Exactly ${levelcount} level(s) required in levels array`);
      err.status = 400;
      throw err;
    }

    const seen = new Set();
    levels.forEach((level, index) => {
      const levelno = Number(level.levelno ?? index + 1);
      if (levelno < 1 || levelno > levelcount) {
        const err = new Error(`levelno must be between 1 and ${levelcount}`);
        err.status = 400;
        throw err;
      }
      if (seen.has(levelno)) {
        const err = new Error(`Duplicate levelno: ${levelno}`);
        err.status = 400;
        throw err;
      }
      seen.add(levelno);

      const userids = Array.isArray(level.userids)
        ? level.userids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      if (!userids.length) {
        const err = new Error(`Level ${levelno} requires at least one approver (userids)`);
        err.status = 400;
        throw err;
      }
      level._levelno = levelno;
      level._levelname =
        level.levelname != null && String(level.levelname).trim() !== ""
          ? String(level.levelname).trim()
          : `Level ${levelno}`;
      level._userids = [...new Set(userids)];
    });
  }

  async loadSettingsRow(scope) {
    return approvalRepo.loadSettingsRow(scope);
  }

  formatSettings(row) {
    if (!row) {
      return {
        isenabled: false,
        levelcount: 1,
        levels: []
      };
    }
    return {
      recno: row.recno,
      isenabled: row.isenabled === true,
      levelcount: row.levelcount,
      levels: row.levels.map(mapLevel),
      lastupdatedat: row.lastupdatedat
    };
  }

  async getSettings(auth) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      return this.unavailableApprovalState(diagnostics);
    }
    const scope = this.buildScope(auth);
    const row = await this.loadSettingsRow(scope);
    return this.formatSettings(row);
  }

  async saveSettings(auth, body = {}) {
    await this.assertApprovalAvailable();
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    const levelcount = clampLevelCount(body.levelcount ?? 1);
    const isenabled = body.isenabled === true || body.isenabled === "true" || body.isenabled === 1;
    const levels = body.levels || [];

    this.validateLevelsInput(levelcount, levels);

    for (const level of levels) {
      for (const uid of level._userids) {
        await this.ensureBranchMember(uid, scope.tenantid, scope.branchid);
      }
    }

    const now = utcNow();
    const uid = Number(auth.userid);

    const saved = await approvalRepo.saveSettings(scope, {
      isenabled,
      levelcount,
      levels,
      uid,
      now
    });

    const row = await approvalRepo.loadSettingsRowById(saved);

    return {
      message: "Job approval settings saved",
      settings: this.formatSettings(row)
    };
  }

  async getActiveRequest(jobid, scope) {
    return approvalRepo.getActiveRequest(jobid, scope);
  }

  async getLatestRequest(jobid, scope) {
    return approvalRepo.getLatestRequest(jobid, scope);
  }

  formatGrandfatheredApproval(settings) {
    const levelcount = settings?.levelcount ?? 0;
    const levels = (settings?.levels || []).map((level) => ({
      ...level,
      status: "approved"
    }));
    return {
      required: true,
      status: "approved",
      preApproval: true,
      message: "Job created before approval was enabled; all levels treated as approved.",
      currentlevel: levelcount || null,
      approvedThroughLevel: levelcount || null,
      levelcount,
      levels,
      actions: []
    };
  }

  formatRequest(request, settings, { job, settingsRow } = {}) {
    if (!request) {
      if (settings?.isenabled && job && settingsRow && isPreApprovalJob(job, settingsRow)) {
        return this.formatGrandfatheredApproval(settings);
      }
      return {
        required: settings?.isenabled === true,
        status: settings?.isenabled ? "not_submitted" : "disabled",
        currentlevel: null,
        approvedThroughLevel: null,
        levelcount: settings?.levelcount ?? 0,
        levels: settings?.levels ?? [],
        actions: []
      };
    }

    const completedLevels = (request.actions || [])
      .filter((a) => a.action === "approve")
      .map((a) => a.levelno);

    const levelsProgress = (settings?.levels || []).map((level) => ({
      ...level,
      status: completedLevels.includes(level.levelno)
        ? "approved"
        : request.status === STATUS_PENDING && request.currentlevel === level.levelno
          ? "current"
          : request.status === STATUS_REJECTED && request.currentlevel === level.levelno
            ? "rejected"
            : "pending"
    }));

    return {
      required: true,
      requestid: request.recno,
      jobid: request.jobid,
      status: request.status,
      currentlevel: request.currentlevel,
      approvedThroughLevel: approvedThroughLevel(request, settings),
      levelcount: request.levelcount,
      submittedby: request.submittedby,
      submittedByName: request.users_jobapprovalrequests_submittedbyTousers?.name ?? null,
      submittedat: request.submittedat,
      completedat: request.completedat,
      rejectedby: request.rejectedby,
      rejectedByName: request.users_jobapprovalrequests_rejectedbyTousers?.name ?? null,
      rejectedat: request.rejectedat,
      rejectremarks: request.rejectremarks,
      levels: levelsProgress,
      actions: (request.actions || []).map((a) => ({
        recno: a.recno,
        levelno: a.levelno,
        levelname: a.levelname,
        action: a.action,
        remarks: a.remarks,
        actedat: a.actedat,
        userid: a.userid,
        userName: a.users?.name ?? null
      }))
    };
  }

  resolveApprovalForJob(job, settingsRow, request) {
    const settings = this.formatSettings(settingsRow);
    return this.formatRequest(request, settings, { job, settingsRow });
  }

  /** Approval block for GET /api/jobs/:id and list rows. */
  async getApprovalForJob(auth, job) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      return this.unavailableApprovalState(diagnostics);
    }
    const scope = this.buildScope(auth);
    const settingsRow = await this.loadSettingsRow(scope);
    const request = await this.getLatestRequest(job.recno, scope);
    return this.resolveApprovalForJob(
      { recno: job.recno, date: job.date },
      settingsRow,
      request
    );
  }

  /** Batch approval summaries for job list APIs. */
  async getApprovalSummariesForJobs(auth, jobs) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      const unavailable = this.unavailableApprovalState(diagnostics);
      return new Map(jobs.map((j) => [Number(j.recno), unavailable]));
    }
    if (!jobs.length) return new Map();

    const scope = this.buildScope(auth);
    const settingsRow = await this.loadSettingsRow(scope);
    const settings = this.formatSettings(settingsRow);
    const jobIds = jobs.map((j) => Number(j.recno));
    const requestMap = await approvalRepo.getLatestRequestsForJobs(jobIds, scope);

    const map = new Map();
    for (const job of jobs) {
      const jobid = Number(job.recno);
      const request = requestMap.get(jobid) || null;
      map.set(jobid, this.resolveApprovalForJob({ recno: jobid, date: job.date }, settingsRow, request));
    }
    return map;
  }

  async getJobApproval(auth, jobId) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      return this.unavailableApprovalState(diagnostics);
    }
    const scope = this.buildScope(auth);
    const job = await prisma.job.findFirst({
      where: { recno: Number(jobId), ...scope },
      select: { recno: true, date: true }
    });
    if (!job) {
      const err = new Error("Job not found");
      err.status = 404;
      throw err;
    }

    return this.getApprovalForJob(auth, job);
  }

  async submit(auth, jobId, remarks) {
    await this.assertApprovalAvailable();
    const scope = this.buildScope(auth);
    const settingsRow = await this.loadSettingsRow(scope);
    const settings = this.formatSettings(settingsRow);

    if (!settings.isenabled) {
      const err = new Error("Job approval is not enabled for this branch");
      err.status = 400;
      throw err;
    }

    const job = await prisma.job.findFirst({ where: { recno: Number(jobId), ...scope } });
    if (!job) {
      const err = new Error("Job not found");
      err.status = 404;
      throw err;
    }

    const pending = await this.getActiveRequest(jobId, scope);
    if (pending) {
      const err = new Error("Job already has a pending approval request");
      err.status = 409;
      throw err;
    }

    const now = utcNow();
    const request = await approvalRepo.createRequest({
      jobid: Number(jobId),
      ...scope,
      status: STATUS_PENDING,
      currentlevel: 1,
      levelcount: settings.levelcount,
      submittedby: Number(auth.userid),
      submittedat: now
    });

    if (remarks && String(remarks).trim()) {
      await approvalRepo.createAction({
        requestid: request.recno,
        levelno: 0,
        levelname: "Submitted",
        userid: Number(auth.userid),
        action: "submit",
        remarks: String(remarks).trim(),
        actedat: now
      });
    }

    return this.getJobApproval(auth, jobId);
  }

  async assertCanApprove(auth, request, settings) {
    if (!request || request.status !== STATUS_PENDING) {
      const err = new Error("No pending approval request for this job");
      err.status = 400;
      throw err;
    }

    const level = settings.levels.find((l) => l.levelno === request.currentlevel);
    if (!level) {
      const err = new Error("Invalid approval level configuration");
      err.status = 500;
      throw err;
    }

    const canApprove = level.approvers.some((a) => Number(a.userid) === Number(auth.userid));
    if (!canApprove) {
      const err = new Error(
        `You are not an approver for level ${request.currentlevel} (${level.levelname})`
      );
      err.status = 403;
      throw err;
    }

    const already = await approvalRepo.findApproveAction(
      request.recno,
      request.currentlevel,
      Number(auth.userid)
    );
    if (already) {
      const err = new Error("You have already approved this level");
      err.status = 409;
      throw err;
    }

    return level;
  }

  async approve(auth, jobId, { remarks } = {}) {
    await this.assertApprovalAvailable();
    const scope = this.buildScope(auth);
    const settings = this.formatSettings(await this.loadSettingsRow(scope));
    let request = await this.getActiveRequest(jobId, scope);
    if (!request) {
      const err = new Error("No pending approval request");
      err.status = 400;
      throw err;
    }

    const level = await this.assertCanApprove(auth, request, settings);
    const now = utcNow();

    await approvalRepo.createAction({
      requestid: request.recno,
      levelno: request.currentlevel,
      levelname: level.levelname,
      userid: Number(auth.userid),
      action: "approve",
      remarks: remarks ? String(remarks).trim() : null,
      actedat: now
    });

    if (request.currentlevel >= request.levelcount) {
      await approvalRepo.updateRequest(request.recno, {
        status: STATUS_APPROVED,
        currentlevel: request.levelcount,
        completedat: now
      });
    } else {
      await approvalRepo.updateRequest(request.recno, {
        currentlevel: request.currentlevel + 1
      });
    }

    return this.getJobApproval(auth, jobId);
  }

  async reject(auth, jobId, { remarks } = {}) {
    await this.assertApprovalAvailable();
    const scope = this.buildScope(auth);
    const settings = this.formatSettings(await this.loadSettingsRow(scope));
    const request = await this.getActiveRequest(jobId, scope);
    if (!request) {
      const err = new Error("No pending approval request");
      err.status = 400;
      throw err;
    }

    await this.assertCanApprove(auth, request, settings);

    const now = utcNow();
    const level = settings.levels.find((l) => l.levelno === request.currentlevel);

    await approvalRepo.rejectRequest(request, {
      requestid: request.recno,
      levelno: request.currentlevel,
      levelname: level?.levelname ?? `Level ${request.currentlevel}`,
      userid: Number(auth.userid),
      remarks: remarks ? String(remarks).trim() : null,
      actedat: now
    });

    return this.getJobApproval(auth, jobId);
  }

  async listPending(auth) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      return { total: 0, data: [], message: diagnostics.fix, diagnostics };
    }
    const scope = this.buildScope(auth);
    const settings = this.formatSettings(await this.loadSettingsRow(scope));
    if (!settings.isenabled) {
      return { total: 0, data: [] };
    }

    const requests = (await approvalRepo.listPendingRequests(scope)).map((r) =>
      approvalRepo.mapPendingRow(r)
    );

    const data = requests
      .filter((request) => {
        const level = settings.levels.find((l) => l.levelno === request.currentlevel);
        return level?.approvers?.some((a) => Number(a.userid) === Number(auth.userid));
      })
      .map((request) => {
        const level = settings.levels.find((l) => l.levelno === request.currentlevel);
        return {
          requestid: request.recno,
          jobid: request.jobid,
          job: request.job,
          currentlevel: request.currentlevel,
          currentLevelName: level?.levelname ?? null,
          levelcount: request.levelcount,
          submittedat: request.submittedat,
          submittedby: request.submittedby
        };
      });

    return { total: data.length, data };
  }

  /** Submit for approval when branch settings are enabled (called after job create). */
  async maybeSubmitOnCreate(auth, jobId) {
    const diagnostics = await getApprovalDiagnostics();
    if (!diagnostics.ready) {
      return this.unavailableApprovalState(diagnostics);
    }
    const scope = this.buildScope(auth);
    const settingsRow = await this.loadSettingsRow(scope);
    const settings = this.formatSettings(settingsRow);
    if (!settingsRow?.isenabled) {
      return this.formatRequest(null, settings, { settingsRow });
    }

    const job = await prisma.job.findFirst({
      where: { recno: Number(jobId), ...scope },
      select: { recno: true, date: true }
    });
    if (job && isPreApprovalJob(job, settingsRow)) {
      return this.formatGrandfatheredApproval(settings);
    }

    const existing = await this.getActiveRequest(jobId, scope);
    if (existing) {
      return this.getJobApproval(auth, jobId);
    }

    await this.submit(auth, jobId, "Auto-submitted on job creation");
    return this.getJobApproval(auth, jobId);
  }
}

module.exports = new JobApprovalService();
