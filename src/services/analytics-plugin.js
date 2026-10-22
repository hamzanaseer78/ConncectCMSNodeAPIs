const METRICS = new Set(["jobs", "amountToCollect", "expenses", "collected"]);
const GROUPS = new Set(["status", "technician", "customer", "category", "fault", "group", "brand", "source", "area", "city"]);
const RANGES = new Set([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "previous_month",
  "this_quarter",
  "this_year",
  "year_to_date",
  "previous_year",
  "custom"
]);

const TOOLS = Object.freeze([
  {
    name: "get_analytics_data",
    description: "Load tenant-scoped CMS totals for jobs, amount to collect, collections, and expenses."
  },
  {
    name: "generate_chart",
    description: "Build a chart from a CMS report. The chart type is inferred when the user does not name one."
  },
  {
    name: "compare_periods",
    description: "Compare a metric with the previous period of the same length."
  },
  {
    name: "compare_entities",
    description: "Compare a grouped CMS breakdown with the previous period."
  },
  {
    name: "forecast_metrics",
    description: "Project a metric from its own historical points. This does not invent a confidence interval."
  },
  {
    name: "analyze_trends",
    description: "Describe the direction of a historical series without adding future points."
  },
  {
    name: "explain_insights",
    description: "Summarize facts from a result. Facts stay separate from guesses."
  },
  {
    name: "get_drilldown_data",
    description: "Identify the highest row in a grouped result so the next request can open that record set."
  }
]);

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function compareValues(current, previous) {
  const next = Number(current);
  const prior = Number(previous);
  if (!Number.isFinite(next) || !Number.isFinite(prior)) {
    return {
      current: null,
      previous: null,
      difference: null,
      percentChange: null,
      direction: "unavailable"
    };
  }
  const difference = round(next - prior);
  const percentChange = prior === 0 ? null : round(((next - prior) / prior) * 100);
  let direction = "unchanged";
  if (difference > 0) direction = "up";
  if (difference < 0) direction = "down";
  return { current: next, previous: prior, difference, percentChange, direction };
}

function compareAligned(categories, left, right) {
  const labels = Array.isArray(categories) ? categories : [];
  const a = Array.isArray(left?.data) ? left.data : [];
  const b = Array.isArray(right?.data) ? right.data : [];
  return labels.map((label, index) => ({
    name: label,
    ...compareValues(a[index], b[index])
  }));
}

function linearStep(values, steps) {
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  values.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = denom === 0 ? values[0] : (sumY - slope * sumX) / n;
  return Array.from({ length: steps }, (_, index) => intercept + slope * (n + index));
}

function movingAverage(values) {
  const window = values.slice(-3);
  return window.reduce((sum, value) => sum + value, 0) / window.length;
}

function forecastSeries(values, horizon, options = {}) {
  const actuals = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value));
  const steps = Math.min(12, Math.max(1, Number(horizon) || 1));
  if (actuals.length < 3) {
    return {
      ok: false,
      method: null,
      horizon: steps,
      actualCount: actuals.length,
      minimum: 3,
      actuals,
      forecast: [],
      interval: null,
      backtest: null,
      assumptions: "At least three historical points are required.",
      reasonText: `A forecast needs at least 3 historical points. This series has ${actuals.length}, so only the actual values are shown.`
    };
  }

  const method = actuals.length >= 6 ? "linear_trend" : "moving_average";
  const raw = method === "linear_trend"
    ? linearStep(actuals, steps)
    : Array.from({ length: steps }, () => movingAverage(actuals));
  let clipped = false;
  const forecast = raw.map((value) => {
    if (value < 0) {
      clipped = true;
      return 0;
    }
    return round(value);
  });

  let backtest = null;
  if (actuals.length >= 4) {
    const hold = actuals.slice(0, -1);
    const predicted = method === "linear_trend" ? linearStep(hold, 1)[0] : movingAverage(hold);
    const shown = predicted < 0 ? 0 : round(predicted);
    backtest = {
      actual: actuals[actuals.length - 1],
      predicted: shown,
      error: round(actuals[actuals.length - 1] - shown)
    };
  }

  const clipNote = clipped ? " Negative projections were set to 0 because this measure cannot be negative." : "";
  return {
    ok: true,
    method,
    horizon: steps,
    actualCount: actuals.length,
    actuals,
    forecast,
    interval: null,
    backtest,
    clipped,
    assumptions: method === "linear_trend"
      ? `Straight-line trend from ${actuals.length} actual points.${clipNote}`
      : `Average of the latest 3 actual points, repeated for the horizon.${clipNote}`,
    reasonText: `The forecast is a ${method === "linear_trend" ? "straight-line trend" : "3-point moving average"} for the next ${steps} period${steps === 1 ? "" : "s"}. It is a projection, not a guaranteed outcome. No confidence interval is shown.${clipNote}`
  };
}

