const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");

const JOB_MUTABLE_FIELDS = [
  "code", "date", "assignedto", "city", "area", "serviceid", "faultid", "customerid",
  "isinwaranty", "statusid", "priority", "deliverytype", "manualjobno"
];

function toNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildJobPayload(data = {}) {
  const payload = {};
  JOB_MUTABLE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) payload[field] = data[field];
  });
  ["assignedto", "city", "area", "serviceid", "faultid", "customerid", "statusid", "deliverytype"].forEach((field) => {
    if (payload[field] !== undefined) payload[field] = toNumber(payload[field]);
  });
  if (payload.date !== undefined) payload.date = toDate(payload.date);
  return payload;
}

class JobsWorkflowService {
  buildScope(auth) {
    return { tenantid: Number(auth.tenantid), branchid: Number(auth.branchid) };
  }

  async getScopedJob(auth, id) {
    const row = await prisma.job.findFirst({
      where: { ...this.buildScope(auth), recno: Number(id) }
    });
    if (!row) throw new Error("Job not found");
    return row;
  }

  async isAdmin(auth) {
    const adminPolicy = await prisma.policies.findFirst({
      where: {
        tenantid: Number(auth.tenantid),
        isdefaultpolicy: true
      },
      select: { recno: true }
    });
    if (!adminPolicy) return false;
    const assignment = await prisma.userpolicies.findFirst({
      where: {
        userid: Number(auth.userid),
        tenantid: Number(auth.tenantid),
        branchid: Number(auth.branchid),
        policyid: adminPolicy.recno
      }
    });
    return Boolean(assignment);
  }

  async ensureAdmin(auth) {
    const admin = await this.isAdmin(auth);
    if (!admin) throw new Error("Admin approval required");
  }

  async ensureAssignedUser(auth, job) {
    if (!job.assignedto || Number(job.assignedto) !== Number(auth.userid)) {
      throw new Error("Only assigned user can complete this job");
    }
  }

  async create(auth, data) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const payload = buildJobPayload(data);
    if (!payload.customerid || !payload.serviceid) throw new Error("customerid and serviceid are required");

    const defaultSubCategory = payload.faultid
      ? await prisma.jobsubcategories.findUnique({ where: { subcategoryid: Number(payload.faultid) } })
      : null;
    const autoAssignedTo = payload.assignedto || defaultSubCategory?.defaultuser || undefined;

