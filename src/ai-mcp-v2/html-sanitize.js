const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "div", "span", "section", "br", "svg", "rect", "text", "g", "line",
  "circle", "path", "polyline", "polygon"
]);

const ALLOWED_ATTRS = new Set([
  "class", "colspan", "rowspan", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "fill", "stroke", "viewbox", "role", "scope", "d", "points",
  "transform", "aria-label", "aria-hidden", "aria-labelledby"
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function allowedAttrName(name) {
  const key = String(name || "").toLowerCase();
  return ALLOWED_ATTRS.has(key) || /^aria-[\w-]+$/.test(key);
}

function isSafeAttrValue(value) {
  const text = String(value || "");
  if (/^\s*javascript:/i.test(text) || /^\s*data:/i.test(text) || /^\s*vbscript:/i.test(text)) {
    return false;
  }
  return !/[<>]/.test(text);
}

function sanitizeWithLibrary(html) {
  let sanitizeHtmlLib;
  try {
    sanitizeHtmlLib = require("sanitize-html");
  } catch {
    return null;
  }
  return sanitizeHtmlLib(String(html || ""), {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      "*": [...ALLOWED_ATTRS, "aria-label", "aria-hidden", "aria-labelledby"]
    },
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard"
  });
}

function fallbackSanitize(html) {
  const source = String(html || "");
  if (!source.trim()) return "";
  const without = source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|form|button|input|textarea|foreignObject)[\s\S]*?>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|form|button|input|textarea|foreignObject)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/data:/gi, "");
  return without.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag, attrs) => {
    const name = String(tag).toLowerCase();
    const closing = /^<\//.test(full);
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    const safeAttrs = String(attrs || "")
      .replace(/javascript:/gi, "")
      .match(/([a-zA-Z_:][-a-zA-Z0-9:_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g);
    const kept = [];
    (safeAttrs || []).forEach((part) => {
      const match = part.match(/^([^=]+)=(.*)$/);
      if (!match) return;
      const attr = String(match[1] || "").trim().toLowerCase();
      let value = String(match[2] || "").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!allowedAttrName(attr) || !isSafeAttrValue(value)) return;
      kept.push(`${attr}="${escapeHtml(value)}"`);
    });
    return kept.length ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
  });
}

function sanitizeHtml(html) {
  const source = String(html || "");
  if (!source.trim()) return "";
  const cleaned = sanitizeWithLibrary(source);
  return cleaned == null ? fallbackSanitize(source) : String(cleaned);
}

function looksLikeHtml(value) {
  return /<\s*[a-z][\s\S]*>/i.test(String(value || ""));
}

module.exports = {
  ALLOWED_TAGS,
  sanitizeHtml,
  fallbackSanitize,
  looksLikeHtml,
  escapeHtml
};
