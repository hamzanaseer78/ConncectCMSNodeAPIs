const { z } = require("zod");
const { textResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { TOOLS } = require("../../src/services/analytics-plugin");
const { executeAnalyticsTool } = require("../../src/services/analytics-executor");

const range = z.enum([
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
]).optional();
const metric = z.enum(["jobs", "amountToCollect", "expenses", "collected"]).optional();
const groupBy = z.enum(["status", "technician", "customer", "category", "fault", "group", "brand", "source", "area", "city"]).optional();

function registerAnalyticsTools(server) {
  TOOLS.forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: {
          range,
          metric,
          groupBy,
          horizon: z.number().int().min(1).max(12).optional(),
          chartType: z.string().max(40).optional()
        }
      },
      withAuth(async (auth, args = {}) => {
        const data = await executeAnalyticsTool(auth, tool.name, args);
        return textResult(data);
      })
    );
  });
}

module.exports = {
  registerAnalyticsTools
};
