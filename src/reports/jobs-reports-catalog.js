const { listJobsSummaryReportDefinitions } = require("./jobs-summary-report.registry");

function buildJobsReportsCatalog() {
  const items = [
    {
      reportKey: "jobs_list",
      title: "Jobs List Report",
      kind: "detail",
      dataQuery: "jobsListReport",
      columnsQuery: "jobsListReportColumns",
      updateColumnsMutation: "updateJobsListReportColumns",
      exportEndpoint: "/api/jobs-all/reports/jobs-list/export",
      detailDataQuery: null
    }
  ];

  listJobsSummaryReportDefinitions().forEach((definition) => {
    const suffix = definition.graphqlSuffix;
    items.push({
      reportKey: definition.reportKey,
      title: definition.title,
      kind: "summary",
      dataQuery: `jobsBy${suffix}SummaryReport`,
      columnsQuery: `jobsBy${suffix}SummaryReportColumns`,
      updateColumnsMutation: `updateJobsBy${suffix}SummaryReportColumns`,
      detailDataQuery: "jobsListReport"
    });
  });

  return items;
}

module.exports = {
  buildJobsReportsCatalog
};
