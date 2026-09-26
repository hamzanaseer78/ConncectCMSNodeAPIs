const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");
const {
  DEFAULT_SEQUENCE_PAD_WIDTH,
  DEFAULT_SEPARATOR,
  MAX_CODE_ALLOCATION_ATTEMPTS,
  branchNameToDefaultPrefix,
  normalizePrefix,
  normalizePostfix,
  normalizeSeparator,
  parseSequenceInput,
  formatSequenceNumber,
  formatJobCode,
  parseSequenceFromJobCode,
  buildCodePatternPrefix
} = require("../utils/job-code-format");

const JOB_CODE_SETTINGS_MIGRATION_HINT =
  "Run: npx prisma migrate deploy (20260926120000_add_jobcodesettings), then npx prisma generate and restart the API.";

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

let jobCodeSettingsTableReadyCache;

function isMissingJobCodeSettingsTableError(err) {
  const msg = String(err?.message || "");
  return (
    err?.code === "P2021" ||
    err?.code === "42P01" ||
    (/jobcodesettings/i.test(msg) && /does not exist/i.test(msg))
  );
}

async function isJobCodeSettingsTableReady() {
  if (jobCodeSettingsTableReadyCache === false) return false;
  if (jobCodeSettingsTableReadyCache === true) return true;
  try {
    await prisma.$queryRaw`SELECT 1 AS ok FROM "jobcodesettings" LIMIT 1`;
    jobCodeSettingsTableReadyCache = true;
    return true;
  } catch (err) {
    if (isMissingJobCodeSettingsTableError(err)) {
      jobCodeSettingsTableReadyCache = false;
      return false;
    }
    throw err;
  }
}

async function loadBranchName(scope) {
  const branch = await prisma.branches.findFirst({
    where: { branchid: scope.branchid, tenantid: scope.tenantid },
    select: { name: true }
  });
  return branch?.name ?? null;
}

function settingsFromRow(row, defaultPrefix) {
  if (!row) {
    return {
      prefix: defaultPrefix,
      postfix: "",
      separator: DEFAULT_SEPARATOR,
      nextSequenceNumber: 1,
      sequencePadWidth: DEFAULT_SEQUENCE_PAD_WIDTH,
      hasSavedRow: false
    };
  }
  return {
    prefix: row.prefix ?? defaultPrefix,
    postfix: row.postfix ?? "",
    separator: row.separator ?? DEFAULT_SEPARATOR,
    nextSequenceNumber: Math.max(Number(row.nextsequencenumber) || 1, 1),
    sequencePadWidth: Math.max(Number(row.sequencepadwidth) || DEFAULT_SEQUENCE_PAD_WIDTH, 1),
    hasSavedRow: true,
    settingsRecno: row.recno
  };
}

function formatSettingsResponse(scope, effective, preview = {}) {
  const nextSequence = formatSequenceNumber(
    effective.nextSequenceNumber,
    effective.sequencePadWidth
  );
  return {
    tenantid: scope.tenantid,
    branchid: scope.branchid,
    prefix: effective.prefix,
    postfix: effective.postfix,
    separator: effective.separator,
    nextSequenceNumber: effective.nextSequenceNumber,
    sequencePadWidth: effective.sequencePadWidth,
    nextSequence,
    defaultPrefixFromBranch: preview.defaultPrefixFromBranch ?? effective.prefix,
    nextCode: preview.nextCode ?? null,
    lastUpdatedAt: preview.lastUpdatedAt ?? null,
    usingLegacyNumericCodes: preview.usingLegacyNumericCodes === true
  };
}

async function resolveEffectiveSettings(tx, scope) {
  const defaultPrefix = branchNameToDefaultPrefix(await loadBranchName(scope));
  const tableReady = await isJobCodeSettingsTableReady();
  if (!tableReady) {
    return {
      ...settingsFromRow(null, defaultPrefix),
      defaultPrefixFromBranch: defaultPrefix,
      useLegacyNumeric: true
    };
  }

  const row = await tx.jobcodesettings.findFirst({
    where: { tenantid: scope.tenantid, branchid: scope.branchid }
  });

  const effective = settingsFromRow(row, defaultPrefix);
  return {
    ...effective,
    defaultPrefixFromBranch: defaultPrefix,
    settingsRow: row,
    useLegacyNumeric: false
  };
}

async function inferMaxSequenceFromExistingJobs(tx, tenantid, effective) {
  const pattern = buildCodePatternPrefix(effective);
  const rows = await tx.job.findMany({
    where: {
      tenantid: Number(tenantid),
      code: { startsWith: pattern }
    },
    select: { code: true }
  });

  let max = 0;
  rows.forEach((row) => {
    const parsed = parseSequenceFromJobCode(row.code, effective);
    if (parsed != null && parsed > max) max = parsed;
  });
  return max;
}