function nextCategory(label, step) {
  const month = /^(\d{4})-(\d{2})$/.exec(String(label || ""));
  if (month) {
    const date = new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1 + step, 1));
    return date.toISOString().slice(0, 7);
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(label || ""));
  if (day) {
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + step));
    return date.toISOString().slice(0, 10);
  }
  return `Forecast ${step}`;
}

function attachForecast(dataset, options = {}) {
  const series = Array.isArray(dataset?.series) ? dataset.series : [];
  const categories = Array.isArray(dataset?.categories) ? dataset.categories : [];
  if (series.length !== 1 || !Array.isArray(series[0].data)) {
    return {
      applied: false,
      dataset,
      forecast: { ok: false, interval: null, forecast: [] },
      notice: "This chart already compares more than one series, so no extra forecast points were added."
    };
  }
  const forecast = forecastSeries(series[0].data, options.horizon, options);
  if (!forecast.ok) {
    return { applied: false, dataset, forecast, notice: forecast.reasonText };
  }
  const last = categories[categories.length - 1];
  const future = forecast.forecast.map((_, index) => nextCategory(last, index + 1));
  const actual = series[0].data.map(Number);
  const next = {
    ...dataset,
    categories: [...categories, ...future],
    series: [
      { ...series[0], name: series[0].name || "Actual", data: [...actual, ...future.map(() => null)] },
      {
        name: "Forecast",
        unit: series[0].unit || null,
        data: [...actual.slice(0, -1).map(() => null), actual[actual.length - 1], ...forecast.forecast]
      }
    ]
  };
  return { applied: true, dataset: next, forecast, notice: forecast.reasonText };
}

function drilldownFromRows(rows, metric = "jobs") {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return { ok: false, reason: "no_rows", row: null };
  }
  const ranked = [...list].sort((left, right) => (Number(right[metric]) || 0) - (Number(left[metric]) || 0));
  const top = ranked[0];
  return {
    ok: true,
    metric,
    row: {
      id: top.id ?? null,
      name: top.name || top.label || "None",
      value: Number(top[metric] ?? top.value) || 0
    }
  };
}

