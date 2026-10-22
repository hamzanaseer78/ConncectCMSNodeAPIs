let cached = null;

async function loadDocForge() {
  if (cached) return cached;
  cached = await import("@arslankhan/doc-forge");
  return cached;
}

module.exports = {
  loadDocForge
};