async function computeLegacyNumericNextCode(tx, tenantid) {
  const rows = await tx.$queryRaw`
    SELECT MAX(code) AS max_code
    FROM job
    WHERE tenantid = ${tenantid} AND code IS NOT NULL
  `;
  const maxCode = rows?.[0]?.max_code != null ? String(rows[0].max_code) : null;
  const maxNum = maxCode && /^\d+$/.test(maxCode) ? Number(maxCode) : 0;
  const nextNum = maxNum + 1;
  const nextCode = String(nextNum).padStart(6, "0");
  return { maxCode, maxNum, nextCode, nextNum, usingLegacyNumericCodes: true };
}

async function findNextFormattedJobCode(tx, scope, effective, options = {}) {
  const persistCounter = options.persistCounter !== false;
  let sequence = Math.max(Number(effective.nextSequenceNumber) || 1, 1);

  const maxFromJobs = await inferMaxSequenceFromExistingJobs(tx, scope.tenantid, effective);
  if (maxFromJobs >= sequence) {
    sequence = maxFromJobs + 1;
  }

  let chosenCode = null;
  let chosenSequence = sequence;

  for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const candidate = formatJobCode({
      prefix: effective.prefix,
      separator: effective.separator,
      sequenceNumber: sequence,
      sequencePadWidth: effective.sequencePadWidth,
      postfix: effective.postfix
    });

    const existing = await tx.job.findFirst({
      where: { tenantid: scope.tenantid, code: candidate },
      select: { recno: true }
    });

    if (!existing) {
      chosenCode = candidate;
      chosenSequence = sequence;
      break;
    }
    sequence += 1;
  }

  if (!chosenCode) {
    throw clientError("Unable to allocate a unique job code", 409);
  }

  if (persistCounter && (await isJobCodeSettingsTableReady())) {
    const nextAfterUse = chosenSequence + 1;
    const now = utcNow();
    const uid = options.userid != null ? Number(options.userid) : null;

    if (effective.settingsRow?.recno) {
      await tx.jobcodesettings.update({
        where: { recno: effective.settingsRow.recno },
        data: {
          prefix: effective.prefix,
          postfix: effective.postfix,
          separator: effective.separator,
          nextsequencenumber: nextAfterUse,
          sequencepadwidth: effective.sequencePadWidth,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    } else {
      await tx.jobcodesettings.create({
        data: {
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          prefix: effective.prefix,
          postfix: effective.postfix ?? "",
          separator: effective.separator ?? DEFAULT_SEPARATOR,
          nextsequencenumber: nextAfterUse,
          sequencepadwidth: effective.sequencePadWidth,
          createdby: uid,
          createdat: now,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
    }
  }

  return {
    nextCode: chosenCode,
    nextNum: chosenSequence,
    nextSequenceNumber: chosenSequence,
    maxCode: null,
    maxNum: chosenSequence - 1,
    prefix: effective.prefix,
    postfix: effective.postfix,
    separator: effective.separator,
    sequencePadWidth: effective.sequencePadWidth,
    usingLegacyNumericCodes: false
  };
}

async function acquireJobCodeLock(tx, tenantid) {
  const lockKey = BigInt(900000000) + BigInt(tenantid);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
}

class JobCodeSettingsService {
  buildScope(auth) {
    return buildScope(auth);
  }

  async assertBranchInTenant(scope) {
    const branch = await prisma.branches.findFirst({
      where: { branchid: scope.branchid, tenantid: scope.tenantid },
      select: { branchid: true }
    });
    if (!branch) {
      throw clientError("Branch does not belong to your organization", 403);
    }
  }

  async ensureAdmin(auth) {
    await serviceContainer.getAuthService().ensureAdmin(auth.userid, auth.tenantid, auth.branchid);
  }

  async loadSettingsRow(scope) {
    if (!(await isJobCodeSettingsTableReady())) return null;
    return prisma.jobcodesettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid }
    });
  }

  async previewNextCodeInTransaction(tx, scope) {
    await acquireJobCodeLock(tx, scope.tenantid);
    const effective = await resolveEffectiveSettings(tx, scope);
    if (effective.useLegacyNumeric) {
      return computeLegacyNumericNextCode(tx, scope.tenantid);
    }
    return findNextFormattedJobCode(tx, scope, effective, { persistCounter: false });
  }

  async allocateNextJobCodeInTransaction(tx, scope, auth = null) {
    await acquireJobCodeLock(tx, scope.tenantid);
    const effective = await resolveEffectiveSettings(tx, scope);
    if (effective.useLegacyNumeric) {
      const legacy = await computeLegacyNumericNextCode(tx, scope.tenantid);
      return legacy.nextCode;
    }
    const result = await findNextFormattedJobCode(tx, scope, effective, {
      persistCounter: true,
      userid: auth?.userid
    });
    return result.nextCode;
  }

  async previewNextCode(auth) {
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);
    return prisma.$transaction(async (tx) => this.previewNextCodeInTransaction(tx, scope));
  }

  async getSettings(auth) {
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);

    if (!(await isJobCodeSettingsTableReady())) {
      const defaultPrefix = branchNameToDefaultPrefix(await loadBranchName(scope));
      const effective = settingsFromRow(null, defaultPrefix);
      const legacyPreview = await prisma.$transaction(async (tx) =>
        computeLegacyNumericNextCode(tx, scope.tenantid)
      );
      return formatSettingsResponse(scope, effective, {
        defaultPrefixFromBranch: defaultPrefix,
        nextCode: legacyPreview.nextCode,
        usingLegacyNumericCodes: true,
        migrationHint: JOB_CODE_SETTINGS_MIGRATION_HINT
      });
    }

    const row = await this.loadSettingsRow(scope);
    const defaultPrefix = branchNameToDefaultPrefix(await loadBranchName(scope));
    const effective = settingsFromRow(row, defaultPrefix);
    const preview = await this.previewNextCode(auth);

    return formatSettingsResponse(scope, effective, {
      defaultPrefixFromBranch: defaultPrefix,
      nextCode: preview.nextCode,
      lastUpdatedAt: row?.lastupdatedat ?? null,
      usingLegacyNumericCodes: false
    });
  }

  async saveSettings(auth, body = {}) {
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);

    if (!(await isJobCodeSettingsTableReady())) {
      throw clientError(`Job code settings are not available. ${JOB_CODE_SETTINGS_MIGRATION_HINT}`, 503);
    }

    const defaultPrefix = branchNameToDefaultPrefix(await loadBranchName(scope));
    const existing = await this.loadSettingsRow(scope);

    const prefixRaw = body.prefix ?? body.codePrefix;
    const prefix =
      prefixRaw !== undefined && prefixRaw !== null
        ? normalizePrefix(prefixRaw)
        : existing?.prefix ?? defaultPrefix;
    if (!prefix) {
      throw clientError("prefix is required");
    }

    const postfix =
      body.postfix !== undefined || body.codePostfix !== undefined
        ? normalizePostfix(body.postfix ?? body.codePostfix)
        : existing?.postfix ?? "";

    const separator =
      body.separator !== undefined ? normalizeSeparator(body.separator) : existing?.separator ?? DEFAULT_SEPARATOR;

    let nextSequenceNumber =
      existing?.nextsequencenumber != null ? Number(existing.nextsequencenumber) : 1;
    let sequencePadWidth =
      existing?.sequencepadwidth != null
        ? Number(existing.sequencepadwidth)
        : DEFAULT_SEQUENCE_PAD_WIDTH;

    const sequenceInput =
      body.nextSequence ?? body.nextSequenceNumber ?? body.sequence ?? body.sequencenumber;
    if (sequenceInput !== undefined && sequenceInput !== null && String(sequenceInput).trim() !== "") {
      const parsed = parseSequenceInput(sequenceInput, sequencePadWidth);
      nextSequenceNumber = parsed.nextSequenceNumber;
      sequencePadWidth = parsed.sequencePadWidth;
    }

    if (body.sequencePadWidth !== undefined || body.sequencepadwidth !== undefined) {
      const w = Number(body.sequencePadWidth ?? body.sequencepadwidth);
      if (!Number.isFinite(w) || w < 1 || w > 12) {
        throw clientError("sequencePadWidth must be between 1 and 12");
      }
      sequencePadWidth = Math.trunc(w);
    }

    nextSequenceNumber = Math.max(Math.trunc(nextSequenceNumber), 1);

    const now = utcNow();
    const uid = Number(auth.userid);
    const data = {
      prefix,
      postfix,
      separator,
      nextsequencenumber: nextSequenceNumber,
      sequencepadwidth: sequencePadWidth,
      lastupdatedby: uid,
      lastupdatedat: now
    };

    if (existing) {
      await prisma.jobcodesettings.update({
        where: { recno: existing.recno },
        data
      });
    } else {
      await prisma.jobcodesettings.create({
        data: {
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          ...data,
          createdby: uid,
          createdat: now
        }
      });
    }

    const saved = await this.loadSettingsRow(scope);
    const effective = settingsFromRow(saved, defaultPrefix);
    const preview = await this.previewNextCode(auth);

    return {
      message: "Job code settings saved",
      settings: formatSettingsResponse(scope, effective, {
        defaultPrefixFromBranch: defaultPrefix,
        nextCode: preview.nextCode,
        lastUpdatedAt: saved?.lastupdatedat ?? null
      })
    };
  }
}

module.exports = new JobCodeSettingsService();
module.exports.acquireJobCodeLock = acquireJobCodeLock;
module.exports.isJobCodeSettingsTableReady = isJobCodeSettingsTableReady;
module.exports.JOB_CODE_SETTINGS_MIGRATION_HINT = JOB_CODE_SETTINGS_MIGRATION_HINT;
