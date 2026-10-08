const { AI_TOOLS, executeAiTool } = require("./organization-ai-tools");

const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT =
  "You are the ConnectCMS assistant for the signed-in organization. " +
  "For any how-many or pending question, call job_stats_kpis and quote those numbers only. " +
  "pendingJobs is new jobs plus assigned jobs, the same cards as the Jobs List. " +
  "Do not count rows returned by list_jobs. " +
  "Use mode all unless the user asks only for jobs assigned to themselves. " +
  "If a tool fails, say what failed. Keep answers short.";

function geminiModel() {
  const configured = String(process.env.GEMINI_MODEL || "").trim();
  return configured || "gemini-3.8-flash";
}

function providerError(message, status = 400) {
  const err = new Error(message);
  const code = Number(status);
  err.status = Number.isFinite(code) && code >= 400 && code < 500 ? code : 400;
  err.clientSafe = true;
  throw err;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function providerFailureMessage(body, fallback) {
  const nested = body && body.error;
  if (nested && typeof nested === "object" && String(nested.message || "").trim()) {
    return String(nested.message).trim();
  }
  if (body && String(body.message || "").trim()) {
    return String(body.message).trim();
  }
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }
  if (body && String(body.raw || "").trim()) {
    return String(body.raw).trim().slice(0, 500);
  }
  return fallback;
}

function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 4000)
    }))
    .filter((item) => item.content)
    .slice(-10);
}

async function runToolRound(auth, calls) {
  const results = [];
  for (const call of calls) {
    try {
      const data = await executeAiTool(auth, call.name, call.args || {});
      results.push({ id: call.id, name: call.name, data });
    } catch (err) {
      results.push({
        id: call.id,
        name: call.name,
        data: { error: err.message || "Tool failed" }
      });
    }
  }
  return results;
}

async function chatGemini({ apiKey, message, history, auth }) {
  const contents = [
    ...trimHistory(history).map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: AI_TOOLS }],
          contents
        })
      }
    );
    const body = await readJson(response);
    if (!response.ok) {
      providerError(providerFailureMessage(body, "Gemini request failed"), response.status);
    }

    const parts = body?.candidates?.[0]?.content?.parts || [];
    const calls = parts
      .filter((part) => part.functionCall)
      .map((part, index) => ({
        id: `${part.functionCall.name}-${index}`,
        name: part.functionCall.name,
        args: part.functionCall.args || {}
      }));

    if (!calls.length) {
      const text = parts.map((part) => part.text || "").join("").trim();
      return text || "No answer returned.";
    }

    contents.push({ role: "model", parts });
    const results = await runToolRound(auth, calls);
    contents.push({
      role: "user",
      parts: results.map((result) => ({
        functionResponse: {
          name: result.name,
          response: result.data
        }
      }))
    });
  }

  providerError("Gemini did not finish within the tool limit");
}

function cursorModel() {
  const configured = String(process.env.CURSOR_MODEL || "").trim();
  return configured || "composer-2.5";
}

async function chatOpenAiCompatible({
  apiKey,
  message,
  history,
  auth,
  url,
  model,
  failureLabel
}) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
    { role: "user", content: message }
  ];
  const tools = AI_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        tools
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      providerError(providerFailureMessage(body, `${failureLabel} request failed`), response.status);
    }

    const choice = body?.choices?.[0]?.message;
    const calls = choice?.tool_calls || [];
    if (!calls.length) {
      return String(choice?.content || "").trim() || "No answer returned.";
    }

    messages.push(choice);
    const results = await runToolRound(
      auth,
      calls.map((call) => {
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        return {
          id: call.id,
          name: call.function?.name,
          args
        };
      })
    );
    results.forEach((result) => {
      messages.push({
        role: "tool",
        tool_call_id: result.id,
        content: JSON.stringify(result.data)
      });
    });
  }

  providerError(`${failureLabel} did not finish within the tool limit`);
}

function chatOpenAi(options) {
  return chatOpenAiCompatible({
    ...options,
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    failureLabel: "OpenAI"
  });
}

const CURSOR_RUN_TIMEOUT_MS = 120000;
const CURSOR_POLL_MS = 2000;

function cursorApiOrigin() {
  return String(process.env.CURSOR_API_BASE || "https://api.cursor.com")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCursorToolCalls(text) {
  let candidate = String(text || "").trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) candidate = fenced[1].trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const calls = parsed.tool_calls || parsed.toolCalls;
  if (!Array.isArray(calls) || !calls.length) return null;
  const allowed = new Set(AI_TOOLS.map((tool) => tool.name));
  const normalized = calls
    .filter((call) => call && allowed.has(call.name))
    .map((call, index) => ({
      id: String(call.id || `${call.name}-${index}`),
      name: call.name,
      args: call.args && typeof call.args === "object" ? call.args : {}
    }));
  return normalized.length ? normalized : null;
}

