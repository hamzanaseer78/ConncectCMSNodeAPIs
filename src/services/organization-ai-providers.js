const { AI_TOOLS, executeAiTool } = require("./organization-ai-tools");

const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT =
  "You are the ConnectCMS assistant for the signed-in organization. " +
  "Answer from tool results. Do not invent job counts or job records. " +
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
      providerError(body?.error?.message || "Gemini request failed");
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

async function chatOpenAi({ apiKey, message, history, auth }) {
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      providerError(body?.error?.message || "OpenAI request failed");
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

  providerError("OpenAI did not finish within the tool limit");
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
      providerError(body?.error?.message || "Claude request failed");
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
  providerError(`Unsupported provider ${provider}`, 400);
}

module.exports = {
  completeOrganizationChat
};
