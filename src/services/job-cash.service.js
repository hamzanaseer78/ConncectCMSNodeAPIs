const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const serviceContainer = require("../utils/service-container");

function getJobsWorkflowService() {
  return require("./jobs-workflow.service");
}
const {
  parseBoolean,
  parseAmount,
  parseOptionalText,
  parseExpenseDescription,
  parseExpenseInput,
  parseExpenseLinesFromBody,
  isJobCompletedOrResolved,
  formatSettingsRow,
  formatCollectionRow,
  formatExpenseRow,
  formatExpensesResponse
} = require("../utils/job-cash");

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

class JobCashService {
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
    return prisma.jobcashsettings.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid }
    });
  }

  formatSettings(row) {
    return formatSettingsRow(row);
  }

  async getSettings(auth) {
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);
    const row = await this.loadSettingsRow(scope);
    return this.formatSettings(row);
  }

  async saveSettings(auth, body = {}) {
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await this.assertBranchInTenant(scope);

    const allowReceiveCollection = parseBoolean(
      body.allowReceiveCollection ?? body.allowreceivecollection,
      "allowReceiveCollection"
    );
    const allowAddExpenses = parseBoolean(
      body.allowAddExpenses ?? body.allowaddexpenses,
      "allowAddExpenses"
    );

    if (allowReceiveCollection === undefined && allowAddExpenses === undefined) {
      throw clientError("At least one of allowReceiveCollection or allowAddExpenses is required");
    }

    const now = utcNow();
    const uid = Number(auth.userid);
    const existing = await this.loadSettingsRow(scope);
    const data = {
      lastupdatedby: uid,
      lastupdatedat: now
    };

    if (allowReceiveCollection !== undefined) {
      data.allowreceivecollection = allowReceiveCollection;
    }
    if (allowAddExpenses !== undefined) {
      data.allowaddexpenses = allowAddExpenses;
    }

    if (existing) {
      await prisma.jobcashsettings.update({
        where: { recno: existing.recno },
        data
      });
    } else {
      await prisma.jobcashsettings.create({
        data: {
          ...scope,
          allowreceivecollection: allowReceiveCollection ?? false,
          allowaddexpenses: allowAddExpenses ?? false,
          createdby: uid,
          createdat: now,
          ...data
        }
      });
    }

    const saved = await this.loadSettingsRow(scope);
    const userActivityLogService = require("./user-activity-log.service");
    await userActivityLogService.logSafe(auth, {
      module: "jobcashsettings",
      action: "settings_updated",
      entityName: "Job cash settings",
      summary: "Job cash settings saved",
      metadata: this.formatSettings(saved)
    });
    return {
      message: "Job cash settings saved",
      settings: this.formatSettings(saved)
    };
  }

  assertCollectionEnabled(settingsRow) {
    if (settingsRow?.allowreceivecollection !== true) {
      throw clientError("Cash collection is not enabled for this branch", 403);
    }
  }

  assertExpensesEnabled(settingsRow) {
    if (settingsRow?.allowaddexpenses !== true) {
      throw clientError("Job expenses are not enabled for this branch", 403);
    }
  }

  assertJobEligibleForCash(job) {
    if (!isJobCompletedOrResolved(job)) {
      throw clientError(
        "Cash collection and expenses are only allowed after the job is completed or resolved",
        409
      );
    }
  }

  async getJobForCashMutation(auth, jobId) {
    const jobsWorkflowService = getJobsWorkflowService();
    const job = await jobsWorkflowService.getScopedJob(auth, jobId);
    await jobsWorkflowService.ensureAssignedUser(auth, job);
    this.assertJobEligibleForCash(job);
    return job;
  }

  async getJobForCashRead(auth, jobId) {
    const jobsWorkflowService = getJobsWorkflowService();
    const job = await jobsWorkflowService.getScopedJob(auth, jobId);
    await jobsWorkflowService.ensureAssignedUser(auth, job);
    return job;
  }

  async getCollection(auth, jobId) {
    const scope = this.buildScope(auth);
    await this.getJobForCashRead(auth, jobId);
    const row = await prisma.jobcollections.findFirst({
      where: { jobid: Number(jobId), ...scope }
    });
    return {
      settings: this.formatSettings(await this.loadSettingsRow(scope)),
      collection: formatCollectionRow(row)
    };
  }

  async saveCollection(auth, jobId, body = {}) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    this.assertCollectionEnabled(settings);

    const job = await this.getJobForCashMutation(auth, jobId);
    const amount = parseAmount(body.amount ?? body.cashReceived ?? body.cashreceived, "amount");
    const remarks = parseOptionalText(body.remarks ?? body.note ?? body.notes);
    const now = utcNow();
    const uid = Number(auth.userid);
    const jobid = Number(jobId);

    const existing = await prisma.jobcollections.findFirst({
      where: { jobid, ...scope }
    });

    const data = {
      amount,
      remarks: remarks === undefined ? undefined : remarks,
      collectedby: uid,
      collectedat: now,
      lastupdatedby: uid,
      lastupdatedat: now
    };

    let saved;
    if (existing) {
      saved = await prisma.jobcollections.update({
        where: { recno: existing.recno },
        data
      });
    } else {
      saved = await prisma.jobcollections.create({
        data: {
          jobid,
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          createdby: uid,
          createdat: now,
          ...data
        }
      });
    }

    return {
      message: existing ? "Job cash collection updated" : "Job cash collection saved",
      collection: formatCollectionRow(saved),
      jobTotalCost: job.totalcost ?? null
    };
  }

  async listExpenses(auth, jobId) {
    const scope = this.buildScope(auth);
    await this.getJobForCashRead(auth, jobId);
    const rows = await prisma.jobexpenses.findMany({
      where: { jobid: Number(jobId), ...scope },
      orderBy: { createdat: "desc" }
    });
    return {
      settings: this.formatSettings(await this.loadSettingsRow(scope)),
      ...formatExpensesResponse(rows)
    };
  }

  async createExpense(auth, jobId, body = {}) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    this.assertExpensesEnabled(settings);
    await this.getJobForCashMutation(auth, jobId);

    const lines = parseExpenseLinesFromBody(body);
    const now = utcNow();
    const uid = Number(auth.userid);
    const jobid = Number(jobId);

    if (lines.length === 1) {
      const { description, amount } = lines[0];
      const saved = await prisma.jobexpenses.create({
        data: {
          jobid,
          tenantid: scope.tenantid,
          branchid: scope.branchid,
          description,
          amount,
          createdby: uid,
          createdat: now,
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });

      const rows = await prisma.jobexpenses.findMany({
        where: { jobid, ...scope },
        orderBy: { createdat: "desc" }
      });

      return {
        message: "Job expense added",
        expense: formatExpenseRow(saved),
        addedCount: 1,
        ...formatExpensesResponse(rows)
      };
    }

    await prisma.jobexpenses.createMany({
      data: lines.map((line) => ({
        jobid,
        tenantid: scope.tenantid,
        branchid: scope.branchid,
        description: line.description,
        amount: line.amount,
        createdby: uid,
        createdat: now,
        lastupdatedby: uid,
        lastupdatedat: now
      }))
    });

    const rows = await prisma.jobexpenses.findMany({
      where: { jobid, ...scope },
      orderBy: { createdat: "desc" }
    });

    return {
      message: `${lines.length} job expenses added`,
      addedCount: lines.length,
      ...formatExpensesResponse(rows)
    };
  }

  async updateExpense(auth, jobId, expenseId, body = {}) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    this.assertExpensesEnabled(settings);
    await this.getJobForCashMutation(auth, jobId);

    const existing = await prisma.jobexpenses.findFirst({
      where: {
        recno: Number(expenseId),
        jobid: Number(jobId),
        ...scope
      }
    });
    if (!existing) {
      throw clientError("Job expense not found", 404);
    }

    const patch = {};
    if (body.description !== undefined) {
      patch.description = parseExpenseDescription(body.description);
    }
    if (body.price !== undefined || body.amount !== undefined) {
      patch.amount = parseAmount(body.price ?? body.amount, "price");
    }
    if (!Object.keys(patch).length) {
      throw clientError("At least one of description or price is required");
    }

    const now = utcNow();
    const uid = Number(auth.userid);
    const saved = await prisma.jobexpenses.update({
      where: { recno: existing.recno },
      data: {
        ...patch,
        lastupdatedby: uid,
        lastupdatedat: now
      }
    });

    const rows = await prisma.jobexpenses.findMany({
      where: { jobid: Number(jobId), ...scope },
      orderBy: { createdat: "desc" }
    });

    return {
      message: "Job expense updated",
      expense: formatExpenseRow(saved),
      ...formatExpensesResponse(rows)
    };
  }

  async deleteExpense(auth, jobId, expenseId) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    this.assertExpensesEnabled(settings);
    await this.getJobForCashMutation(auth, jobId);

    const existing = await prisma.jobexpenses.findFirst({
      where: {
        recno: Number(expenseId),
        jobid: Number(jobId),
        ...scope
      }
    });
    if (!existing) {
      throw clientError("Job expense not found", 404);
    }

    await prisma.jobexpenses.delete({ where: { recno: existing.recno } });

    const rows = await prisma.jobexpenses.findMany({
      where: { jobid: Number(jobId), ...scope },
      orderBy: { createdat: "desc" }
    });

    return {
      message: "Job expense deleted",
      ...formatExpensesResponse(rows)
    };
  }

  async syncExpenses(auth, jobId, body = {}) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    this.assertExpensesEnabled(settings);
    await this.getJobForCashMutation(auth, jobId);

    const rawLines = body.expenses ?? body.items ?? body.lines;
    if (!Array.isArray(rawLines)) {
      throw clientError("expenses array is required");
    }

    const lines = rawLines.map((line, index) => {
      try {
        return parseExpenseInput(line);
      } catch (err) {
        throw clientError(`${err.message} at index ${index}`, err.status || 400);
      }
    });

    const now = utcNow();
    const uid = Number(auth.userid);
    const jobid = Number(jobId);

    await prisma.$transaction(async (tx) => {
      await tx.jobexpenses.deleteMany({ where: { jobid, ...scope } });
      if (lines.length) {
        await tx.jobexpenses.createMany({
          data: lines.map((line) => ({
            jobid,
            tenantid: scope.tenantid,
            branchid: scope.branchid,
            description: line.description,
            amount: line.amount,
            createdby: uid,
            createdat: now,
            lastupdatedby: uid,
            lastupdatedat: now
          }))
        });
      }
    });

    const rows = await prisma.jobexpenses.findMany({
      where: { jobid, ...scope },
      orderBy: { createdat: "desc" }
    });

    return {
      message: "Job expenses saved",
      ...formatExpensesResponse(rows)
    };
  }

  async buildDetailsCashSummary(auth, jobId) {
    const scope = this.buildScope(auth);
    const settings = await this.loadSettingsRow(scope);
    const [collection, expenses] = await Promise.all([
      prisma.jobcollections.findFirst({
        where: { jobid: Number(jobId), ...scope }
      }),
      prisma.jobexpenses.findMany({
        where: { jobid: Number(jobId), ...scope },
        orderBy: { createdat: "desc" }
      })
    ]);

    return {
      cashSettings: this.formatSettings(settings),
      cashCollection: formatCollectionRow(collection),
      jobExpenses: formatExpensesResponse(expenses)
    };
  }
}

module.exports = new JobCashService();
