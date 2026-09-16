function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function suggestColumnMapping(columns, headerAliases, availableColumns = []) {
  const mapping = {};

  availableColumns.forEach((header) => {
    const norm = normalizeHeader(header);
    if (!norm) return;

    for (const col of columns) {
      if (mapping[col.key]) continue;
      const aliases = headerAliases[col.key] || [normalizeHeader(col.label), col.key];
      if (aliases.includes(norm)) {
        mapping[col.key] = header;
        break;
      }
    }
  });

  return mapping;
}

module.exports = {
  normalizeHeader,
  suggestColumnMapping
};
