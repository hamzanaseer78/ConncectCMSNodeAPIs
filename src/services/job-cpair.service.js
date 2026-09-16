const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const jobsWorkflowService = require("./jobs-workflow.service");
const jobQuotationSettingsService = require("./job-quotation-settings.service");
const { canManageBranchJobs } = require("../utils/job-access");
const { buildJobHierarchyFields } = require("../utils/job-response-labels");
const {
  clientError,
  parsePartsPayload,
  parseReceiveLinesFromBody,
  parseIssueLinesFromBody,
  isEligibleJobProductLine,
  isAutoCpairReceiveProductLine,
  buildDefaultAutoCpairPartFromJobProduct,
  installedQtyFromJobProduct,
  computeReceiveStatus,
  computeIssueStatus,
  sumPartTotals,
  formatSummaryRow,
  formatPartRow,
  formatSchemaPartFromJobProduct,
  formatOverviewRow,
  collectLogUserIds,
  formatReceiveLogRow,
  formatIssueLogRow,
  validatePartLineQuantities
} = require("../utils/job-cpair");
const {
  buildPagination,
  buildSummaryListWhere,
  buildSummaryOrderBy,
  buildOverviewWhere,
  filterOverviewRows,
  sortOverviewRows,
  getAvailableSummaryFilters,
  getAvailableOverviewFilters,
  getSummarySortableColumns,
  getOverviewSortableColumns
} = require("../utils/job-cpair-list");

const JOB_CPAIR_PRODUCT_INCLUDE = {
  orderBy: { lineno: "asc" },
  include: {
    products: { select: { productid: true, name: true, enablecpairreceive: true } }
  }
};

