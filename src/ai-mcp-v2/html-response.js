const ALLOWED_TAGS = new Set(["h1", "h2", "h3", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "strong", "em", "div", "span", "section", "br", "svg", "rect", "text", "g"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "");
}

function sanitizeHtml(html) {
  const source = String(html || "");
  if (!source.trim()) return "";
  const without = source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "");
  return without.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag, attrs) => {
    const name = String(tag).toLowerCase();
    const closing = /^<\//.test(full);
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    const safeAttrs = String(attrs || "")
      .replace(/javascript:/gi, "")
      .split(/\s+/)
      .filter((part) => /^(class|colspan|rowspan|width|height|x|y|fill|viewbox|role|aria-[\w-]+)=/i.test(part))
      .join(" ");
    return safeAttrs ? `<${name} ${safeAttrs}>` : `<${name}>`;
  });
}

function cell(value) {
  if (value == null) return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return escapeHtml(value);
}

function tableHtml(rows) {
  if (!rows.length) {
    return "<p>No matching records were found.</p>";
  }
  const columns = Object.keys(rows[0]);
  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((col) => `<td>${cell(row[col])}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function chartHtml(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const labelKey = columns.find((col) => typeof rows[0][col] === "string") || columns[0];
  const valueKey = columns.find((col) => typeof rows[0][col] === "number" && col !== labelKey);
  if (!valueKey) return "";
  const values = rows.slice(0, 12).map((row) => Number(row[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const bars = rows.slice(0, 12).map((row, index) => {
    const height = Math.round((Number(row[valueKey]) || 0) / max * 80);
    const x = 20 + index * 28;
    return `<g><rect x="${x}" y="${90 - height}" width="18" height="${height}" fill="#1B4D3E"></rect><text x="${x}" y="108" font-size="7">${escapeHtml(String(row[labelKey] || "").slice(0, 8))}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${Math.max(160, 20 + values.length * 28)} 120" role="img" width="100%">${bars}</svg>`;
}

function buildHtml({ question, narrative, rows }) {
  const safeNarrative = sanitizeHtml(narrative) || `<p>${escapeHtml(narrative || "Results from authorized records.")}</p>`;
  const data = Array.isArray(rows) ? rows : [];
  const empty = data.length === 0
    ? "<p>No matching records were found for the authorized tenant and branch.</p>"
    : "";
  return [
    "<section>",
    `<h2>${escapeHtml(question || "Results")}</h2>`,
    safeNarrative,
    empty || chartHtml(data),
    empty || tableHtml(data),
    "</section>"
  ].filter(Boolean).join("");
}

module.exports = {
  escapeHtml,
  escapeAttr,
  sanitizeHtml,
  tableHtml,
  chartHtml,
  buildHtml
};