function explainInsights({ title, rows, categories, series, comparisons, forecast } = {}) {
  const facts = [];
  const numericRows = Array.isArray(rows)
    ? rows.filter((row) => Number.isFinite(Number(row.value)))
    : [];
  if (numericRows.length) {
    const total = round(numericRows.reduce((sum, row) => sum + Number(row.value), 0));
    const sorted = [...numericRows].sort((left, right) => Number(right.value) - Number(left.value));
    facts.push(`${title ? `${title}: ` : ""}the total of the shown values is ${total}.`);
    facts.push(`Highest is ${sorted[0].label} at ${sorted[0].value}.`);
    if (sorted.length > 1) {
      const low = sorted[sorted.length - 1];
      facts.push(`Lowest is ${low.label} at ${low.value}.`);
    }
  } else if (Array.isArray(series) && series[0] && Array.isArray(categories)) {
    const pairs = categories.map((label, index) => ({ label, value: series[0].data?.[index] }))
      .filter((row) => row.value != null && Number.isFinite(Number(row.value)))
      .map((row) => ({ ...row, value: Number(row.value) }));
    if (pairs.length) {
      const total = round(pairs.reduce((sum, row) => sum + row.value, 0));
      const sorted = [...pairs].sort((left, right) => right.value - left.value);
      facts.push(`The total of ${series[0].name || "the series"} is ${total}.`);
      facts.push(`Highest point is ${sorted[0].label} at ${sorted[0].value}.`);
      if (sorted.length > 1) facts.push(`Lowest point is ${sorted[sorted.length - 1].label} at ${sorted[sorted.length - 1].value}.`);
    }
  }
  const changes = Array.isArray(comparisons) ? comparisons : [];
  const ranked = changes.filter((item) => item.percentChange != null).sort((left, right) => right.percentChange - left.percentChange);
  if (ranked[0]) {
    facts.push(`${ranked[0].name} is ${ranked[0].direction} by ${ranked[0].percentChange}% (${ranked[0].difference}).`);
  }
  const missingBaseline = changes.filter((item) => item.percentChange == null && item.direction !== "unavailable");
  if (missingBaseline.length) {
    facts.push(`${missingBaseline.length} comparison${missingBaseline.length === 1 ? "" : "s"} ${missingBaseline.length === 1 ? "has" : "have"} a zero or missing baseline, so no percentage is shown.`);
  }
  if (forecast?.ok) {
    facts.push(forecast.reasonText);
    if (forecast.backtest) {
      facts.push(`Checked against the last actual: predicted ${forecast.backtest.predicted}, actual ${forecast.backtest.actual}, error ${forecast.backtest.error}.`);
    }
  } else if (forecast?.reasonText) {
    facts.push(forecast.reasonText);
  }
  return {
    facts,
    hypotheses: [],
    recommendations: numericRows.length || (series && series.length)
      ? ["Ask for the list behind this chart to see the underlying records."]
      : []
  };
}

function formatInsights(insights) {
  const facts = insights?.facts?.filter(Boolean) || [];
  return facts.slice(0, 4).join(" ");
}

function selectAnalyticsTool(classified = {}) {
  if (classified.drilldown) return "get_drilldown_data";
  if (classified.chart?.forecast || classified.forecast) return "forecast_metrics";
  if (classified.comparison && classified.groupBy) return "compare_entities";
  if (classified.comparison) return "compare_periods";
  if (["job_trend", "status_trend", "heatmap"].includes(classified.kind)) return "analyze_trends";
  if (["group_chart", "chart"].includes(classified.kind)) return "generate_chart";
  if (classified.kind === "explain") return "explain_insights";
  if (["jobs", "financial", "cpair", "attendance", "dimension_report", "job_report"].includes(classified.kind)) {
    return "get_analytics_data";
  }
  return null;
}

function validateAnalyticsArgs(name, args = {}) {
  if (!TOOLS.some((tool) => tool.name === name)) {
    return { ok: false, error: "unknown analytics tool" };
  }
  if (args.tenantid != null || args.branchid != null || args.userid != null) {
    return { ok: false, error: "tenant, branch, and user come from the signed-in session" };
  }
  const value = {};
  if (args.range != null) {
    if (!RANGES.has(args.range)) return { ok: false, error: "range is not a known period" };
    value.range = args.range;
  }
  if (args.metric != null) {
    if (!METRICS.has(args.metric)) return { ok: false, error: "metric is not available" };
    value.metric = args.metric;
  }
  if (args.groupBy != null) {
    if (!GROUPS.has(args.groupBy)) return { ok: false, error: "groupBy is not an available dimension" };
    value.groupBy = args.groupBy;
  }
  if (args.horizon != null) {
    const horizon = Number(args.horizon);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 12) {
      return { ok: false, error: "horizon must be 1 to 12" };
    }
    value.horizon = horizon;
  }
  if (args.chartType != null) value.chartType = String(args.chartType).slice(0, 40);
  if (name === "compare_entities" && !value.groupBy) {
    return { ok: false, error: "compare_entities requires groupBy" };
  }
  if (name === "generate_chart" && !value.groupBy) value.groupBy = "status";
  if (name === "forecast_metrics" && !value.metric) value.metric = "amountToCollect";
  return { ok: true, value };
}

module.exports = {
  TOOLS,
  METRICS,
  GROUPS,
  compareValues,
  compareAligned,
  forecastSeries,
  attachForecast,
  drilldownFromRows,
  explainInsights,
  formatInsights,
  selectAnalyticsTool,
  validateAnalyticsArgs
};
