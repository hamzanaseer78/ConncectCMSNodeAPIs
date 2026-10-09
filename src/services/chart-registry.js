/**
 * Chart capabilities of apexcharts-clevision 3.28.5, the library used by the chat.
 * A chart is added by registering it here. Intent parsing matches aliases from this list.
 * Types the library cannot draw stay unsupported and are never labeled as another chart.
 */

const LIBRARY = "apexcharts-clevision@3.28.5";

const APEX_TYPES = new Set([
  "line",
  "area",
  "bar",
  "histogram",
  "pie",
  "donut",
  "radialBar",
  "scatter",
  "bubble",
  "heatmap",
  "candlestick",
  "boxPlot",
  "radar",
  "polarArea",
  "rangeBar",
  "treemap"
]);

const SUPPORTED_JOB_GROUPS = new Set([
  "status", "technician", "customer", "category", "fault", "group", "brand", "source", "area", "city"
]);

const MONEY_METRICS = new Set(["amountToCollect", "expenses", "collected"]);
const COUNT_METRICS = new Set(["jobs"]);

function define(entry) {
  if (entry.supported && entry.apexType && !APEX_TYPES.has(entry.apexType)) {
    throw new Error(`${entry.id} claims an ApexCharts type this library does not provide`);
  }
  return Object.freeze({
    supported: false,
    stacked: false,
    horizontal: false,
    requiresTarget: false,
    requiresDistribution: false,
    requiresOhlc: false,
    requiresRange: false,
    maxDimensions: 1,
    alternative: "bar",
    reason: null,
    ...entry,
    aliases: Object.freeze(entry.aliases || [])
  });
}

const CHARTS = [
  define({
    id: "bar",
    apexType: "bar",
    supported: true,
    shape: "category",
    aliases: ["bar chart", "bar graph", "column chart", "column graph", "bar"],
    alternative: null
  }),
  define({
    id: "horizontal_bar",
    apexType: "bar",
    supported: true,
    shape: "category",
    horizontal: true,
    aliases: ["horizontal bar chart", "horizontal bar graph", "horizontal bar"],
    alternative: null
  }),
  define({
    id: "stacked_bar",
    apexType: "bar",
    supported: true,
    shape: "category",
    stacked: true,
    maxDimensions: 2,
    aliases: ["stacked horizontal bar chart", "stacked horizontal bar", "stacked bar chart", "stacked bar graph", "stacked column chart", "stacked bar"],
    alternative: null
  }),
  define({
    id: "grouped_bar",
    apexType: "bar",
    supported: true,
    shape: "category",
    maxDimensions: 2,
    aliases: ["grouped bar chart", "grouped bar"],
    alternative: null
  }),
  define({
    id: "line",
    apexType: "line",
    supported: true,
    shape: "time",
    aliases: ["line chart", "line graph", "multi-line chart", "multi line chart", "time series", "time-series", "line"],
    alternative: null
  }),
  define({
    id: "area",
    apexType: "area",
    supported: true,
    shape: "time",
    aliases: ["area chart", "area graph"],
    alternative: null
  }),
  define({
    id: "stacked_area",
    apexType: "area",
    supported: true,
    shape: "time",
    stacked: true,
    maxDimensions: 2,
    aliases: ["stacked area chart", "stacked area"],
    alternative: null
  }),
  define({
    id: "pie",
    apexType: "pie",
    supported: true,
    shape: "part",
    aliases: ["pie chart", "pie graph", "pie"],
    alternative: null
  }),
  define({
    id: "donut",
    apexType: "donut",
    supported: true,
    shape: "part",
    aliases: ["doughnut chart", "donut chart", "doughnut graph", "donut graph", "doughnut", "donut"],
    alternative: null
  }),
  define({
    id: "polarArea",
    apexType: "polarArea",
    supported: true,
    shape: "part",
    aliases: ["polar area chart", "polar area"],
    alternative: null
  }),
  define({
    id: "treemap",
    apexType: "treemap",
    supported: true,
    shape: "part",
    aliases: ["treemap", "tree map"],
    alternative: null
  }),
  define({
    id: "scatter",
    apexType: "scatter",
    supported: true,
    shape: "xy",
    maxDimensions: 2,
    aliases: ["scatter plot", "scatter chart", "scatter"],
    alternative: null
  }),
  define({
    id: "bubble",
    apexType: "bubble",
    supported: true,
    shape: "xy",
    maxDimensions: 3,
    aliases: ["bubble chart", "bubble"],
    alternative: null
  }),
  define({
    id: "radar",
    apexType: "radar",
    supported: true,
    shape: "radar",
    aliases: ["radar chart", "radar"],
    alternative: "horizontal_bar",
    reason: "A radar chart needs at least three measures on the same scale."
  }),
  define({
    id: "heatmap",
    apexType: "heatmap",
    supported: true,
    shape: "matrix",
    maxDimensions: 2,
    aliases: ["heat map", "heatmap"],
    alternative: null
  }),
  define({
    id: "combo",
    apexType: "line",
    supported: true,
    shape: "combo",
    maxDimensions: 2,
    aliases: ["combo chart", "combination chart", "combo"],
    alternative: null
  }),
  define({
    id: "pareto",
    apexType: "line",
    supported: true,
    shape: "pareto",
    aliases: ["pareto chart", "pareto"],
    alternative: null
  }),
  define({
    id: "histogram",
    apexType: "histogram",
    supported: true,
    shape: "distribution",
    requiresDistribution: true,
    aliases: ["histogram"],
    reason: "A histogram needs a numeric distribution. Job counts by category are not a distribution."
  }),
  define({
    id: "boxPlot",
    apexType: "boxPlot",
    supported: true,
    shape: "distribution",
    requiresDistribution: true,
    aliases: ["box plot", "boxplot"],
    reason: "A box plot needs a five-number summary, and these records do not store one."
  }),
  define({
    id: "candlestick",
    apexType: "candlestick",
    supported: true,
    shape: "ohlc",
    requiresOhlc: true,
    alternative: "line",
    aliases: ["candlestick chart", "candlestick"],
    reason: "A candlestick chart needs open, high, low, and close prices. Jobs do not store those."
  }),
  define({
    id: "rangeBar",
    apexType: "rangeBar",
    supported: true,
    shape: "range",
    requiresRange: true,
    aliases: ["range bar", "range bar chart"],
    reason: "A range bar needs a start and end value. This result does not have ranges."
  }),
  define({
    id: "radialBar",
    apexType: "radialBar",
    supported: true,
    shape: "gauge",
    requiresTarget: true,
    aliases: ["radial bar", "gauge chart", "gauge"],
    reason: "A gauge needs a measure and a target. Jobs do not store a target."
  }),
  define({
    id: "bullet",
    apexType: null,
    supported: false,
    shape: "bullet",
    requiresTarget: true,
    aliases: ["bullet graph", "bullet chart", "bullet"],
    reason: "A bullet chart compares a measure with a target and performance ranges. This app's chart library has no bullet chart, and jobs do not store a customer target or performance ranges."
  }),
  define({
    id: "funnel",
    apexType: null,
    supported: false,
    shape: "funnel",
    aliases: ["funnel chart", "funnel"],
    reason: "This chart library has no funnel chart."
  }),
  define({
    id: "waterfall",
    apexType: null,
    supported: false,
    shape: "waterfall",
    aliases: ["waterfall chart", "waterfall"],
    reason: "This chart library has no waterfall chart."
  })
];

