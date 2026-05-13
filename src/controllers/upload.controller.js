/**
 * POST multipart — field name "file". Returns paths served by express.static("/uploads").
 */
function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded; use multipart field name \"file\"" });
  }

  const tenant = req.auth.tenantid;
  const branch = req.auth.branchid;
  const relativeUrl = `/uploads/general/${tenant}/${branch}/${req.file.filename}`;

  let absoluteUrl;
  const base = process.env.APP_URL && String(process.env.APP_URL).replace(/\/$/, "");
  if (base) {
    absoluteUrl = `${base}${relativeUrl}`;
  }

  return res.status(201).json({
    url: relativeUrl,
    ...(absoluteUrl ? { absoluteUrl } : {}),
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
}

module.exports = {
  uploadFile
};
