#!/usr/bin/env node
/**
 * ConnectCMS MCP server (stdio).
 * Works with Cursor MCP and Gemini CLI via .cursor/mcp.json and .gemini/settings.json.
 *
 * MCP uses stdout for JSON-RPC — route incidental logs to stderr only.
 */
const path = require("path");

console.log = (...args) => console.error(...args);

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true
});

process.env.SEQ_LOGGING_ENABLED = process.env.SEQ_LOGGING_ENABLED || "false";

const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `[connect-cms-mcp] Missing required env: ${missing.join(", ")}`
  );
  process.exit(1);
}

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { registerTools } = require("./tools/register-tools");

async function main() {
  const server = new McpServer(
    {
      name: "connect-cms",
      version: "1.0.0"
    },
    {
      instructions:
        "ConnectCMS field-service MCP adapter. Calls existing API services — data is always tenant/branch scoped. " +
        "Authenticate first: cms_login, or set MCP_JWT / MCP_EMAIL+MCP_PASSWORD in env. " +
        "Tool groups: auth (cms_login, cms_profile), reference (cms_dropdown*), generic CRUD (cms_*_resource), " +
        "jobs (cms_list_jobs, cms_create_job, cms_job_action), reports (cms_jobs_*_report), dashboard (cms_dashboard)."
    }
  );

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[connect-cms-mcp] Fatal error:", err);
  process.exit(1);
});
