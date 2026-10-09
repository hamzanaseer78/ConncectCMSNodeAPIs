const {
  SUPPORTED_JOB_GROUPS,
  MONEY_METRICS,
  getChart,
  listCharts
} = require("./chart-registry");

const PALETTE = Object.freeze([
  "#1B4D3E",
  "#3D7A6A",
  "#C4A35A",
  "#4C6E8C",
  "#8C5A4C",
  "#5C6B8A",
  "#6B8F71",
  "#A15C48",
  "#3E6B8A",
  "#7A8450"
]);

const PART_LIMIT = 8;

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMetric(value, format) {
  const number = Number(value) || 0;
  if (format === "money") return Math.round(number * 100) / 100;
  return Math.round(number);
}

function mergeRows(rows, format) {
  const order = [];
  const totals = new Map();
  let malformed = 0;
  (rows || []).forEach((row) => {
    const label = String(row?.label || row?.name || "").trim() || "None";
    const value = numberOrNull(row?.value);
    if (value == null) {
      malformed += 1;
      return;
    }
    if (!totals.has(label)) order.push(label);
    totals.set(label, (totals.get(label) || 0) + value);
  });
  return {
    rows: order.map((label) => ({ label, value: roundMetric(totals.get(label), format) })),
    malformed
  };
}

function sumRows(rows) {
  return rows.reduce((total, row) => total + (Number(row.value) || 0), 0);
}

function applyTop(rows, topN, total, format) {
  const sorted = rows.slice().sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const limit = topN || sorted.length;
  if (sorted.length <= limit) return { rows: sorted, other: null, truncatedWithoutOther: false };
  const head = sorted.slice(0, limit);
  const knownTotal = numberOrNull(total);
  if (knownTotal == null) return { rows: head, other: null, truncatedWithoutOther: true };
  const other = roundMetric(knownTotal - sumRows(head), format);
  if (other > 0) return { rows: head.concat([{ label: "Other", value: other }]), other, truncatedWithoutOther: false };
  return { rows: head, other: null, truncatedWithoutOther: false };
}

function baseOptions(apexType, title, note) {
  return {
    chart: {
      type: apexType,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "inherit",
      stacked: false
    },
    title: { text: title || "" },
    subtitle: note ? { text: note } : undefined,
    colors: PALETTE.slice(),
    dataLabels: { enabled: false },
    legend: { position: "bottom", fontSize: "12px" },
    tooltip: { shared: true, intersect: false },
    stroke: { width: 2, curve: "smooth" },
    grid: { borderColor: "#E6EBE8" }
  };
}

function categoryAxis(categories, horizontal) {
  return {
    categories,
    labels: {
      rotate: horizontal ? 0 : -35,
      trim: true,
      hideOverlappingLabels: true,
      maxHeight: 96
    }
  };
}

function renderCategory(rows, decision) {
  const horizontal = Boolean(decision.horizontal);
  const options = baseOptions("bar", decision.title, decision.note);
  options.plotOptions = { bar: { horizontal, barHeight: "72%", distributed: false } };
  options.xaxis = categoryAxis(rows.map((row) => row.label), horizontal);
  options.yaxis = { title: { text: decision.yLabel || "Value" }, decimalsInFloat: decision.format === "money" ? 2 : 0 };
  return {
    options,
    series: [{ name: decision.seriesName || decision.yLabel || "Value", data: rows.map((row) => row.value) }]
  };
}

function renderMultiBar(dataset, decision) {
  const options = baseOptions("bar", decision.title, decision.note);
  const stacked = Boolean(decision.stacking);
  options.chart.stacked = stacked;
  options.plotOptions = { bar: { horizontal: Boolean(decision.horizontal), stacked } };
  options.xaxis = categoryAxis(dataset.categories, decision.horizontal);
  options.legend = { position: "bottom" };
  return { options, series: dataset.series };
}

function renderLineLike(dataset, decision, apexType) {
  const options = baseOptions(apexType, decision.title, decision.note);
  options.chart.stacked = Boolean(decision.stacking);
  options.xaxis = categoryAxis(dataset.categories, false);
  options.stroke = { curve: "smooth", width: 2 };
  return { options, series: dataset.series };
}

