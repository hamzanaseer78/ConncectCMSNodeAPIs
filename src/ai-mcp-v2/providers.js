const https = require("https");
const { AiMcpError } = require("./errors");
const { TOOLS } = require("./tools");

function postJson(url, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = options.body || "";
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: options.method || "POST",
      headers: {
        ...(options.headers || {}),
        "content-length": Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(text || "{}")
        });
      });
    });
    const abort = () => {
      req.destroy();
      const err = new Error("The provider timed out.");
      err.name = "AbortError";
      reject(err);
    };
    if (options.signal) {
      if (options.signal.aborted) {
        abort();
        return;
      }
      options.signal.addEventListener("abort", abort);
    }
    req.on("error", (err) => {
      if (options.signal?.aborted) return;
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

function providerError(status) {
  if (status === 401 || status === 403) {
    return new AiMcpError("The configured API key was rejected.", 502, "provider_rejected");
  }
  if (status === 429) {
    return new AiMcpError("The provider rate limit was reached.", 503, "provider_rate_limited");
  }
  if (status === 408 || status === 504) {
    return new AiMcpError("The provider timed out.", 504, "provider_timeout");
  }
  return new AiMcpError("The selected AI provider is unavailable.", 502, "provider_unavailable");
}

function parseToolArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function openAiMessages(messages) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content
      };
    }
    if (message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments || {})
          }
        }))
      };
    }
    return { role: message.role, content: message.content };
  });
}

function openAiBody(model, messages, tools) {
  return {
    model,
    temperature: 0,
    messages: openAiMessages(messages),
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))
  };
}

function anthropicBody(model, messages, tools) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const conversation = [];
  messages.filter((message) => message.role !== "system").forEach((message) => {
    if (message.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content
      };
      const previous = conversation[conversation.length - 1];
      if (previous?.role === "user" && Array.isArray(previous.content)) {
        previous.content.push(block);
        return;
      }
      conversation.push({ role: "user", content: [block] });
      return;
    }
    if (message.toolCalls?.length) {
      conversation.push({
        role: "assistant",
        content: message.toolCalls.map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments || {}
        }))
      });
      return;
    }
    conversation.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    });
  });
  return {
    model,
    max_tokens: 1200,
    temperature: 0,
    system,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    })),
    messages: conversation
  };
}

function geminiBody(messages, tools) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const contents = messages.filter((message) => message.role !== "system").map((message) => {
    if (message.role === "tool") {
      return {
        role: "user",
        parts: [{
          functionResponse: {
            name: message.name,
            response: { result: message.content }
          }
        }]
      };
    }
    if (message.toolCalls?.length) {
      return {
        role: "model",
        parts: message.toolCalls.map((call) => ({
          functionCall: { name: call.name, args: call.arguments || {} }
        }))
      };
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    };
  });
  return {
    systemInstruction: { parts: [{ text: system }] },
    tools: [{
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }],
    contents
  };
}

function parseOpenAi(payload) {
  const message = payload?.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => ({
    id: call.id,
    name: call.function?.name,
    arguments: parseToolArguments(call.function?.arguments)
  })).filter((call) => call.name);
  return { text: message.content || "", toolCalls };
}

function parseAnthropic(payload) {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  const toolCalls = blocks.filter((block) => block.type === "tool_use").map((block) => ({
    id: block.id,
    name: block.name,
    arguments: parseToolArguments(block.input)
  })).filter((call) => call.name);
  return { text, toolCalls };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cursorOrigin(config) {
  return String(config.cursorApiBase || "https://api.cursor.com").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

function cursorPrompt(messages) {
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") return `tool ${message.name}: ${message.content}`;
      if (message.toolCalls?.length) {
        return `assistant requested ${message.toolCalls.map((call) => call.name).join(", ")}`;
      }
      return `${message.role}: ${message.content}`;
    })
    .join("\n");
  const toolLines = TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
  return [
    messages.find((message) => message.role === "system")?.content || "",
    "You are a no-repo assistant. Do not edit files, run commands, or browse a repository.",
    "When you need authorized business figures, reply with only this JSON shape:",
    '{"tool_calls":[{"name":"total_expenses","args":{"period":"this_month"}}]}',
    "Allowed tools:",
    toolLines,
    "When the tool results are enough, reply in plain text. Do not invent amounts.",
    conversation
  ].filter(Boolean).join("\n\n");
}

function parseCursorReply(text) {
  let candidate = String(text || "").trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    try {
      const parsed = JSON.parse(candidate);
      const calls = parsed.tool_calls || parsed.toolCalls;
      if (Array.isArray(calls)) {
        const allowed = new Set(TOOLS.map((tool) => tool.name));
        const toolCalls = calls
          .filter((call) => call && allowed.has(call.name))
          .map((call, index) => ({
            id: String(call.id || `cursor-${index + 1}`),
            name: call.name,
            arguments: parseToolArguments(call.args || call.arguments)
          }));
        if (toolCalls.length) return { text: "", toolCalls };
      }
    } catch {
      // A normal sentence is the answer.
    }
  }
  return { text: String(text || "").trim(), toolCalls: [] };
}

