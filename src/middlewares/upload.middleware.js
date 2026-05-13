const path = require("path");
const fs = require("fs");
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

module.exports = {
  uploadSingle: upload.single("file"),
  maxUploadBytes: maxBytes
};