function renderSlice(rows, decision, apexType) {
  const options = baseOptions(apexType, decision.title, decision.note);
  options.labels = rows.map((row) => row.label);
  options.stroke = { width: 0 };
  options.tooltip = { shared: false, intersect: false };
  options.dataLabels = { enabled: rows.length <= 6 };
  options.legend = { position: "bottom", fontSize: "12px" };
  return { options, series: rows.map((row) => row.value) };
}

function renderTreemap(rows, decision) {
  const options = baseOptions("treemap", decision.title, decision.note);
  options.legend = { show: false };
  options.dataLabels = { enabled: true };
  return {
    options,
    series: [{ data: rows.map((row) => ({ x: row.label, y: row.value })) }]
  };
}

function renderHeatmap(dataset, decision) {
  const options = baseOptions("heatmap", decision.title, decision.note);
  options.tooltip = { shared: false };
  options.dataLabels = { enabled: dataset.categories.length <= 14 };
  options.xaxis = categoryAxis(dataset.categories, false);
  return { options, series: dataset.series };
}

function renderRadar(dataset, decision) {
  const options = baseOptions("radar", decision.title, decision.note);
  options.xaxis = { categories: dataset.categories };
  options.yaxis = { show: false };
  return { options, series: dataset.series };
}

function renderScatter(dataset, decision) {
  const options = baseOptions(decision.apexType, decision.title, decision.note);
  options.xaxis = { title: { text: decision.xLabel || "X" }, tickAmount: 6 };
  options.yaxis = { title: { text: decision.yLabel || "Y" } };
  return { options, series: dataset.series };
}

function renderCombo(dataset, decision) {
  const options = baseOptions("line", decision.title, decision.note);
  options.stroke = { width: dataset.series.map((series, index) => (series.type === "line" ? 3 : 0)) };
  options.xaxis = categoryAxis(dataset.categories, false);
  return { options, series: dataset.series };
}