    const created = await prisma.$transaction(async (tx) => {
      const firstStatus = await tx.jobstatuses.findFirst({
        where: { tenantid: scope.tenantid, isfirststatus: true },
        orderBy: { recno: "asc" }
      });

      const job = await tx.job.create({
        data: {
          ...payload,
          ...scope,
          date: payload.date || now,
          assignedto: autoAssignedTo,
          statusid: payload.statusid || firstStatus?.recno || null
        }
      });

      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          createdby: Number(auth.userid),
          createdat: now,
          description: data.description || null,
          notes: data.notes || null,
          assignedby: autoAssignedTo ? Number(auth.userid) : null,
          assignedat: autoAssignedTo ? now : null,
          assignedremarks: autoAssignedTo ? "Auto/initial assignment" : null
        }
      });

      if (autoAssignedTo) {
        await tx.jobassignmentlog.create({
          data: {
            jobid: job.recno,
            ...scope,
            userid: Number(autoAssignedTo),
            assignedby: Number(auth.userid),
            assignedat: now,
            remarks: "Assigned on complaint creation"
          }
        });
      }

      if (data.parts && Array.isArray(data.parts) && data.parts.length) {
        await tx.jobproducts.createMany({
          data: data.parts.map((p, index) => ({
            jobid: job.recno,
            ...scope,
            productid: toNumber(p.productid),
            modelno: p.modelno || null,
            partno: p.partno || null,
            salerefrenceno: p.salerefrenceno || null,
            lineno: toNumber(p.lineno) || index + 1,
            remarks: p.remarks || null
          }))
        });
      }

      if (data.serviceLines && Array.isArray(data.serviceLines) && data.serviceLines.length) {
        await tx.jobaddonproducts.createMany({
          data: data.serviceLines.map((l, index) => ({
            jobid: job.recno,
            ...scope,
            productid: toNumber(l.productid),
            modelno: l.modelno || null,
            partno: l.partno || null,
            qty: Number(l.qty || 0),
            price: Number(l.price || 0),
            totalamount: Number(l.totalamount || 0),
            discounttype: l.discounttype || null,
            discountvalue: Number(l.discountvalue || 0),
            discountamount: Number(l.discountamount || 0),
            exclusiveamount: Number(l.exclusiveamount || 0),
            taxtypeid: toNumber(l.taxtypeid),
            taxpercent: Number(l.taxpercent || 0),
            taxamount: Number(l.taxamount || 0),
            inclusiveamount: Number(l.inclusiveamount || 0),
            isserviceitem: l.isserviceitem === true,
            lineno: toNumber(l.lineno) || index + 1,
            remarks: l.remarks || null
          }))
        });
      }

      return job;
    });

    return created;
  }

  async update(auth, id, data) {
    await this.getScopedJob(auth, id);
    const payload = buildJobPayload(data);
    return prisma.job.update({ where: { recno: Number(id) }, data: payload });
  }

  async details(auth, id) {
    const row = await prisma.job.findFirst({
      where: { ...this.buildScope(auth), recno: Number(id) },
      include: {
        customers: true,
        users: true,
        jobstatuses: true,
        jobcategories: true,
        jobsubcategories: true,
        jobdetails: true,
        jobproducts: { include: { products: true } },
        jobaddonproducts: { include: { products: true, taxtypes: true } },
        jobattachments: true,
        jobassignmentlog: true,
        jobstatuslog: true,
        jobcustomerremarkslog: true,
        jobtravelhistory: true,
        jobworklhistory: true
      }
    });
    if (!row) throw new Error("Job not found");
    return row;
  }

  async quotationDetails(auth, id) {
    const job = await prisma.job.findFirst({
      where: { ...this.buildScope(auth), recno: Number(id) },
      include: {
        customers: true,
        jobproducts: { include: { products: true } },
        jobaddonproducts: { include: { products: true, taxtypes: true } }
      }
    });
    if (!job) throw new Error("Job not found");

    const lineItems = (job.jobaddonproducts || []).map((item) => ({
      recno: item.recno,
      productid: item.productid,
      productname: item.products?.name || null,
      qty: item.qty || 0,
      price: item.price || 0,
      taxamount: item.taxamount || 0,
      discountamount: item.discountamount || 0,
      inclusiveamount: item.inclusiveamount || 0
    }));
    const subtotal = lineItems.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0);
    const totalTax = lineItems.reduce((sum, item) => sum + (item.taxamount || 0), 0);
    const totalDiscount = lineItems.reduce((sum, item) => sum + (item.discountamount || 0), 0);
    const grandTotal = lineItems.reduce((sum, item) => sum + (item.inclusiveamount || 0), 0);

    return {
      job: { recno: job.recno, code: job.code, manualjobno: job.manualjobno, date: job.date, customer: job.customers },
      parts: job.jobproducts || [],
      addons: lineItems,
      totals: { subtotal, totalTax, totalDiscount, grandTotal }
    };
  }

  async timeline(auth, id) {
    await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    const jobId = Number(id);
    const [job, assignment, statusLog, travel, work] = await Promise.all([
      prisma.job.findUnique({ where: { recno: jobId } }),
      prisma.jobassignmentlog.findMany({ where: { ...scope, jobid: jobId }, orderBy: { assignedat: "asc" } }),
      prisma.jobstatuslog.findMany({ where: { ...scope, jobid: jobId }, orderBy: { changedat: "asc" } }),
      prisma.jobtravelhistory.findMany({ where: { ...scope, jobid: jobId }, orderBy: { startedat: "asc" } }),
      prisma.jobworklhistory.findMany({ where: { ...scope, jobid: jobId }, orderBy: { startedat: "asc" } })
    ]);

    const events = [];
    if (job?.date) events.push({ type: "JOB_CREATED", at: job.date, remarks: "Job created" });
    assignment.forEach((x) => events.push({ type: "TECHNICIAN_ASSIGNED", at: x.assignedat, remarks: x.remarks, userid: x.userid }));
    statusLog.forEach((x) => events.push({ type: "STATUS_CHANGED", at: x.changedat, remarks: x.remarks, fromstatus: x.fromstatus, tostatus: x.tostatus }));
    travel.forEach((x) => {
      if (x.startedat) events.push({ type: "TRAVEL_STARTED", at: x.startedat, remarks: x.remarks });
      if (x.stopedat) events.push({ type: "TRAVEL_STOPPED", at: x.stopedat, remarks: x.remarks });
    });
    work.forEach((x) => {
      if (x.startedat) events.push({ type: "JOB_WORK_STARTED", at: x.startedat, remarks: x.remarks });
      if (x.stopedat) events.push({ type: "JOB_WORK_STOPPED", at: x.stopedat, remarks: x.remarks });
    });

    return events.sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  async assignTechnician(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    const assignedTo = toNumber(payload.assignedto);
    if (!assignedTo) throw new Error("assignedto is required");

    await prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { recno: job.recno }, data: { assignedto: assignedTo } });
      await tx.jobassignmentlog.create({
        data: {
          jobid: job.recno,
          ...scope,
          userid: assignedTo,
          assignedby: Number(auth.userid),
          assignedat: now,
          remarks: payload.remarks || "Technician assigned"
        }
      });
      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          assignedat: now,
          assignedby: Number(auth.userid),
          assignedremarks: payload.remarks || "Technician assigned",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });

    return { message: "Technician assigned successfully", jobid: job.recno, assignedto: assignedTo };
  }

  async startTravel(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    await prisma.jobtravelhistory.create({
      data: {
        jobid: job.recno,
        ...scope,
        traveledby: Number(auth.userid),
        startedat: now,
        startlatitude: payload.startlatitude || null,
        startlongitude: payload.startlongitude || null,
        startaddress: payload.startaddress || null,
        remarks: payload.remarks || "Travel started"
      }
    });
    return { message: "Travel started", jobid: job.recno };
  }

  async stopTravel(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const jobId = Number(id);
    await this.getScopedJob(auth, jobId);
    const open = await prisma.jobtravelhistory.findFirst({
      where: { ...scope, jobid: jobId, traveledby: Number(auth.userid), stopedat: null },
      orderBy: { recno: "desc" }
    });
    if (!open) throw new Error("No active travel session found");
    await prisma.jobtravelhistory.update({
      where: { recno: open.recno },
      data: {
        stopedat: now,
        stoplatitude: payload.stoplatitude || null,
        stoplongitude: payload.stoplongitude || null,
        stopaddress: payload.stopaddress || null,
        remarks: payload.remarks || open.remarks
      }
    });
    return { message: "Travel stopped", jobid: jobId };
  }

  async startJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    const scope = this.buildScope(auth);
    await prisma.$transaction(async (tx) => {
      await tx.jobworklhistory.create({
        data: {
          jobid: job.recno,
          ...scope,
          workedby: Number(auth.userid),
          startedat: now,
          remarks: payload.remarks || "Job started"
        }
      });
      await tx.job.update({
        where: { recno: job.recno },
        data: { isfirstresponse: true }
      });
      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          firstresponseby: Number(auth.userid),
          firstresponseat: now,
          firstresponseremarks: payload.remarks || "Job started",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "Job work started", jobid: job.recno };
  }

  async completeJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAssignedUser(auth, job);
    const scope = this.buildScope(auth);
    await prisma.$transaction(async (tx) => {
      const open = await tx.jobworklhistory.findFirst({
        where: { ...scope, jobid: job.recno, workedby: Number(auth.userid), stopedat: null },
        orderBy: { recno: "desc" }
      });
      if (open) {
        await tx.jobworklhistory.update({ where: { recno: open.recno }, data: { stopedat: now, remarks: payload.remarks || open.remarks } });
      }
      await tx.job.update({ where: { recno: job.recno }, data: { iscompleted: true } });
      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          completedby: Number(auth.userid),
          completedat: now,
          completedremarks: payload.remarks || "Job completed",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "Job completed", jobid: job.recno };
  }

  async resolveJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { recno: job.recno }, data: { isresolved: true } });
      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          resolvedby: Number(auth.userid),
          resolvedat: now,
          resolvedremarks: payload.remarks || "Job resolved",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "Job resolved", jobid: job.recno };
  }

  async closeJob(auth, id, payload) {
    const now = utcNow();
    const job = await this.getScopedJob(auth, id);
    await this.ensureAdmin(auth);
    const scope = this.buildScope(auth);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: job.recno },
        data: {
          iscompleted: true,
          isresolved: true,
          qualityassuerd: true,
          isacknowledged: true
        }
      });
      await tx.jobdetails.create({
        data: {
          jobid: job.recno,
          ...scope,
          qualityassuerdby: Number(auth.userid),
          qualityassuerdat: now,
          qualityassuerdremarks: payload.qualityRemarks || payload.remarks || "Quality assured",
          acknowledgedby: Number(auth.userid),
          acknowledgedat: now,
          acknowledgedremarks: payload.acknowledgeRemarks || payload.remarks || "Job closed",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "Job closed", jobid: job.recno };
  }

  async listAttachments(auth, id) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const data = await prisma.jobattachments.findMany({
      where: {
        ...scope,
        jobid: Number(job.recno)
      },
      orderBy: { recno: "desc" }
    });
    return { jobid: Number(job.recno), total: data.length, data };
  }

  async getAttachment(auth, id, attachmentId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const row = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      }
    });
    if (!row) throw new Error("Attachment not found");
    return row;
  }

  async createAttachment(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    if (!payload?.attachmentname && !payload?.url) {
      throw new Error("attachmentname or url is required");
    }

    return prisma.jobattachments.create({
      data: {
        jobid: Number(job.recno),
        ...scope,
        addedby: Number(auth.userid),
        addedat: utcNow(),
        attachmentname: payload.attachmentname || null,
        url: payload.url || null,
        remarks: payload.remarks || null
      }
    });
  }

  async updateAttachment(auth, id, attachmentId, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      }
    });
    if (!existing) throw new Error("Attachment not found");

    return prisma.jobattachments.update({
      where: { recno: Number(attachmentId) },
      data: {
        attachmentname: payload.attachmentname !== undefined ? payload.attachmentname : existing.attachmentname,
        url: payload.url !== undefined ? payload.url : existing.url,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
      }
    });
  }

  async deleteAttachment(auth, id, attachmentId) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const existing = await prisma.jobattachments.findFirst({
      where: {
        ...scope,
        recno: Number(attachmentId),
        jobid: Number(job.recno)
      }
    });
    if (!existing) throw new Error("Attachment not found");

    await prisma.jobattachments.delete({
      where: { recno: Number(attachmentId) }
    });
    return { message: "Attachment deleted", recno: Number(attachmentId), jobid: Number(job.recno) };
  }

  async listAssignments(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobassignmentlog.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async createAssignment(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const assignedTo = toNumber(payload.userid || payload.assignedto);
    if (!assignedTo) throw new Error("userid is required");

    return prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { assignedto: assignedTo }
      });
      return tx.jobassignmentlog.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          userid: assignedTo,
          assignedby: Number(auth.userid),
          assignedat: now,
          remarks: payload.remarks || null
        }
      });
    });
  }

  async updateAssignment(auth, id, assignmentId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobassignmentlog.findFirst({
      where: { ...scope, recno: Number(assignmentId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Assignment log not found");

    const userid = payload.userid !== undefined ? toNumber(payload.userid) : existing.userid;
    const assignedat = payload.assignedat !== undefined ? toDate(payload.assignedat) : existing.assignedat;

    const updated = await prisma.jobassignmentlog.update({
      where: { recno: Number(assignmentId) },
      data: {
        userid,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks,
        assignedat
      }
    });

    if (userid) {
      await prisma.job.update({
        where: { recno: Number(id) },
        data: { assignedto: userid }
      });
    }
    return updated;
  }

  async deleteAssignment(auth, id, assignmentId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobassignmentlog.findFirst({
      where: { ...scope, recno: Number(assignmentId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Assignment log not found");
    await prisma.jobassignmentlog.delete({ where: { recno: Number(assignmentId) } });
    return { message: "Assignment log deleted", recno: Number(assignmentId) };
  }

  async listStatusLogs(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobstatuslog.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async createStatusLog(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const tostatus = toNumber(payload.tostatus || payload.statusid);
    if (!tostatus) throw new Error("tostatus is required");

    return prisma.$transaction(async (tx) => {
      const created = await tx.jobstatuslog.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          fromstatus: toNumber(payload.fromstatus) || job.statusid || null,
          tostatus,
          remarks: payload.remarks || null,
          changedby: Number(auth.userid),
          changedat: now
        }
      });
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { statusid: tostatus }
      });
      return created;
    });
  }

  async updateStatusLog(auth, id, statusLogId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobstatuslog.findFirst({
      where: { ...scope, recno: Number(statusLogId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Status log not found");

    const tostatus = payload.tostatus !== undefined ? toNumber(payload.tostatus) : existing.tostatus;
    const updated = await prisma.jobstatuslog.update({
      where: { recno: Number(statusLogId) },
      data: {
        fromstatus: payload.fromstatus !== undefined ? toNumber(payload.fromstatus) : existing.fromstatus,
        tostatus,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
      }
    });

    if (tostatus) {
      await prisma.job.update({
        where: { recno: Number(id) },
        data: { statusid: tostatus }
      });
    }
    return updated;
  }

  async deleteStatusLog(auth, id, statusLogId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobstatuslog.findFirst({
      where: { ...scope, recno: Number(statusLogId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Status log not found");
    await prisma.jobstatuslog.delete({ where: { recno: Number(statusLogId) } });
    return { message: "Status log deleted", recno: Number(statusLogId) };
  }

  async listTravelHistory(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobtravelhistory.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async listWorkHistory(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobworklhistory.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async ensureStockIfManaged(scope, productid, qty) {
    if (!productid || !qty || qty <= 0) return;
    const product = await prisma.products.findFirst({
      where: { ...scope, productid: Number(productid) },
      select: { productid: true, name: true, managestock: true }
    });
    if (!product || product.managestock !== true) return;

    // No inventory master table exists in current schema; use consumed quantity guard baseline.
    const consumed = await prisma.jobaddonproducts.aggregate({
      where: { ...scope, productid: Number(productid) },
      _sum: { qty: true }
    });
    const consumedQty = Number(consumed._sum.qty || 0);
    const availableStock = toNumber(process.env.DEFAULT_MANAGED_STOCK_QTY || 0);
    if (availableStock > 0 && consumedQty + Number(qty) > availableStock) {
      throw new Error(`Insufficient stock for managed product: ${product.name || product.productid}`);
    }
  }

  async listProducts(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobaddonproducts.findMany({
      where: { ...scope, jobid: Number(id) },
      include: { products: true, taxtypes: true },
      orderBy: { recno: "desc" }
    });
  }

  async createProduct(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    const productid = toNumber(payload.productid);
    const qty = Number(payload.qty || 0);
    await this.ensureStockIfManaged(scope, productid, qty);

    return prisma.jobaddonproducts.create({
      data: {
        jobid: Number(job.recno),
        ...scope,
        productid,
        modelno: payload.modelno || null,
        partno: payload.partno || null,
        qty,
        price: Number(payload.price || 0),
        totalamount: Number(payload.totalamount || 0),
        discounttype: payload.discounttype || null,
        discountvalue: Number(payload.discountvalue || 0),
        discountamount: Number(payload.discountamount || 0),
        exclusiveamount: Number(payload.exclusiveamount || 0),
        taxtypeid: toNumber(payload.taxtypeid),
        taxpercent: Number(payload.taxpercent || 0),
        taxamount: Number(payload.taxamount || 0),
        inclusiveamount: Number(payload.inclusiveamount || 0),
        isserviceitem: payload.isserviceitem === true,
        lineno: toNumber(payload.lineno),
        remarks: payload.remarks || null
      }
    });
  }

  async updateProduct(auth, id, productLineId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobaddonproducts.findFirst({
      where: { ...scope, recno: Number(productLineId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Job product line not found");

    const productid = payload.productid !== undefined ? toNumber(payload.productid) : existing.productid;
    const qty = payload.qty !== undefined ? Number(payload.qty || 0) : Number(existing.qty || 0);
    await this.ensureStockIfManaged(scope, productid, qty);

    return prisma.jobaddonproducts.update({
      where: { recno: Number(productLineId) },
      data: {
        productid,
        modelno: payload.modelno !== undefined ? payload.modelno : existing.modelno,
        partno: payload.partno !== undefined ? payload.partno : existing.partno,
        qty,
        price: payload.price !== undefined ? Number(payload.price || 0) : existing.price,
        totalamount: payload.totalamount !== undefined ? Number(payload.totalamount || 0) : existing.totalamount,
        discounttype: payload.discounttype !== undefined ? payload.discounttype : existing.discounttype,
        discountvalue: payload.discountvalue !== undefined ? Number(payload.discountvalue || 0) : existing.discountvalue,
        discountamount: payload.discountamount !== undefined ? Number(payload.discountamount || 0) : existing.discountamount,
        exclusiveamount: payload.exclusiveamount !== undefined ? Number(payload.exclusiveamount || 0) : existing.exclusiveamount,
        taxtypeid: payload.taxtypeid !== undefined ? toNumber(payload.taxtypeid) : existing.taxtypeid,
        taxpercent: payload.taxpercent !== undefined ? Number(payload.taxpercent || 0) : existing.taxpercent,
        taxamount: payload.taxamount !== undefined ? Number(payload.taxamount || 0) : existing.taxamount,
        inclusiveamount: payload.inclusiveamount !== undefined ? Number(payload.inclusiveamount || 0) : existing.inclusiveamount,
        isserviceitem: payload.isserviceitem !== undefined ? payload.isserviceitem === true : existing.isserviceitem,
        lineno: payload.lineno !== undefined ? toNumber(payload.lineno) : existing.lineno,
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
      }
    });
  }

  async deleteProduct(auth, id, productLineId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobaddonproducts.findFirst({
      where: { ...scope, recno: Number(productLineId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Job product line not found");
    await prisma.jobaddonproducts.delete({ where: { recno: Number(productLineId) } });
    return { message: "Job product deleted", recno: Number(productLineId) };
  }

  async listCustomerRemarks(auth, id) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    return prisma.jobcustomerremarkslog.findMany({
      where: { ...scope, jobid: Number(id) },
      orderBy: { recno: "desc" }
    });
  }

  async createCustomerRemark(auth, id, payload) {
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    if (!payload.remarks) throw new Error("remarks is required");
    return prisma.jobcustomerremarkslog.create({
      data: {
        jobid: Number(job.recno),
        ...scope,
        remarks: payload.remarks,
        addedby: Number(auth.userid),
        addedat: utcNow()
      }
    });
  }

  async updateCustomerRemark(auth, id, remarkId, payload) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobcustomerremarkslog.findFirst({
      where: { ...scope, recno: Number(remarkId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Customer remark not found");
    return prisma.jobcustomerremarkslog.update({
      where: { recno: Number(remarkId) },
      data: {
        remarks: payload.remarks !== undefined ? payload.remarks : existing.remarks
      }
    });
  }

  async deleteCustomerRemark(auth, id, remarkId) {
    const scope = this.buildScope(auth);
    await this.getScopedJob(auth, id);
    const existing = await prisma.jobcustomerremarkslog.findFirst({
      where: { ...scope, recno: Number(remarkId), jobid: Number(id) }
    });
    if (!existing) throw new Error("Customer remark not found");
    await prisma.jobcustomerremarkslog.delete({ where: { recno: Number(remarkId) } });
    return { message: "Customer remark deleted", recno: Number(remarkId) };
  }

  async updateFirstResponse(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { isfirstresponse: true }
      });
      await tx.jobdetails.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          firstresponseby: Number(auth.userid),
          firstresponseat: payload.firstresponseat ? toDate(payload.firstresponseat) : now,
          firstresponseremarks: payload.remarks || "First response updated",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "First response updated", jobid: Number(job.recno) };
  }

  async acknowledgeCustomer(auth, id, payload) {
    const now = utcNow();
    const scope = this.buildScope(auth);
    const job = await this.getScopedJob(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { recno: Number(job.recno) },
        data: { isacknowledged: true }
      });
      await tx.jobdetails.create({
        data: {
          jobid: Number(job.recno),
          ...scope,
          acknowledgedby: Number(auth.userid),
          acknowledgedat: payload.acknowledgedat ? toDate(payload.acknowledgedat) : now,
          acknowledgedremarks: payload.remarks || "Customer acknowledged",
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    });
    return { message: "Customer acknowledgement updated", jobid: Number(job.recno) };
  }
}

module.exports = new JobsWorkflowService();
