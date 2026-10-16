const intelligence = require("./management-intelligence.service");
const { buildChart } = require("./chart-adapter");
const { previousPeriod } = require("../utils/intelligence-range");
const {
  validateAnalyticsArgs,
  compareValues,
  compareAligned,
  forecastSeries,
  explainInsights,
  drilldownFromRows
} = require("./analytics-plugin");

function metricOf(row, metric) {
  if (metric === "amountToCollect") return Number(row.amountToCollect) || 0;
  if (metric === "expenses") return Number(row.expenses) || 0;
  if (metric === "collected") return Number(row.collected) || 0;
  return Number(row.jobs) || 0;
}

function reportRows(report, metric) {
  return (report?.table?.rows || []).map((row) => ({
    id: row.id ?? null,
    name: row.name || "None",
    label: row.name || "None",
    value: metricOf(row, metric),
    jobs: Number(row.jobs) || 0,
    amountToCollect: Number(row.amountToCollect) || 0,
    expenses: Number(row.expenses) || 0,
    collected: Number(row.collected) || 0
  }));
}

async function loadGrouped(auth, args, metric) {
  const reportKey = `jobs_by_${args.groupBy}`;
  const current = await intelligence.getReport(auth, reportKey, {
    range: args.range || "year_to_date",
    page: 1,
    pageSize: 50,
    sortBy: metric === "jobs" ? "jobs" : metric,
    sortOrder: "desc"
  });
  return { reportKey, current, rows: reportRows(current, metric) };
}

async function executeAnalyticsTool(auth, name, args = {}) {
  const check = validateAnalyticsArgs(name, args);
  if (!check.ok) {
    const err = new Error(check.error);
    err.status = 400;
    err.code = "invalid_arguments";
    throw err;
  }
  const value = check.value;
  const metric = value.metric || "jobs";

  if (name === "get_analytics_data" || name === "compare_periods" || name === "analyze_trends" || name === "forecast_metrics") {
    const overview = await intelligence.getOverview(auth, { range: value.range || "year_to_date" });
    const financial = overview.financial || {};
    const comparisons = ["amountToCollect", "collectedInPeriod", "expensesInPeriod"].map((key) => ({
      name: key,
      ...compareValues(financial[key]?.current, financial[key]?.previous)
    }));
    const chart = (overview.charts || []).find((item) => item.id === "amount-expenses-collections");
    const series = metric === "expenses"
      ? chart?.series?.find((item) => /expense/i.test(item.name))
      : metric === "collected"
        ? chart?.series?.find((item) => /collected/i.test(item.name))
        : chart?.series?.[0];
    const forecast = name === "forecast_metrics"
      ? forecastSeries(series?.data || [], value.horizon || 1)
      : null;
    const insights = explainInsights({
      title: overview.range?.label,
      categories: chart?.categories,
      series: series ? [series] : [],
      comparisons: name === "compare_periods" ? comparisons : [],
      forecast
    });
    return {
      tool: name,
      executed: true,
      range: overview.range,
      previousRange: overview.previousRange,
      comparisons,
      forecast,
      insights,
      actuals: series?.data || [],
      categories: chart?.categories || []
    };
  }

  if (name === "compare_entities" || name === "generate_chart" || name === "get_drilldown_data" || name === "explain_insights") {
    const loaded = await loadGrouped(auth, { ...value, groupBy: value.groupBy || "status" }, metric);
    let comparisons = [];
    if (name === "compare_entities") {
      const previous = previousPeriod(loaded.current.range);
      const prior = await intelligence.getReport(auth, loaded.reportKey, {
        range: "custom",
        from: previous.fromDate,
        to: previous.toDate,
        page: 1,
        pageSize: 50
      });
      const priorRows = reportRows(prior, metric);
      comparisons = compareAligned(
        loaded.rows.map((row) => row.name),
        { data: loaded.rows.map((row) => row.value) },
        { data: loaded.rows.map((row) => priorRows.find((item) => item.name === row.name)?.value || 0) }
      );
    }
    const dataset = comparisons.length
      ? {
        categories: comparisons.map((item) => item.name),
        series: [
          { name: loaded.current.range?.label || "Current", unit: metric === "jobs" ? "count" : "money", data: comparisons.map((item) => item.current) },
          { name: "Previous period", unit: metric === "jobs" ? "count" : "money", data: comparisons.map((item) => item.previous) }
        ],
        complete: true
      }
      : { rows: loaded.rows, complete: true };
    const built = buildChart({
      requestedType: value.chartType || "bar",
      title: loaded.current.title,
      metric,
      format: metric === "jobs" ? "number" : "money",
      businessEntity: "jobs",
      dateRange: loaded.current.range?.label,
      comparison: name === "compare_entities"
    }, dataset);
    const drilldown = drilldownFromRows(loaded.rows, metric);
    const insights = explainInsights({
      title: loaded.current.title,
      rows: loaded.rows,
      comparisons
    });
    return {
      tool: name,
      executed: true,
      chart: name === "generate_chart" ? built.chart : null,
      specification: built.specification,
      comparisons,
      drilldown,
      insights,
      notice: built.notice || null
    };
  }

  const err = new Error("unknown analytics tool");
  err.status = 400;
  throw err;
}

module.exports = {
  executeAnalyticsTool
};