function buildCursorPrompt(message, history) {
  const historyText = trimHistory(history)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");
  const toolLines = AI_TOOLS.map(
    (tool) => `- ${tool.name}: ${tool.description} Arguments: ${JSON.stringify(tool.parameters)}`
  ).join("\n");

  return [
    SYSTEM_PROMPT,
    "Answer as a no-repo assistant. Do not edit files, run commands, or browse a repository.",
    "If you need organization data, your entire reply must be only a JSON object, for example:",
    '{"tool_calls":[{"name":"job_stats_kpis","args":{"mode":"all"}}]}',
    "Allowed tools:",
    toolLines,
    "When you can answer, reply in plain text only.",
    historyText ? `Conversation so far:\n${historyText}` : "",
    `User: ${message}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function cursorFetch(apiKey, path, { method = "GET", body } = {}) {
  return fetch(`${cursorApiOrigin()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function cursorJson(apiKey, path, options) {
  const response = await cursorFetch(apiKey, path, options);
  const body = await readJson(response);
  if (!response.ok) {
    providerError(providerFailureMessage(body, "Cursor request failed"), response.status);
  }
  return body;
}

async function deleteCursorAgent(apiKey, agentId) {
  try {
    await cursorFetch(apiKey, `/v1/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
  } catch {
    // The reply is already available. A leftover agent can be removed from the Cursor dashboard.
  }
}

async function waitForCursorRun(apiKey, agentId, runId) {
  const deadline = Date.now() + CURSOR_RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const body = await cursorJson(
      apiKey,
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`
    );
    const status = String(body.status || "").toUpperCase();
    if (status === "FINISHED") {
      return String(body.result || "").trim();
    }
    if (status === "ERROR" || status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
      providerError(String(body.result || "").trim() || `Cursor run ${status.toLowerCase()}`);
    }
    await delay(CURSOR_POLL_MS);
  }
  providerError("Cursor did not finish in time");
}

async function chatCursor({ apiKey, message, history, auth }) {
  let agentId;
  try {
    const created = await cursorJson(apiKey, "/v1/agents", {
      method: "POST",
      body: {
        name: "ConnectCMS assistant",
        model: { id: cursorModel() },
        prompt: { text: buildCursorPrompt(message, history) }
      }
    });
    agentId = created?.agent?.id;
    let runId = created?.run?.id;
    if (!agentId || !runId) {
      providerError("Cursor did not start a run");
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const text = await waitForCursorRun(apiKey, agentId, runId);
      const calls = parseCursorToolCalls(text);
      if (!calls) {
        return text || "No answer returned.";
      }

      const results = await runToolRound(auth, calls);
      const followUp = await cursorJson(apiKey, `/v1/agents/${encodeURIComponent(agentId)}/runs`, {
        method: "POST",
        body: {
          prompt: {
            text: [
              "Tool results:",
              ...results.map((result) => `${result.name}: ${JSON.stringify(result.data)}`),
              "Answer the user in plain text. If you still need a tool, reply with only the JSON tool_calls object."
            ].join("\n")
          }
        }
      });
      runId = followUp?.run?.id;
      if (!runId) {
        providerError("Cursor did not start a follow-up run");
      }
    }

    providerError("Cursor did not finish within the tool limit");
  } finally {
    if (agentId) {
      await deleteCursorAgent(apiKey, agentId);
    }
  }
}

async function chatClaude({ apiKey, message, history, auth }) {
  const messages = [
    ...trimHistory(history).map((item) => ({
      role: item.role,
      content: item.content
    })),
    { role: "user", content: message }
  ];
  const tools = AI_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      providerError(providerFailureMessage(body, "Claude request failed"), response.status);
    }

    const blocks = body?.content || [];
    const calls = blocks.filter((block) => block.type === "tool_use");
    if (!calls.length) {
      const text = blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("")
        .trim();
      return text || "No answer returned.";
    }

    messages.push({ role: "assistant", content: blocks });
    const results = await runToolRound(
      auth,
      calls.map((call) => ({
        id: call.id,
        name: call.name,
        args: call.input || {}
      }))
    );
    messages.push({
      role: "user",
      content: results.map((result) => ({
        type: "tool_result",
        tool_use_id: result.id,
        content: JSON.stringify(result.data)
      }))
    });
  }

  providerError("Claude did not finish within the tool limit");
}

async function completeOrganizationChat({ provider, apiKey, message, history, auth }) {
  if (provider === "gemini") {
    return chatGemini({ apiKey, message, history, auth });
  }
  if (provider === "openai") {
    return chatOpenAi({ apiKey, message, history, auth });
  }
  if (provider === "claude") {
    return chatClaude({ apiKey, message, history, auth });
  }
  if (provider === "cursor") {
    return chatCursor({ apiKey, message, history, auth });
  }
  providerError(`Unsupported provider ${provider}`, 400);
}

module.exports = {
  completeOrganizationChat,
  providerFailureMessage,
  parseCursorToolCalls,
  cursorApiOrigin
};