function renderPareto(rows, decision) {
  const values = rows.map((row) => row.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  let running = 0;
  const share = values.map((value) => {
    running += value;
    return total ? Math.round((running / total) * 1000) / 10 : 0;
  });
  const options = baseOptions("line", decision.title, decision.note);
  options.stroke = { width: [0, 3] };
  options.xaxis = categoryAxis(rows.map((row) => row.label), false);
  options.yaxis = [
    { title: { text: decision.yLabel || "Value" }, decimalsInFloat: decision.format === "money" ? 2 : 0 },
    { opposite: true, min: 0, max: 100, title: { text: "Cumulative share %" }, decimalsInFloat: 1 }
  ];
  return {
    options,
    series: [
      { name: decision.seriesName || decision.yLabel || "Value", type: "column", data: values },
      { name: "Cumulative share", type: "line", data: share }
    ]
  };
}

function renderHistogram(dataset, decision) {
  const options = baseOptions("histogram", decision.title, decision.note);
  options.xaxis = categoryAxis(dataset.bins.map((bin) => bin.label), false);
  return { options, series: [{ name: "Count", data: dataset.bins.map((bin) => bin.value) }] };
}

function renderBoxPlot(dataset, decision) {
  const options = baseOptions("boxPlot", decision.title, decision.note);
  return {
    options,
    series: [{
      name: decision.seriesName || "Distribution",
      data: dataset.boxes.map((box) => ({
        x: box.label,
        y: [box.min, box.q1, box.median, box.q3, box.max]
      }))
    }]
  };
}

function renderCandlestick(dataset, decision) {
  const options = baseOptions("candlestick", decision.title, decision.note);
  return {
    options,
    series: [{
      data: dataset.ohlc.map((row) => ({ x: row.label, y: [row.open, row.high, row.low, row.close] }))
    }]
  };
}

function renderRange(dataset, decision) {
  const options = baseOptions("rangeBar", decision.title, decision.note);
  options.plotOptions = { bar: { horizontal: true } };
  return {
    options,
    series: [{
      data: dataset.ranges.map((row) => ({ x: row.label, y: [row.start, row.end] }))
    }]
  };
}

function renderRadial(dataset, decision) {
  const target = Number(dataset.gauge.target);
  const value = Number(dataset.gauge.value);
  const percent = target ? Math.round((value / target) * 1000) / 10 : 0;
  const options = baseOptions("radialBar", decision.title, decision.note);
  options.labels = [dataset.gauge.label || "Progress"];
  options.plotOptions = { radialBar: { dataLabels: { name: { show: true }, value: { show: true } } } };
  return { options, series: [percent] };
}

function seriesCount(dataset) {
  if (Array.isArray(dataset?.series)) return dataset.series.length;
  return 0;
}

function describeData(dataset, format) {
  if (!dataset || typeof dataset !== "object") return { kind: "empty", malformed: 0 };
  if (Array.isArray(dataset.ohlc) && dataset.ohlc.length) return { kind: "ohlc" };
  if (Array.isArray(dataset.ranges) && dataset.ranges.length) return { kind: "range" };
  if (Array.isArray(dataset.boxes) && dataset.boxes.length) return { kind: "distribution" };
  if (Array.isArray(dataset.bins) && dataset.bins.length) return { kind: "bins", malformed: 0 };
  if (dataset.gauge && numberOrNull(dataset.gauge.target) != null && numberOrNull(dataset.gauge.value) != null) {
    return { kind: "gauge", hasTarget: true };
  }
  if (Array.isArray(dataset.matrix) && dataset.matrix.length) {
    return { kind: "matrix", seriesCount: dataset.matrix.length, categories: dataset.categories || [] };
  }
  if (Array.isArray(dataset.points) && dataset.points.length) {
    const measures = dataset.points.some((point) => numberOrNull(point.z) != null) ? 3 : 2;
    return { kind: "xy", measures };
  }
  if (Array.isArray(dataset.series) && dataset.series.length && Array.isArray(dataset.categories)) {
    const sameUnit = dataset.series.every((series) => !series.unit || series.unit === dataset.series[0].unit);
    return {
      kind: "time",
      seriesCount: dataset.series.length,
      sameUnitMeasures: sameUnit ? dataset.series.length : 1,
      categories: dataset.categories
    };
  }
  if (Array.isArray(dataset.rows)) {
    const merged = mergeRows(dataset.rows, format);
    return {
      kind: merged.rows.length ? "category" : "empty",
      rows: merged.rows,
      malformed: merged.malformed,
      seriesCount: 1,
      sameUnitMeasures: 1
    };
  }
  return { kind: "empty", malformed: 0 };
}

function yLabelFor(metric) {
  if (metric === "jobs") return "Jobs";
  if (metric === "amountToCollect") return "Amount to collect";
  if (metric === "expenses") return "Expenses";
  if (metric === "collected") return "Collected cash";
  return "Value";
}

function decideChart(request, described) {
  const requested = getChart(request.requestedType);
  const fallbackId = described.kind === "time" || request.grain ? "line" : "bar";
  const notices = [];
  if (request.forecast) {
    notices.push("A forecast is not available because no forecasting model is stored. The chart shows the actual values.");
  }

  const choose = (id, reason) => {
    const chart = getChart(id) || getChart("bar");
    if (reason) notices.push(reason);
    return {
      id: chart.id,
      apexType: chart.apexType,
      stacking: Boolean(chart.stacked && request.stacking !== false && described.seriesCount >= 2),
      horizontal: Boolean(chart.horizontal || request.horizontal),
      notice: notices.filter(Boolean).join(" "),
      requestedType: request.requestedType || null
    };
  };

  if (!requested) return choose(fallbackId);

  if (!requested.supported || requested.requiresTarget) {
    return choose(requested.alternative || "bar", requested.reason);
  }
  if (requested.requiresDistribution && described.kind !== "distribution" && described.kind !== "bins") {
    return choose(requested.alternative || "bar", requested.reason);
  }
  if (requested.requiresOhlc && described.kind !== "ohlc") {
    return choose(requested.alternative || "line", requested.reason);
  }
  if (requested.requiresRange && described.kind !== "range") {
    return choose(requested.alternative || "bar", requested.reason);
  }
  if (requested.id === "heatmap" && described.kind !== "matrix") {
    return choose("bar", "A heatmap needs two dimensions, such as day and status. This result has one dimension, so it is a bar chart.");
  }
  if (requested.id === "scatter" && described.kind !== "xy") {
    return choose("bar", "A scatter plot needs two numeric measures. This result has one, so it is a bar chart.");
  }
  if (requested.id === "bubble" && !(described.kind === "xy" && described.measures >= 3)) {
    return choose("bar", "A bubble chart needs three numeric measures. This result does not, so it is a bar chart.");
  }
  if (requested.id === "radar" && !(described.sameUnitMeasures >= 3)) {
    return choose("horizontal_bar", requested.reason);
  }
  if ((requested.stacked || request.stacking) && described.seriesCount < 2 && described.kind === "category") {
    return choose("bar", "Stacking needs more than one series. This result has one value per category, so it is a bar chart.");
  }
  if (["pie", "donut", "polarArea", "treemap"].includes(requested.id) && described.seriesCount > 1) {
    return choose("bar", "This chart type shows one series. The comparison has more than one series, so it is a bar chart.");
  }
  if (requested.id === "pareto" && described.kind !== "category") {
    return choose("bar", "A Pareto chart ranks one measure. This result is not a ranked category breakdown.");
  }
  return choose(requested.id);
}

function prepareRows(described, dataset, request) {
  const format = request.format === "money" ? "money" : "number";
  let rows = described.rows || [];
  const partChart = ["pie", "donut", "polarArea", "treemap"].includes(request.renderId);
  const limit = request.topN || (partChart ? PART_LIMIT : null);
  const total = numberOrNull(dataset.total);
  const prepared = limit ? applyTop(rows, limit, dataset.complete ? sumRows(rows) : total, format) : { rows, other: null, truncatedWithoutOther: false };
  return prepared;
}

function buildChart(request = {}, dataset = {}) {
  const format = request.format === "money" ? "money" : "number";
  const described = describeData(dataset, format);
  const decision = decideChart(request, described);
  decision.format = format;
  decision.title = request.title || "";
  decision.yLabel = request.yLabel || yLabelFor(request.metric);
  decision.seriesName = request.seriesName || decision.yLabel;
  if (request.horizontal && decision.id !== "bar") decision.horizontal = true;
  const notices = [decision.notice];
  if (described.malformed) notices.push("Values that were not numbers were left off the chart.");

  const specification = {
    businessEntity: request.businessEntity || null,
    metric: request.metric || null,
    aggregation: request.aggregation || (request.metric === "jobs" ? "count" : request.metric ? "sum" : null),
    groupingDimensions: request.groupingDimensions || [],
    xAxis: request.xAxis || null,
    yAxis: request.yAxis || decision.yLabel,
    series: [],
    chartType: decision.id,
    requestedChartType: request.requestedType || null,
    stacking: false,
    sorting: request.sorting || "desc",
    topN: request.topN || null,
    dateRange: request.dateRange || null,
    comparisonPeriod: Boolean(request.comparison),
    businessFilters: request.businessFilters || [],
    formatting: format,
    outputFormat: "chart",
    apexType: decision.apexType,
    limitation: null,
    horizontal: Boolean(decision.horizontal)
  };

  if (described.kind === "empty") {
    specification.limitation = notices.filter(Boolean).join(" ") || "There is no data for this chart.";
    return { ok: true, empty: true, chart: null, specification, notice: specification.limitation };
  }

  let chart = null;
  if (decision.id === "heatmap" && described.kind === "matrix") {
    chart = renderHeatmap({ categories: dataset.categories || [], series: dataset.matrix }, decision);
  } else if (decision.id === "radar" && described.kind === "time") {
    chart = renderRadar(dataset, decision);
  } else if ((decision.id === "scatter" || decision.id === "bubble") && described.kind === "xy") {
    const series = [{
      name: decision.seriesName,
      data: dataset.points.map((point) => (
        decision.id === "bubble" ? [point.x, point.y, point.z] : [point.x, point.y]
      ))
    }];
    chart = renderScatter({ series }, { ...decision, apexType: decision.apexType });
  } else if (decision.id === "histogram" && described.kind === "bins") {
    chart = renderHistogram(dataset, decision);
  } else if (decision.id === "boxPlot" && described.kind === "distribution") {
    chart = renderBoxPlot(dataset, decision);
  } else if (decision.id === "candlestick" && described.kind === "ohlc") {
    chart = renderCandlestick(dataset, decision);
  } else if (decision.id === "rangeBar" && described.kind === "range") {
    chart = renderRange(dataset, decision);
  } else if (decision.id === "radialBar" && described.kind === "gauge") {
    chart = renderRadial(dataset, decision);
  } else if (decision.id === "combo" && described.kind === "time") {
    const series = dataset.series.map((item, index) => ({
      name: item.name,
      type: item.type || (index === dataset.series.length - 1 ? "line" : "column"),
      data: item.data
    }));
    chart = renderCombo({ categories: dataset.categories, series }, decision);
  } else if (decision.id === "pareto" && described.kind === "category") {
    const prepared = prepareRows({ ...described }, dataset, { ...request, renderId: "pareto", topN: request.topN });
    if (prepared.truncatedWithoutOther || (!dataset.complete && numberOrNull(dataset.total) == null && prepared.rows.length < (described.rows || []).length)) {
      notices.push("A Pareto chart needs the full set of values. The complete total is not available, so this is a bar chart of the rows that were returned.");
      decision.id = "bar";
      decision.apexType = "bar";
      chart = renderCategory(prepared.rows, decision);
    } else {
      chart = renderPareto(prepared.rows, decision);
    }
  } else if (described.kind === "time" && ["line", "area", "stacked_area", "stacked_bar", "grouped_bar", "bar"].includes(decision.id)) {
    const apex = decision.apexType === "area" ? "area" : decision.id === "line" ? "line" : "bar";
    if (apex === "bar") chart = renderMultiBar(dataset, { ...decision, stacking: decision.id === "stacked_bar" || request.stacking });
    else chart = renderLineLike(dataset, { ...decision, stacking: decision.id === "stacked_area" || request.stacking }, apex);
  } else if (described.kind === "category") {
    const part = ["pie", "donut", "polarArea", "treemap"].includes(decision.id);
    const prepared = prepareRows(described, dataset, { ...request, renderId: decision.id, topN: request.topN || (part ? PART_LIMIT : null) });
    if (prepared.truncatedWithoutOther) notices.push("Some categories are hidden because the full total was not available, so they were not grouped as Other.");
    if (prepared.other) notices.push("Smaller categories are combined as Other. The table lists the named rows.");
    if (decision.id === "treemap") chart = renderTreemap(prepared.rows, decision);
    else if (decision.apexType === "pie" || decision.apexType === "donut" || decision.apexType === "polarArea") {
      chart = renderSlice(prepared.rows, decision, decision.apexType);
    } else if (decision.horizontal) chart = renderCategory(prepared.rows, { ...decision, horizontal: true });
    else chart = renderCategory(prepared.rows, decision);
  } else if (described.kind === "time") {
    chart = renderLineLike(dataset, decision, "line");
  }

  if (!chart) {
    specification.chartType = decision.id;
    specification.limitation = notices.filter(Boolean).join(" ") || "This chart cannot be drawn from the returned data.";
    return { ok: true, empty: true, chart: null, specification, notice: specification.limitation };
  }

  specification.chartType = decision.id;
  specification.apexType = chart.options.chart.type;
  specification.stacking = Boolean(chart.options.chart.stacked || chart.options.plotOptions?.bar?.stacked);
  specification.series = Array.isArray(chart.series)
    ? chart.series.map((item) => (typeof item === "number" ? null : item.name)).filter(Boolean)
    : [];
  if (!specification.series.length && decision.seriesName) specification.series = [decision.seriesName];
  specification.limitation = notices.filter(Boolean).join(" ") || null;
  if (specification.limitation && chart.options) {
    chart.options.subtitle = { text: specification.limitation };
  }
  return { ok: true, empty: false, chart, specification, notice: specification.limitation };
}

function limitationFor(entry) {
  if (!entry) return null;
  if (!entry.supported || entry.requiresTarget) return entry.reason;
  if (entry.id === "radar") return entry.reason;
  if (entry.requiresDistribution || entry.requiresOhlc || entry.requiresRange) return entry.reason;
  return null;
}

function apexTypeFor(id, fallback) {
  if (!id) return fallback;
  const chart = getChart(id);
  if (!chart) return fallback;
  if (!chart.supported || chart.requiresTarget || chart.requiresDistribution || chart.requiresOhlc || chart.requiresRange) {
    const alternative = getChart(chart.alternative || "bar");
    return alternative ? alternative.apexType : "bar";
  }
  if (chart.id === "radar") return "bar";
  return chart.apexType;
}

function planChart(state) {
  const filters = state?.filters || {};
  const chartIntent = state?.intent === "ENTITY_CHART";
  const requested = filters.chartType || null;
  const entry = getChart(requested);
  const group = filters.groupBy && SUPPORTED_JOB_GROUPS.has(filters.groupBy) ? filters.groupBy : null;
  const metrics = Array.isArray(filters.metrics) ? filters.metrics.filter((metric) => MONEY_METRICS.has(metric) || metric === "jobs") : [];
  const money = metrics.filter((metric) => MONEY_METRICS.has(metric));
  const statusSeries = Array.isArray(filters.statusSeries) ? filters.statusSeries : [];
  const entity = state?.entity || null;
  const financial = entity === "revenue" || entity === "expenses" || entity === "collections";
  let rendered = chartIntent ? apexTypeFor(requested, financial || filters.grain ? "line" : "bar") : null;
  let tool = null;
  let report = null;
  let limitation = chartIntent ? limitationFor(entry) : null;

  if (chartIntent && statusSeries.length >= 2) {
    tool = "statusTrend";
    if (!requested) rendered = "line";
  } else if (chartIntent && requested === "heatmap") {
    if (group && filters.grain) {
      tool = "jobsHeatmap";
      rendered = "heatmap";
      limitation = null;
    } else {
      tool = group ? "getReport" : null;
      report = group ? `jobs_by_${group}` : null;
      rendered = "bar";
      limitation = "A heatmap needs two dimensions, such as day and status.";
    }
  } else if (chartIntent && ((financial && !group) || (money.length && !group && entity !== "jobs"))) {
    tool = "buildMoneyChart";
    if (!requested) rendered = "line";
    if (requested === "combo" || requested === "pareto") rendered = "line";
  } else if (chartIntent && group) {
    tool = "getReport";
    report = `jobs_by_${group}`;
  } else if (chartIntent && filters.grain) {
    tool = "jobCountTrend";
    if (!requested) rendered = "line";
  } else if (chartIntent) {
    tool = "getReport";
    report = "jobs_by_status";
  }

  if (chartIntent && filters.forecast) {
    limitation = [limitation, "A forecast is not available because no forecasting model is stored. The chart shows the actual values."]
      .filter(Boolean)
      .join(" ");
  }

  return {
    tool,
    report,
    chartType: requested,
    renderedChartType: rendered,
    status: filters.status || null,
    range: filters.range || null,
    subjectType: filters.subject?.type || null,
    subjectId: filters.subject?.id || null,
    searchCandidates: filters.requestedName ? [filters.requestedName] : [],
    tenantScoped: true,
    branchScoped: true,
    limitation,
    metric: filters.metric || metrics[0] || (financial ? null : "jobs"),
    stacking: Boolean(filters.stacking),
    horizontal: Boolean(filters.horizontal) || requested === "horizontal_bar",
    topN: filters.topN || null,
    grain: filters.grain || null,
    comparison: Boolean(state?.comparison),
    statusSeries
  };
}

function registeredRendererIds() {
  return listCharts().map((chart) => chart.id);
}

module.exports = {
  PALETTE,
  buildChart,
  planChart,
  describeData,
  mergeRows,
  applyTop,
  registeredRendererIds,
  yLabelFor
};
