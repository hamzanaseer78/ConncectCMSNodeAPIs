const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { loadDocForge } = require("../utils/doc-forge-lib");
const { mapJobCardDocForgeData } = require("../utils/job-card-docforge-data");
const {
  getJobCardPreviewMode,
  isDocForgeDesignerEnabled
} = require("../config/job-card-preview-mode");

const MAX_TEMPLATE_CHARS = 180000;
const MAX_NAME = 120;
const DOCUMENT_CATEGORY = "job_card";

function clientError(message, status = 400, code = "invalid_request") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isMissingTableError(err) {
  const msg = String(err?.message || "");
  return (
    err?.code === "P2021" ||
    err?.code === "42P01" ||
    (/jobcardtemplates/i.test(msg) && /does not exist/i.test(msg))
  );
}

function scopeFromAuth(auth) {
  const tenantid = Number(auth?.tenantid);
  const branchid = Number(auth?.branchid);
  const userid = Number(auth?.userid);
  if (![tenantid, branchid, userid].every((value) => Number.isInteger(value) && value > 0)) {
    throw clientError("Authenticated tenant, branch, and user are required.", 403, "scope_required");
  }
  return { tenantid, branchid, userid };
}

function parseTemplateJson(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") {
    throw clientError("A DocForge template document is required.");
  }
  if (raw.length > MAX_TEMPLATE_CHARS) {
    throw clientError("The template is too large.");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw clientError("The template JSON is invalid.");
  }
}

async function validateStoredTemplate(document) {
  const forge = await loadDocForge();
  const result = forge.validateTemplate(document);
  if (!result.valid) {
    const first = result.errors?.[0]?.message || "The template is invalid.";
    throw clientError(first, 400, "invalid_template");
  }
  return forge.serializeTemplate(forge.createTemplate(document));
}

function formatRow(row, template) {
  if (!row) return null;
  return {
    recno: row.recno,
    name: row.name,
    documentType: row.documenttype,
    schemaVersion: row.schemaversion,
    isSelected: row.isselected === true,
    template: template ?? (row.templatejson ? JSON.parse(row.templatejson) : null),
    createdAt: row.createdat,
    lastUpdatedAt: row.lastupdatedat
  };
}

async function defaultTemplateDocument() {
  const forge = await loadDocForge();
  return forge.cloneTemplate(forge.exampleJobCardTemplate);
}

function previewModePayload() {
  const mode = getJobCardPreviewMode();
  return {
    mode,
    designerEnabled: isDocForgeDesignerEnabled(mode),
    defaultView: mode === "docforge" ? "docforge" : "legacy"
  };
}

async function listTemplates(auth) {
  const scope = scopeFromAuth(auth);
  try {
    const rows = await prisma.jobcardtemplates.findMany({
      where: { tenantid: scope.tenantid, branchid: scope.branchid, documenttype: DOCUMENT_CATEGORY },
      orderBy: [{ isselected: "desc" }, { lastupdatedat: "desc" }, { recno: "desc" }]
    });
    return { data: rows.map((row) => formatRow(row)) };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { data: [] };
    }
    throw err;
  }
}

async function getTemplate(auth, id) {
  const scope = scopeFromAuth(auth);
  const recno = Number(id);
  if (!Number.isInteger(recno) || recno <= 0) {
    throw clientError("A valid template id is required.");
  }
  const row = await prisma.jobcardtemplates.findFirst({
    where: { recno, tenantid: scope.tenantid, branchid: scope.branchid }
  });
  if (!row) throw clientError("Template not found.", 404, "not_found");
  return formatRow(row);
}