const BY_ID = new Map(CHARTS.map((chart) => [chart.id, chart]));

const ALIASES = CHARTS
  .flatMap((chart) => chart.aliases.map((alias) => ({ alias, chart })))
  .sort((a, b) => b.alias.length - a.alias.length);

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
}

function aliasPattern(alias) {
  return new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
}

function findChartMention(text) {
  const normalized = normalizeText(text);
  for (const item of ALIASES) {
    if (aliasPattern(item.alias).test(normalized)) return { chart: item.chart, alias: item.alias };
  }
  return null;
}

const CHART_FILLERS = /\b(please|make|change|turn|switch|it|its|a|an|the|this|that|these|those|chart|charts|graph|graphs|to|into|as|now|show|me|just|want|i|would|like|of|for|my|same|data)\b/g;

function leftoverAfterChart(text) {
  const found = findChartMention(text);
  if (!found) return normalizeText(text);
  const rest = normalizeText(text).replace(aliasPattern(found.alias), " ");
  return rest.replace(CHART_FILLERS, " ").replace(/\s+/g, " ").trim();
}

function isChartTypeOnly(text) {
  const found = findChartMention(text);
  if (!found) return false;
  return leftoverAfterChart(text).length === 0;
}

function isChartModifierOnly(text) {
  if (findChartMention(text)) return false;
  const normalized = normalizeText(text);
  if (!/\b(stacked|horizontal)\b/.test(normalized)) return false;
  const rest = normalized
    .replace(/\b(please|make|it|a|an|the|this|that|stacked|horizontal|chart|graph|now)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length === 0;
}

function getChart(id) {
  return BY_ID.get(id) || null;
}

function knownChartId(id) {
  return BY_ID.has(id) ? id : null;
}

function listCharts() {
  return CHARTS.slice();
}

function librarySupports(apexType) {
  return APEX_TYPES.has(apexType);
}

module.exports = {
  LIBRARY,
  APEX_TYPES,
  SUPPORTED_JOB_GROUPS,
  MONEY_METRICS,
  COUNT_METRICS,
  CHARTS,
  findChartMention,
  isChartTypeOnly,
  isChartModifierOnly,
  getChart,
  knownChartId,
  listCharts,
  librarySupports,
  normalizeText
};