async function cursorJson(request, url, options) {
  const response = await request(url, options);
  if (!response.ok) throw providerError(response.status);
  return response.json();
}

async function waitForCursorRun(request, origin, headers, agentId, runId, signal, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      const err = new Error("The provider timed out.");
      err.name = "AbortError";
      throw err;
    }
    const body = await cursorJson(
      request,
      `${origin}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
      { method: "GET", headers, signal }
    );
    const status = String(body.status || "").toUpperCase();
    if (status === "FINISHED") return String(body.result || "");
    if (status === "ERROR" || status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
      throw new AiMcpError("The selected AI provider is unavailable.", 502, "provider_unavailable");
    }
    await delay(1000);
  }
  throw new AiMcpError("The provider timed out.", 504, "provider_timeout");
}

function cursorHeaders(config) {
  const key = String(config.keys.cursor || "");
  return {
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`
  };
}

async function completeCursor({ config, messages, request, signal }) {
  const origin = cursorOrigin(config);
  const headers = cursorHeaders(config);
  const created = await cursorJson(request, `${origin}/v1/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "ConnectCMS assistant",
      model: { id: config.models.cursor },
      prompt: { text: cursorPrompt(messages) }
    }),
    signal
  });
  const agentId = created?.agent?.id || created?.id;
  const runId = created?.run?.id || created?.agent?.latestRunId || created?.latestRunId;
  if (!agentId || !runId) {
    throw new AiMcpError("The selected AI provider is unavailable.", 502, "provider_unavailable");
  }
  try {
    const text = await waitForCursorRun(
      request,
      origin,
      headers,
      agentId,
      runId,
      signal,
      config.cursorTimeoutMs || 120000
    );
    return parseCursorReply(text);
  } finally {
    await request(`${origin}/v1/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
      headers,
      signal
    }).catch(() => {});
  }
}

function parseGemini(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("\n").trim();
  const toolCalls = parts.filter((part) => part.functionCall?.name).map((part, index) => ({
    id: `gemini-${index + 1}`,
    name: part.functionCall.name,
    arguments: parseToolArguments(part.functionCall.args)
  }));
  return { text, toolCalls };
}

async function completeChat({ provider, config, messages, fetchImpl }) {
  if (!config.providers.includes(provider)) {
    throw new AiMcpError("That AI provider is not supported.", 400, "provider_invalid");
  }
  if (!config.keys[provider]) {
    throw new AiMcpError(`The ${provider} provider is not configured.`, 503, "provider_not_configured");
  }
  const request = fetchImpl || postJson;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider === "cursor" ? (config.cursorTimeoutMs || 120000) : config.timeoutMs);
  try {
    if (provider === "cursor") {
      return await completeCursor({ config, messages, request, signal: controller.signal });
    }
    const response = await request(requestUrl(provider, config), {
      method: "POST",
      headers: requestHeaders(provider, config),
      body: JSON.stringify(requestBody(provider, config, messages)),
      signal: controller.signal
    });
    if (!response.ok) throw providerError(response.status);
    const payload = await response.json();
    if (provider === "anthropic") return parseAnthropic(payload);
    if (provider === "gemini") return parseGemini(payload);
    return parseOpenAi(payload);
  } catch (err) {
    if (err instanceof AiMcpError) throw err;
    if (err.name === "AbortError") {
      throw new AiMcpError("The provider timed out.", 504, "provider_timeout");
    }
    throw new AiMcpError("The selected AI provider is unavailable.", 502, "provider_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function requestUrl(provider, config) {
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "grok") return "https://api.x.ai/v1/chat/completions";
  if (provider === "anthropic") return "https://api.anthropic.com/v1/messages";
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.models.gemini)}:generateContent`;
}

function requestHeaders(provider, config) {
  if (provider === "openai") {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${config.keys.openai}`
    };
  }
  if (provider === "grok") {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${config.keys.grok}`
    };
  }
  if (provider === "anthropic") {
    return {
      "content-type": "application/json",
      "x-api-key": config.keys.anthropic,
      "anthropic-version": "2023-06-01"
    };
  }
  return {
    "content-type": "application/json",
    "x-goog-api-key": config.keys.gemini
  };
}

function requestBody(provider, config, messages) {
  if (provider === "anthropic") return anthropicBody(config.models.anthropic, messages, TOOLS);
  if (provider === "gemini") return geminiBody(messages, TOOLS);
  if (provider === "grok") return openAiBody(config.models.grok, messages, TOOLS);
  return openAiBody(config.models.openai, messages, TOOLS);
}

module.exports = {
  completeChat,
  parseOpenAi,
  parseAnthropic,
  parseGemini,
  providerError
};
