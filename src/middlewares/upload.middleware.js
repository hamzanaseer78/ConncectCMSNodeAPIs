const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeBasename(name) {
  const ext = path.extname(name || "");
  const base = path.basename(name || "file", ext);
  return String(base)
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

const maxBytes = () => {
  const raw = process.env.UPLOAD_MAX_FILE_BYTES;
  if (raw && /^\d+$/.test(String(raw).trim())) {
    return Number(raw);
  }
  return 25 * 1024 * 1024;
};

/**
 * Multipart upload for authenticated requests — saves under uploads/general/{tenant}/{branch}/.
 * Field name: "file"
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenant = String(req.auth.tenantid);
      const branch = String(req.auth.branchid);
      const dir = path.join(process.cwd(), "uploads", "general", String(tenant), String(branch));
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 32);
      const base = safeBasename(file.originalname);
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: {
    fileSize: maxBytes()
  }
});

const profileMaxBytes = () => {
  const raw = process.env.PROFILE_IMAGE_MAX_BYTES;
  if (raw && /^\d+$/.test(String(raw).trim())) {
    return Number(raw);
  }
  return 5 * 1024 * 1024;
};

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "profiles", String(req.auth.userid));
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 32);
      const base = safeBasename(file.originalname);
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: { fileSize: profileMaxBytes() },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype || "")) {
      cb(null, true);
      return;
    }
    cb(new Error("Profile image must be JPEG, PNG, GIF, or WebP"));
  }
});

const MAX_JOB_ACTION_FILES = 20;

/** Job action uploads: uploads/jobs/{tenant}/{branch}/{jobId}/ — field `files` and/or `file`. */
const jobActionUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const jobId = req.params?.id;
      if (!jobId) {
        return cb(new Error("Job id is required for attachment upload"));
      }
      const tenant = String(req.auth?.tenantid ?? "0");
      const branch = String(req.auth?.branchid ?? "0");
      const dir = path.join(process.cwd(), "uploads", "jobs", tenant, branch, String(jobId));
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 32);
      const base = safeBasename(file.originalname);
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: {
    fileSize: maxBytes(),
    files: MAX_JOB_ACTION_FILES
  }
});

const BULK_UPLOAD_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".pdf"]);

function createBulkUploadMulter(tempFolder, label) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        req.bulkUploadId = crypto.randomUUID();
        const tenant = String(req.auth?.tenantid ?? "0");
        const user = String(req.auth?.userid ?? "0");
        const dir = path.join(
          process.cwd(),
          "uploads",
          "temp",
          tempFolder,
          tenant,
          user,
          req.bulkUploadId
        );
        ensureDir(dir);
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").slice(0, 32).toLowerCase();
        cb(null, `source${ext || ".bin"}`);
      }
    }),
    limits: { fileSize: maxBytes() },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (BULK_UPLOAD_EXTENSIONS.has(ext)) {
        cb(null, true);
        return;
      }
      cb(new Error(`${label} accepts .xlsx, .xls, .csv, or .pdf only`));
    }
  });
}

/** Product bulk upload — saves under uploads/temp/products/{tenant}/{userid}/{uploadId}/ */
const productBulkUpload = createBulkUploadMulter("products", "Product bulk upload");
const jobCategoryBulkUpload = createBulkUploadMulter("jobcategories", "Category bulk upload");
const jobSubcategoryBulkUpload = createBulkUploadMulter("jobsubcategories", "Subcategory bulk upload");
const erpProductBulkUpload = createBulkUploadMulter("erpproducts", "ERP product bulk upload");

module.exports = {
  uploadSingle: upload.single("file"),
  uploadProfileSingle: profileUpload.single("file"),
  uploadJobActionFiles: jobActionUpload.fields([
    { name: "files", maxCount: MAX_JOB_ACTION_FILES },
    { name: "file", maxCount: 1 }
  ]),
  uploadProductBulkSingle: productBulkUpload.single("file"),
  uploadJobCategoryBulkSingle: jobCategoryBulkUpload.single("file"),
  uploadJobSubcategoryBulkSingle: jobSubcategoryBulkUpload.single("file"),
  uploadErpProductBulkSingle: erpProductBulkUpload.single("file"),
  maxUploadBytes: maxBytes,
  maxProfileImageBytes: profileMaxBytes,
  maxJobActionFiles: MAX_JOB_ACTION_FILES
};
