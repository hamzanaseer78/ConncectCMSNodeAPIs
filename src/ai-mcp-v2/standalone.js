#!/usr/bin/env node
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", "..", ".env"),
  quiet: true
});

const express = require("express");
const { loadConfig } = require("./config");
const { createRouter } = require("./routes");

const config = loadConfig();

if (!config.enabled) {
  console.error("[ai-mcp-v2] AI_MCP_V2_ENABLED is not true. The new API was not started. The existing MCP is unchanged.");
  process.exit(0);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use("/api/v2/ai-mcp", createRouter({ config }));

const server = app.listen(config.port, () => {
  console.error(`[ai-mcp-v2] listening on ${config.port}. Existing stdio MCP is not affected.`);
});

server.on("error", (err) => {
  console.error(`[ai-mcp-v2] ${err.code === "EADDRINUSE" ? `port ${config.port} is already in use` : "server failed"}`);
  process.exit(1);
});
