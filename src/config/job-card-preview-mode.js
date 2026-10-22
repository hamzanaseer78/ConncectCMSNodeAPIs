const MODES = Object.freeze(["legacy", "docforge", "pilot"]);

function normalizeJobCardPreviewMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return MODES.includes(mode) ? mode : "legacy";
}

function getJobCardPreviewMode(env = process.env) {
  return normalizeJobCardPreviewMode(env.JOB_CARD_PREVIEW_MODE);
}

function isDocForgeDesignerEnabled(mode = getJobCardPreviewMode()) {
  return mode === "docforge" || mode === "pilot";
}

module.exports = {
  MODES,
  normalizeJobCardPreviewMode,
  getJobCardPreviewMode,
  isDocForgeDesignerEnabled
};
