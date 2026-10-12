const { z } = require("zod");
const { TOOLS, executeTool } = require("./tools");

const INSTRUCTIONS = [
  "Connect CMS AI MCP v2 is read-only.",
  "Tenant and branch come from the authenticated token. Arguments cannot change them.",
  "Amount to collect is job cost, not cash collected.",
  "Do not calculate profit from these tools.",
  "This server is separate from the original Connect CMS stdio MCP."
].join(" ");

const PROTOCOL_VERSIONS = Object.freeze(["2025-03-26", "2024-11-05"]);

function toolCatalog() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters
  }));
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function callTool(message, auth, deps) {
  const name = message.params?.name;
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) {
    return rpcResult(message.id, {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "That tool is not available.", code: "unknown_tool" }) }]
    });
  }
  const parsed = z.object(tool.zod).safeParse(message.params?.arguments || {});
  if (!parsed.success) {
    return rpcResult(message.id, {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "The tool arguments are invalid.", code: "invalid_argument" }) }]
    });
  }
  try {
    const result = await executeTool(tool.name, parsed.data, auth, deps);
    return rpcResult(message.id, {
      content: [{ type: "text", text: JSON.stringify(result) }]
    });
  } catch (err) {
    return rpcResult(message.id, {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: err.message, code: err.code || "error" }) }]
    });
  }
}

async function handleMessage(message, auth, deps) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id, -32600, "Invalid request");
  }
  if (message.id == null) return null;
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    return rpcResult(message.id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "connect-cms-ai-mcp-v2", version: "2.0.0" },
      instructions: INSTRUCTIONS
    });
  }
  if (message.method === "ping") return rpcResult(message.id, {});
  if (message.method === "tools/list") return rpcResult(message.id, { tools: toolCatalog() });
  if (message.method === "tools/call") return callTool(message, auth, deps);
  return rpcError(message.id, -32601, "Method not found");
}

async function handleMcp(req, res, deps) {
  if (req.method !== "POST") {
    res.status(405).json({
      error: "This MCP endpoint accepts POST JSON-RPC requests.",
      code: "method_not_allowed"
    });
    return;
  }
  const messages = Array.isArray(req.body) ? req.body : [req.body];
  const responses = [];
  for (const message of messages) {
    const response = await handleMessage(message, req.auth, deps);
    if (response) responses.push(response);
  }
  if (!responses.length) {
    res.status(202).end();
    return;
  }
  res.json(Array.isArray(req.body) ? responses : responses[0]);
}

module.exports = {
  handleMcp,
  toolCatalog
};