class JobCpairService {
  buildScope(auth) {
    return {
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid)
    };
  }

  scopedWhere(scope, extra = {}) {
    return {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      ...extra
    };
  }

  async ensureCanManageCpair(auth) {
    if (!(await canManageBranchJobs(auth))) {
      throw clientError("Only admins and managers can perform this action", 403);
    }
  }

  async loadPartById(scope, partId) {
    return prisma.jobcpairparts.findFirst({
      where: this.scopedWhere(scope, { recno: Number(partId) }),
      include: {
        summary: {
          include: {
            job: { select: { recno: true, code: true, manualjobno: true } }
          }
        }
      }
    });
  }

  async recalculatePartLineTotals(tx, scope, partId) {
    const partWhere = this.scopedWhere(scope, { recno: Number(partId) });
    const [receiveSum, issueSum] = await Promise.all([
      tx.jobcpairreceivelog.aggregate({
        where: { jobcpairpartid: Number(partId), ...this.scopedWhere(scope) },
        _sum: { qtyreceived: true, wastageqty: true }
      }),
      tx.jobcpairissuelog.aggregate({
        where: { jobcpairpartid: Number(partId), ...this.scopedWhere(scope) },
        _sum: { issueqty: true }
      })
    ]);

    return tx.jobcpairparts.update({
      where: partWhere,
      data: {
        lineqtyreceived: receiveSum._sum.qtyreceived ?? 0,
        linewastagereceived: receiveSum._sum.wastageqty ?? 0,
        lineissueqty: issueSum._sum.issueqty ?? 0
      }
    });
  }

  async loadUserNameMap(userIds = []) {
    const ids = [...new Set(userIds.filter((id) => id != null && Number.isFinite(Number(id))).map(Number))];
    if (!ids.length) return new Map();

    const rows = await prisma.users.findMany({
      where: { userid: { in: ids } },
      select: { userid: true, name: true }
    });

    return new Map(rows.map((row) => [row.userid, row.name ?? null]));
  }

  async formatLogsWithUserNames(receiveLogs = [], issueLogs = []) {
    const userNameMap = await this.loadUserNameMap(collectLogUserIds(receiveLogs, issueLogs));
    return {
      receiveLogs: receiveLogs.map((row) => formatReceiveLogRow(row, userNameMap)).filter(Boolean),
      issueLogs: issueLogs.map((row) => formatIssueLogRow(row, userNameMap)).filter(Boolean)
    };
  }

  async buildMutationResponse(summary, parts, options = {}) {
    const receiveLogs = options.receiveLogs || [];
    const issueLogs = options.issueLogs || [];
    const formattedLogs = await this.formatLogsWithUserNames(receiveLogs, issueLogs);

    return {
      message: options.message,
      summary: formatSummaryRow(summary, { jobNo: options.jobNo ?? null }),
      parts: parts.map(formatPartRow),
      ...formattedLogs
    };
  }

  async loadSummaryLogs(tx, scope, summaryId) {
    const logWhere = this.scopedWhere(scope, { jobcpairsummaryid: Number(summaryId) });
    const [receiveLogs, issueLogs] = await Promise.all([
      tx.jobcpairreceivelog.findMany({
        where: logWhere,
        orderBy: { receiveddate: "desc" }
      }),
      tx.jobcpairissuelog.findMany({
        where: logWhere,
        orderBy: { issuedate: "desc" }
      })
    ]);
    return { receiveLogs, issueLogs };
  }

  async assertJobEligible(job) {
    if (job.iscompleted !== true && job.isresolved !== true) {
      throw clientError(
        "C-pair entry is only allowed after the job is completed or resolved",
        409
      );
    }
  }

  async getJobForCpair(auth, jobId) {
    const job = await jobsWorkflowService.getScopedJob(auth, jobId, {
      customers: { select: { customerid: true, name: true } },
      users: { select: { userid: true, name: true } },
      jobsubcategories: { select: { subcategoryid: true, name: true } },
      jobproducts: JOB_CPAIR_PRODUCT_INCLUDE
    });
    await jobsWorkflowService.ensureAssignedUser(auth, job);
    await this.assertJobEligible(job);
    return job;
  }

  getEligibleJobProducts(job) {
    return (job.jobproducts || []).filter(isEligibleJobProductLine);
  }

  getAutoCpairReceiveJobProducts(job) {
    return (job.jobproducts || []).filter(isAutoCpairReceiveProductLine);
  }

  async tryAutoReceiveOnJobComplete(auth, jobId) {
    const scope = this.buildScope(auth);
    const settings = await jobQuotationSettingsService.loadSettingsRow(scope);
    if (settings?.automaticcpairreceiving !== true) {
      return { enabled: false };
    }

    const job = await prisma.job.findFirst({
      where: this.scopedWhere(scope, { recno: Number(jobId) }),
      include: {
        customers: { select: { customerid: true, name: true } },
        users: { select: { userid: true, name: true } },
        jobsubcategories: { select: { subcategoryid: true, name: true } },
        jobproducts: JOB_CPAIR_PRODUCT_INCLUDE
      }
    });
    if (!job || job.iscompleted !== true) {
      return { enabled: true, skipped: true, reason: "job_not_completed" };
    }

    const eligibleLines = this.getAutoCpairReceiveJobProducts(job);
    if (!eligibleLines.length) {
      return { enabled: true, skipped: true, reason: "no_eligible_products", processed: 0 };
    }

    const now = utcNow();
    const uid = Number(auth.userid);

    const result = await prisma.$transaction(async (tx) => {
      let summary = await tx.jobcpairsummary.findFirst({
        where: this.scopedWhere(scope, { jobid: Number(jobId) }),
        include: {
          parts: {
            where: this.scopedWhere(scope),
            orderBy: { recno: "asc" }
          }
        }
      });

      const existingPartsMap = new Map((summary?.parts || []).map((part) => [part.jobproductid, part]));
      const partsToCreate = eligibleLines
        .filter((line) => !existingPartsMap.has(line.recno))
        .map(buildDefaultAutoCpairPartFromJobProduct);

      if (!summary) {
        summary = await tx.jobcpairsummary.create({
          data: {
            ...scope,
            ...this.buildSummarySnapshotFromJob(job),
            createdby: uid,
            createdat: now,
            lastupdatedby: uid,
            lastupdatedat: now
          }
        });
      }

      for (const part of partsToCreate) {
        const created = await tx.jobcpairparts.create({
          data: {
            ...scope,
            jobcpairsummaryid: summary.recno,
            jobid: Number(jobId),
            jobproductid: part.jobProductId,
            productid: part.productid,
            partname: part.partname,
            installedqty: part.installedqty,
            qty: part.qty,
            wastageqty: part.wastageqty,
            remarks: part.remarks,
            images: part.images,
            createdby: uid,
            createdat: now,
            lastupdatedby: uid,
            lastupdatedat: now
          }
        });
        existingPartsMap.set(part.jobProductId, created);
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summary.recno);
      const updatedParts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summary.recno }),
        orderBy: { recno: "asc" }
      });

      return {
        summary: updatedSummary,
        parts: updatedParts,
        partsCreated: partsToCreate.length
      };
    });

    return {
      enabled: true,
      skipped: false,
      summaryId: result.summary?.recno ?? null,
      partsCreated: result.partsCreated,
      partsCollected: result.partsCreated,
      partsReceived: 0,
      receiveStatus: result.summary?.receivestatus ?? "pending",
      message:
        result.partsCreated > 0
          ? "C-pair parts collected from job quotation; admin receive pending"
          : "C-pair parts already collected; admin receive pending",
      summary: formatSummaryRow(result.summary, { jobNo: job.code ?? null }),
      parts: result.parts.map(formatPartRow)
    };
  }

  buildSummarySnapshotFromJob(job) {
    const hierarchy = buildJobHierarchyFields(job);
    return {
      jobid: Number(job.recno),
      customerid: job.customerid ?? job.customers?.customerid ?? null,
      customername: job.customers?.name ?? null,
      technicianid: job.assignedto ?? null,
      technicianname: job.users?.name ?? null,
      faultid: hierarchy.faultId ?? job.faultid ?? null,
      faultname: hierarchy.faultName ?? job.jobsubcategories?.name ?? null
    };
  }

  async loadSummaryByJob(scope, jobId) {
    return prisma.jobcpairsummary.findFirst({
      where: this.scopedWhere(scope, { jobid: Number(jobId) }),
      include: {
        parts: {
          where: this.scopedWhere(scope),
          orderBy: { recno: "asc" }
        },
        job: { select: { recno: true, code: true, manualjobno: true } }
      }
    });
  }

  async loadSummaryById(scope, summaryId) {
    return prisma.jobcpairsummary.findFirst({
      where: this.scopedWhere(scope, { recno: Number(summaryId) }),
      include: {
        parts: {
          where: this.scopedWhere(scope),
          orderBy: { recno: "asc" }
        },
        receivelogs: {
          where: this.scopedWhere(scope),
          orderBy: { receiveddate: "desc" }
        },
        issuelogs: {
          where: this.scopedWhere(scope),
          orderBy: { issuedate: "desc" }
        },
        job: { select: { recno: true, code: true, manualjobno: true } }
      }
    });
  }

  async rollupSummary(tx, scope, summaryId) {
    const parts = await tx.jobcpairparts.findMany({
      where: this.scopedWhere(scope, { jobcpairsummaryid: Number(summaryId) })
    });
    const totals = sumPartTotals(parts);
    const receivestatus = computeReceiveStatus(totals.totalqtyreceived, totals.totalcpairqty);
    const issuestatus = computeIssueStatus(totals.totalissueqty, totals.totalqtyreceived);

    const logWhere = this.scopedWhere(scope, { jobcpairsummaryid: Number(summaryId) });
    const [lastReceive, lastIssue] = await Promise.all([
      tx.jobcpairreceivelog.findFirst({
        where: logWhere,
        orderBy: { receiveddate: "desc" },
        select: { receiveddate: true }
      }),
      tx.jobcpairissuelog.findFirst({
        where: logWhere,
        orderBy: { issuedate: "desc" },
        select: { issuedate: true }
      })
    ]);

    return tx.jobcpairsummary.update({
      where: this.scopedWhere(scope, { recno: Number(summaryId) }),
      data: {
        ...totals,
        receivestatus,
        issuestatus,
        lastreceiveddate: lastReceive?.receiveddate ?? null,
        lastissuedate: lastIssue?.issuedate ?? null
      }
    });
  }

  buildSchemaResponse(job, summary, eligibleProducts, existingPartsMap, remainingProducts, scope) {
    const submittedParts = (summary?.parts || []).map(formatPartRow);
    const pendingParts = remainingProducts.map((line) =>
      formatSchemaPartFromJobProduct(line, existingPartsMap.get(line.recno))
    );

    const snapshot = this.buildSummarySnapshotFromJob(job);

    return {
      jobId: Number(job.recno),
      jobNo: job.code ?? null,
      readyForPost: pendingParts.length > 0,
      summary: summary
        ? formatSummaryRow(summary, { jobNo: summary.job?.code ?? job.code, parts: submittedParts })
        : {
            summaryId: null,
            tenantId: scope?.tenantid ?? null,
            branchId: scope?.branchid ?? null,
            jobId: snapshot.jobid,
            customerId: snapshot.customerid,
            customerName: snapshot.customername,
            technicianId: snapshot.technicianid,
            technicianName: snapshot.technicianname,
            faultId: snapshot.faultid,
            faultName: snapshot.faultname,
            totalInstalledQty: 0,
            totalCpairQty: 0,
            totalWastageQty: 0,
            totalQtyReceived: 0,
            totalIssueQty: 0,
            receiveStatus: "pending",
            issueStatus: "pending"
          },
      submittedParts,
      parts: pendingParts,
      eligiblePartCount: eligibleProducts.length,
      submittedPartCount: submittedParts.length,
      remainingPartCount: pendingParts.length
    };
  }

  async getSchema(auth, jobId) {
    const scope = this.buildScope(auth);
    const job = await this.getJobForCpair(auth, jobId);
    const eligibleProducts = this.getEligibleJobProducts(job);

    if (!eligibleProducts.length) {
      throw clientError("This job has no eligible product lines for c-pair entry", 400);
    }

    const summary = await this.loadSummaryByJob(scope, jobId);
    const existingPartsMap = new Map((summary?.parts || []).map((p) => [p.jobproductid, p]));
    const remainingProducts = eligibleProducts.filter((line) => !existingPartsMap.has(line.recno));

    if (!remainingProducts.length) {
      throw clientError("All job parts are already converted to c-pair", 400);
    }

    return this.buildSchemaResponse(
      job,
      summary,
      eligibleProducts,
      existingPartsMap,
      remainingProducts,
      scope
    );
  }

  validatePartsAgainstJob(partsPayload, job, allowedJobProductIds) {
    const productMap = new Map((job.jobproducts || []).map((line) => [line.recno, line]));
    return partsPayload.map((part, index) => {
      if (!allowedJobProductIds.has(part.jobProductId)) {
        throw clientError(
          `parts[${index}].jobProductId ${part.jobProductId} is not eligible or already submitted`,
          400
        );
      }
      const line = productMap.get(part.jobProductId);
      if (!line || !isEligibleJobProductLine(line)) {
        throw clientError(`parts[${index}] references an invalid job product line`, 400);
      }
      const installedQty = installedQtyFromJobProduct(line);
      const quantities = validatePartLineQuantities(
        installedQty,
        part.qty,
        part.wastageqty,
        index
      );
      return {
        jobProductId: part.jobProductId,
        ...quantities,
        remarks: part.remarks,
        images: part.images,
        productid: line.productid ?? null,
        partname: line.products?.name ?? null
      };
    });
  }

  async createForJob(auth, jobId, body = {}) {
    const scope = this.buildScope(auth);
    const job = await this.getJobForCpair(auth, jobId);
    const eligibleProducts = this.getEligibleJobProducts(job);
    if (!eligibleProducts.length) {
      throw clientError("This job has no eligible product lines for c-pair entry", 400);
    }

    const summary = await this.loadSummaryByJob(scope, jobId);
    const existingPartsMap = new Map((summary?.parts || []).map((p) => [p.jobproductid, p]));
    const remainingIds = new Set(
      eligibleProducts.filter((line) => !existingPartsMap.has(line.recno)).map((line) => line.recno)
    );

    if (!remainingIds.size) {
      throw clientError("All job parts are already converted to c-pair", 400);
    }

    const partsPayload = parsePartsPayload(body);
    const validatedParts = this.validatePartsAgainstJob(partsPayload, job, remainingIds);
    const now = utcNow();
    const uid = Number(auth.userid);

    const result = await prisma.$transaction(async (tx) => {
      let summaryRow = summary;
      if (!summaryRow) {
        summaryRow = await tx.jobcpairsummary.create({
          data: {
            ...scope,
            ...this.buildSummarySnapshotFromJob(job),
            createdby: uid,
            createdat: now,
            lastupdatedby: uid,
            lastupdatedat: now
          }
        });
      }

      for (const part of validatedParts) {
        await tx.jobcpairparts.create({
          data: {
            ...scope,
            jobcpairsummaryid: summaryRow.recno,
            jobid: Number(jobId),
            jobproductid: part.jobProductId,
            productid: part.productid,
            partname: part.partname,
            installedqty: part.installedqty,
            qty: part.qty,
            wastageqty: part.wastageqty,
            remarks: part.remarks,
            images: part.images,
            createdby: uid,
            createdat: now,
            lastupdatedby: uid,
            lastupdatedat: now
          }
        });
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summaryRow.recno);
      const parts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summaryRow.recno }),
        orderBy: { recno: "asc" }
      });
      return { updatedSummary, parts };
    });

    return {
      message: "C-pair parts saved",
      summary: formatSummaryRow(result.updatedSummary, { jobNo: job.code }),
      parts: result.parts.map(formatPartRow)
    };
  }

  async updateForJob(auth, jobId, body = {}) {
    const scope = this.buildScope(auth);
    const job = await this.getJobForCpair(auth, jobId);
    const summary = await this.loadSummaryByJob(scope, jobId);
    if (!summary) {
      throw clientError("C-pair summary not found for this job", 404);
    }

    const partsPayload = parsePartsPayload(body);
    const existingMap = new Map((summary.parts || []).map((p) => [p.jobproductid, p]));
    const productMap = new Map((job.jobproducts || []).map((line) => [line.recno, line]));
    const now = utcNow();
    const uid = Number(auth.userid);

    const result = await prisma.$transaction(async (tx) => {
      for (const [index, part] of partsPayload.entries()) {
        const existing = existingMap.get(part.jobProductId);
        if (!existing) {
          throw clientError(
            `parts[${index}].jobProductId ${part.jobProductId} was not submitted yet; use POST to add it`,
            400
          );
        }
        if ((existing.lineqtyreceived || 0) > 0) {
          throw clientError(
            `parts[${index}] cannot be updated after receiving has started`,
            409
          );
        }
        const line = productMap.get(part.jobProductId);
        const installedQty = installedQtyFromJobProduct(line);
        validatePartLineQuantities(installedQty, part.qty, part.wastageqty, index);

        await tx.jobcpairparts.update({
          where: this.scopedWhere(scope, { recno: existing.recno }),
          data: {
            qty: part.qty,
            wastageqty: part.wastageqty,
            remarks: part.remarks,
            images: part.images,
            lastupdatedby: uid,
            lastupdatedat: now
          }
        });
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summary.recno);
      const parts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summary.recno }),
        orderBy: { recno: "asc" }
      });
      return { updatedSummary, parts };
    });

    return {
      message: "C-pair parts updated",
      summary: formatSummaryRow(result.updatedSummary, { jobNo: job.code }),
      parts: result.parts.map(formatPartRow)
    };
  }

  async shouldRestrictToAssignee(auth) {
    return !(await canManageBranchJobs(auth));
  }

  async listSummaries(auth, query = {}) {
    const pagination = buildPagination(query);
    const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
    const where = buildSummaryListWhere(auth, query, { restrictToAssignee });
    const orderBy = buildSummaryOrderBy(query);

    const [rows, total] = await Promise.all([
      prisma.jobcpairsummary.findMany({
        where,
        include: { job: { select: { recno: true, code: true, manualjobno: true } } },
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.jobcpairsummary.count({ where })
    ]);

    return {
      mode: restrictToAssignee ? "my" : "all",
      data: rows.map((row) => formatSummaryRow(row, { jobNo: row.job?.code ?? null })),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailableSummaryFilters(),
      sortableColumns: getSummarySortableColumns()
    };
  }

  async getSummaryDetail(auth, summaryId) {
    const scope = this.buildScope(auth);
    const summary = await this.loadSummaryById(scope, summaryId);
    if (!summary) {
      throw clientError("C-pair summary not found", 404);
    }

    if (await this.shouldRestrictToAssignee(auth)) {
      if (Number(summary.technicianid) !== Number(auth.userid)) {
        throw clientError("You can only view c-pair records for your assigned jobs", 403);
      }
    }

    return {
      summary: formatSummaryRow(summary, { jobNo: summary.job?.code ?? null }),
      parts: (summary.parts || []).map(formatPartRow),
      ...(await this.formatLogsWithUserNames(summary.receivelogs || [], summary.issuelogs || []))
    };
  }

  async receiveForSummary(auth, summaryId, body = {}) {
    await this.ensureCanManageCpair(auth);
    const scope = this.buildScope(auth);
    const summary = await this.loadSummaryById(scope, summaryId);
    if (!summary) {
      throw clientError("C-pair summary not found", 404);
    }
    if (!(summary.parts || []).length) {
      throw clientError("C-pair summary has no parts", 400);
    }

    const lines = parseReceiveLinesFromBody(body);
    const partMap = new Map((summary.parts || []).map((part) => [part.recno, { ...part }]));
    const now = utcNow();
    const uid = Number(auth.userid);
    const defaultReceivedDate = utcNow();
    const defaultHandedOverBy = summary.technicianid ?? null;

    const result = await prisma.$transaction(async (tx) => {
      for (const [index, line] of lines.entries()) {
        const part = partMap.get(line.partId);
        if (!part) {
          throw clientError(
            `parts[${index}].partId ${line.partId} was not found in this summary`,
            400
          );
        }

        const nextReceived = (Number(part.lineqtyreceived) || 0) + line.qtyReceived;
        if (nextReceived > Number(part.qty)) {
          throw clientError(
            `parts[${index}]: total received (${nextReceived}) cannot exceed expected c-pair qty (${part.qty})`,
            400
          );
        }

        const nextWastageReceived = (Number(part.linewastagereceived) || 0) + line.wastageQty;
        if (nextWastageReceived > Number(part.wastageqty)) {
          throw clientError(
            `parts[${index}]: total wastage received (${nextWastageReceived}) cannot exceed declared wastage qty (${part.wastageqty})`,
            400
          );
        }

        await tx.jobcpairreceivelog.create({
          data: {
            ...scope,
            jobcpairpartid: part.recno,
            jobcpairsummaryid: summary.recno,
            qtyreceived: line.qtyReceived,
            wastageqty: line.wastageQty,
            receivedby: uid,
            handedoverby: line.handedOverBy ?? defaultHandedOverBy,
            receiveddate: line.receivedDate ?? defaultReceivedDate,
            remarks: line.remarks ?? null,
            createdby: uid,
            createdat: now
          }
        });

        part.lineqtyreceived = nextReceived;
        part.linewastagereceived = nextWastageReceived;
        partMap.set(line.partId, part);
      }

      for (const partId of new Set(lines.map((line) => line.partId))) {
        await this.recalculatePartLineTotals(tx, scope, partId);
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summary.recno);
      const parts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summary.recno }),
        orderBy: { recno: "asc" }
      });
      const logs = await this.loadSummaryLogs(tx, scope, summary.recno);
      return { updatedSummary, parts, ...logs };
    });

    return await this.buildMutationResponse(result.updatedSummary, result.parts, {
      message: "C-pair parts received",
      jobNo: summary.job?.code ?? null,
      receiveLogs: result.receiveLogs,
      issueLogs: result.issueLogs
    });
  }

  async issueForSummary(auth, summaryId, body = {}) {
    await this.ensureCanManageCpair(auth);
    const scope = this.buildScope(auth);
    const summary = await this.loadSummaryById(scope, summaryId);
    if (!summary) {
      throw clientError("C-pair summary not found", 404);
    }
    if (!(summary.parts || []).length) {
      throw clientError("C-pair summary has no parts", 400);
    }

    const lines = parseIssueLinesFromBody(body);
    const partMap = new Map((summary.parts || []).map((part) => [part.recno, { ...part }]));
    const now = utcNow();
    const uid = Number(auth.userid);
    const defaultIssueDate = utcNow();

    const result = await prisma.$transaction(async (tx) => {
      for (const [index, line] of lines.entries()) {
        const part = partMap.get(line.partId);
        if (!part) {
          throw clientError(
            `parts[${index}].partId ${line.partId} was not found in this summary`,
            400
          );
        }

        const receivedQty = Number(part.lineqtyreceived) || 0;
        if (receivedQty <= 0) {
          throw clientError(
            `parts[${index}] cannot be issued before any quantity has been received`,
            409
          );
        }

        const nextIssued = (Number(part.lineissueqty) || 0) + line.issueQty;
        if (nextIssued > receivedQty) {
          throw clientError(
            `parts[${index}]: total issued (${nextIssued}) cannot exceed received qty (${receivedQty})`,
            400
          );
        }

        await tx.jobcpairissuelog.create({
          data: {
            ...scope,
            jobcpairpartid: part.recno,
            jobcpairsummaryid: summary.recno,
            issueqty: line.issueQty,
            issuedby: uid,
            storename: line.storeName ?? null,
            issuedate: line.issueDate ?? defaultIssueDate,
            remarks: line.remarks ?? null,
            createdby: uid,
            createdat: now
          }
        });

        part.lineissueqty = nextIssued;
        partMap.set(line.partId, part);
      }

      for (const partId of new Set(lines.map((line) => line.partId))) {
        await this.recalculatePartLineTotals(tx, scope, partId);
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summary.recno);
      const parts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summary.recno }),
        orderBy: { recno: "asc" }
      });
      const logs = await this.loadSummaryLogs(tx, scope, summary.recno);
      return { updatedSummary, parts, ...logs };
    });

    return await this.buildMutationResponse(result.updatedSummary, result.parts, {
      message: "C-pair parts issued to store",
      jobNo: summary.job?.code ?? null,
      receiveLogs: result.receiveLogs,
      issueLogs: result.issueLogs
    });
  }

  async deletePart(auth, partId) {
    await this.ensureCanManageCpair(auth);
    const scope = this.buildScope(auth);
    const part = await this.loadPartById(scope, partId);
    if (!part) {
      throw clientError("C-pair part not found", 404);
    }

    const summaryId = part.jobcpairsummaryid;
    const jobNo = part.summary?.job?.code ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const partWhere = this.scopedWhere(scope, { jobcpairpartid: part.recno });
      await tx.jobcpairissuelog.deleteMany({ where: partWhere });
      await tx.jobcpairreceivelog.deleteMany({ where: partWhere });
      await tx.jobcpairparts.delete({ where: this.scopedWhere(scope, { recno: part.recno }) });

      const remainingParts = await tx.jobcpairparts.findMany({
        where: this.scopedWhere(scope, { jobcpairsummaryid: summaryId }),
        orderBy: { recno: "asc" }
      });

      if (!remainingParts.length) {
        const summaryWhere = this.scopedWhere(scope, { jobcpairsummaryid: summaryId });
        await tx.jobcpairissuelog.deleteMany({ where: summaryWhere });
        await tx.jobcpairreceivelog.deleteMany({ where: summaryWhere });
        await tx.jobcpairsummary.delete({ where: this.scopedWhere(scope, { recno: summaryId }) });
        return { deletedSummary: true, summary: null, parts: [], receiveLogs: [], issueLogs: [] };
      }

      const updatedSummary = await this.rollupSummary(tx, scope, summaryId);
      const logs = await this.loadSummaryLogs(tx, scope, summaryId);
      return {
        deletedSummary: false,
        summary: updatedSummary,
        parts: remainingParts,
        ...logs
      };
    });

    if (result.deletedSummary) {
      return {
        message: "C-pair part deleted; summary removed because no parts remain",
        deletedSummary: true,
        summaryId,
        partId: Number(partId),
        jobNo
      };
    }

    return {
      message: "C-pair part deleted",
      deletedSummary: false,
      partId: Number(partId),
      summary: formatSummaryRow(result.summary, { jobNo }),
      parts: result.parts.map(formatPartRow),
      ...(await this.formatLogsWithUserNames(result.receiveLogs, result.issueLogs))
    };
  }

  async deleteSummary(auth, summaryId) {
    await this.ensureCanManageCpair(auth);
    const scope = this.buildScope(auth);
    const summary = await this.loadSummaryById(scope, summaryId);
    if (!summary) {
      throw clientError("C-pair summary not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      const summaryWhere = this.scopedWhere(scope, { jobcpairsummaryid: summary.recno });
      await tx.jobcpairissuelog.deleteMany({ where: summaryWhere });
      await tx.jobcpairreceivelog.deleteMany({ where: summaryWhere });
      await tx.jobcpairparts.deleteMany({ where: summaryWhere });
      await tx.jobcpairsummary.delete({ where: this.scopedWhere(scope, { recno: summary.recno }) });
    });

    return {
      message: "C-pair summary deleted",
      summaryId: Number(summaryId),
      jobId: summary.jobid,
      jobNo: summary.job?.code ?? null
    };
  }

  async getOverview(auth, query = {}) {
    const pagination = buildPagination(query);
    const restrictToAssignee = await this.shouldRestrictToAssignee(auth);
    const { partWhere } = buildOverviewWhere(auth, query, { restrictToAssignee });

    const parts = await prisma.jobcpairparts.findMany({
      where: partWhere,
      include: {
        summary: {
          include: {
            job: { select: { recno: true, code: true, manualjobno: true } }
          }
        }
      },
      orderBy: { recno: "asc" }
    });

    const flatRows = sortOverviewRows(
      filterOverviewRows(
        parts.map((part) => formatOverviewRow(part.summary, part)),
        query
      ),
      query
    );

    const total = flatRows.length;
    const data = flatRows.slice(pagination.skip, pagination.skip + pagination.pageSize);

    return {
      mode: restrictToAssignee ? "my" : "all",
      data,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize) || 0
      },
      filters: getAvailableOverviewFilters(),
      sortableColumns: getOverviewSortableColumns()
    };
  }
}

module.exports = new JobCpairService();