async function getSelectedTemplate(auth) {
  const scope = scopeFromAuth(auth);
  try {
    const row = await prisma.jobcardtemplates.findFirst({
      where: {
        tenantid: scope.tenantid,
        branchid: scope.branchid,
        documenttype: DOCUMENT_CATEGORY,
        isselected: true
      }
    });
    if (row) return { ...formatRow(row), isDefault: false };
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  const template = await defaultTemplateDocument();
  return {
    recno: null,
    name: template.name || "Job Card",
    documentType: DOCUMENT_CATEGORY,
    schemaVersion: template.schemaVersion,
    isSelected: false,
    isDefault: true,
    template,
    createdAt: null,
    lastUpdatedAt: null
  };
}

async function saveTemplate(auth, body, id) {
  const scope = scopeFromAuth(auth);
  const name = String(body?.name || "Job Card").trim().slice(0, MAX_NAME) || "Job Card";
  const serialized = await validateStoredTemplate(parseTemplateJson(body?.template ?? body?.templatejson));
  const select = body?.isSelected !== false;
  const now = utcNow();

  return prisma.$transaction(async (tx) => {
    if (select) {
      await tx.jobcardtemplates.updateMany({
        where: { tenantid: scope.tenantid, branchid: scope.branchid, documenttype: DOCUMENT_CATEGORY },
        data: { isselected: false }
      });
    }

    const parsed = JSON.parse(serialized);
    const data = {
      name,
      documenttype: DOCUMENT_CATEGORY,
      schemaversion: Number(parsed.schemaVersion) || 1,
      templatejson: serialized,
      isselected: select,
      lastupdatedby: scope.userid,
      lastupdatedat: now
    };

    if (id != null) {
      const recno = Number(id);
      const existing = await tx.jobcardtemplates.findFirst({
        where: { recno, tenantid: scope.tenantid, branchid: scope.branchid }
      });
      if (!existing) throw clientError("Template not found.", 404, "not_found");
      const row = await tx.jobcardtemplates.update({
        where: { recno },
        data
      });
      return formatRow(row, parsed);
    }

    const row = await tx.jobcardtemplates.create({
      data: {
        tenantid: scope.tenantid,
        branchid: scope.branchid,
        createdby: scope.userid,
        createdat: now,
        ...data
      }
    });
    return formatRow(row, parsed);
  });
}

async function deleteTemplate(auth, id) {
  const scope = scopeFromAuth(auth);
  const recno = Number(id);
  const existing = await prisma.jobcardtemplates.findFirst({
    where: { recno, tenantid: scope.tenantid, branchid: scope.branchid }
  });
  if (!existing) throw clientError("Template not found.", 404, "not_found");
  await prisma.jobcardtemplates.delete({ where: { recno } });
  return { deleted: true, recno };
}

function imageBaseUrl() {
  return process.env.PUBLIC_IMAGE_BASE_URL || process.env.IMAGE_BASE_URL || "";
}

async function getCardData(auth, jobId, jobsWorkflowService) {
  const scope = scopeFromAuth(auth);
  const job = await jobsWorkflowService.getById(auth, jobId);
  const [organization, branch, collection] = await Promise.all([
    prisma.organizations.findFirst({
      where: { tenantid: scope.tenantid },
      select: {
        organizationname: true,
        phoneno: true,
        email: true,
        website: true,
        address: true,
        logourl: true
      }
    }),
    prisma.branches.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid },
      select: { name: true, phoneno: true, email: true, web: true, logourl: true }
    }),
    prisma.jobcollections.findFirst({
      where: { tenantid: scope.tenantid, branchid: scope.branchid, jobid: Number(job.recno) },
      select: { amount: true }
    }).catch(() => null)
  ]);
  return {
    data: mapJobCardDocForgeData({
      job,
      organization,
      branch,
      collection,
      imageBaseUrl: imageBaseUrl()
    })
  };
}

async function renderCard(auth, jobId, body, jobsWorkflowService) {
  const forge = await loadDocForge();
  const payload = await getCardData(auth, jobId, jobsWorkflowService);
  let document;
  if (body?.templateId != null) {
    const saved = await getTemplate(auth, body.templateId);
    document = saved.template;
  } else if (body?.template) {
    document = parseTemplateJson(body.template);
  } else {
    const selected = await getSelectedTemplate(auth);
    document = selected.template;
  }
  const html = forge.renderToHTML(document, payload.data, {
    imageSources: {
      allowHttps: true,
      allowDataImages: true
    }
  });
  return { html, data: payload.data };
}

module.exports = {
  MAX_TEMPLATE_CHARS,
  previewModePayload,
  listTemplates,
  getTemplate,
  getSelectedTemplate,
  saveTemplate,
  deleteTemplate,
  getCardData,
  renderCard,
  parseTemplateJson
};
