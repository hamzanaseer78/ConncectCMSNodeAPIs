const {
  formatDisplay,
  formatNarrativeDates,
  formatNumber
} = require("./format-values");
const { headingFor } = require("./column-labels");

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "div", "span", "section", "br", "svg", "rect", "text", "g"
]);

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

function stripVisualBlocks(html) {
  return sanitizeHtml(html)
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<h1[\s\S]*?<\/h1>/gi, "")
    .replace(/<h2[\s\S]*?<\/h2>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .trim();
}

function cell(value, column) {
  const formatted = formatDisplay(value, column);
  return escapeHtml(formatted.text);
}

function resolveColumns(rows, columns, sourceTable) {
  if (Array.isArray(columns) && columns.length) {
    return columns.filter((column) => column && column.label);
  }
  return Object.keys(rows[0] || {}).map((key) => {
    const label = headingFor(key, { sourceTable });
    return label ? { key, label } : null;
  }).filter(Boolean);
}

function tableHtml(rows, columns, sourceTable) {
  if (!rows.length) return "";
  const cols = resolveColumns(rows, columns, sourceTable);
  if (!cols.length) return "";
  const head = cols.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${cols.map((col) => `<td>${cell(row[col.key], col.key)}</td>`).join("")}</tr>`).join("");
  return `<div class="cms-ai-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function numericKey(rows) {
  const columns = Object.keys(rows[0] || {});
  return columns.find((col) => rows.every((row) => row[col] == null || typeof row[col] === "number"));
}

function labelKey(rows, valueKey) {
  const columns = Object.keys(rows[0] || {});
  return columns.find((col) => col !== valueKey && typeof rows[0][col] === "string") || columns.find((col) => col !== valueKey) || columns[0];
}

function wantsChart(question, rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const asked = /\b(chart|graph|plot|trend|compare|comparison|breakdown)\b/i.test(String(question || ""));
  const valueKey = numericKey(rows);
  if (!valueKey) return false;
  const distinct = new Set(rows.map((row) => row[valueKey])).size;
  return asked || (rows.length >= 2 && rows.length <= 24 && distinct > 1);
}

function chartHtml(rows, columns, sourceTable) {
  if (!rows.length) return "";
  const valueKey = numericKey(rows);
  if (!valueKey) return "";
  const key = labelKey(rows, valueKey);
  const series = rows.slice(0, 12);
  const values = series.map((row) => Number(row[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const width = Math.max(240, 36 + series.length * 36);
  const bars = series.map((row, index) => {
    const height = Math.round((Number(row[valueKey]) || 0) / max * 88);
    const x = 28 + index * 36;
    const label = formatDisplay(row[key], key).text.slice(0, 10);
    const amount = formatDisplay(row[valueKey], valueKey).text;
    return `<g><rect x="${x}" y="${100 - height}" width="22" height="${height}" fill="#1B4D3E"></rect><text x="${x}" y="114">${escapeHtml(label)}</text><text x="${x}" y="${Math.max(12, 96 - height)}">${escapeHtml(amount)}</text></g>`;
  }).join("");
  return `<svg class="cms-ai-chart" viewBox="0 0 ${width} 128" role="img" width="100%" aria-label="Chart">${bars}</svg>`;
}

function normalizeTable(html) {
  return String(html || "")
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeRepeatedTables(html) {
  const seen = new Set();
  return String(html || "").replace(/<div class="cms-ai-table-wrap">[\s\S]*?<\/div>|<table[\s\S]*?<\/table>/gi, (block) => {
    const key = normalizeTable(block);
    if (!key) return block;
    if (seen.has(key)) return "";
    seen.add(key);
    return block;
  });
}

function buildHtml({ question, narrative, rows, columns, sourceTable, includeEmptyNotice = true }) {
  const data = Array.isArray(rows) ? rows : [];
  const explanation = formatNarrativeDates(stripVisualBlocks(narrative));
  const heading = `<h2>${escapeHtml(question || "Results")}</h2>`;
  const story = explanation
    ? explanation
    : (data.length ? "<p>Results from authorized records.</p>" : "");
  if (!data.length) {
    const empty = includeEmptyNotice
      ? "<p>No matching records were found for the authorized tenant and branch.</p>"
      : "";
    return dedupeRepeatedTables(["<section class=\"cms-ai-report\">", heading, story, empty, "</section>"].filter(Boolean).join(""));
  }
  const chart = wantsChart(question, data) ? chartHtml(data, columns, sourceTable) : "";
  const table = tableHtml(data, columns, sourceTable);
  return dedupeRepeatedTables([
    "<section class=\"cms-ai-report\">",
    // heading,
    story,
    chart,
    table,
    "</section>"
  ].filter(Boolean).join(""));
}

module.exports = {
  escapeHtml,
  escapeAttr,
  sanitizeHtml,
  stripVisualBlocks,
  tableHtml,
  chartHtml,
  wantsChart,
  dedupeRepeatedTables,
  buildHtml,
  formatNumber
};
