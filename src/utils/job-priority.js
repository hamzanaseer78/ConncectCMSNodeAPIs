const PRIORITY_COLORS = Object.freeze({
  urgent: "#C0392B",
  high: "#E74C3C",
  medium: "#F39C12",
  normal: "#3498DB",
  low: "#27AE60"
});

const DEFAULT_PRIORITY_COLOR = "#95A5A6";

function normalizePriorityKey(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim().toLowerCase();
}

function resolvePriorityColor(priority) {
  const key = normalizePriorityKey(priority);
  if (!key) return null;
  return PRIORITY_COLORS[key] ?? DEFAULT_PRIORITY_COLOR;
}

module.exports = {
  PRIORITY_COLORS,
  DEFAULT_PRIORITY_COLOR,
  resolvePriorityColor
};
