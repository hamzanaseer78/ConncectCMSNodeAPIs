const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TURNS = Math.min(24, Math.max(4, Number(process.env.AI_HISTORY_WINDOW) || 12));
const sessions = new Map();

function conversationKey(conversationId) {
  const raw = String(conversationId || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : "default";
}

function sessionKey(auth, conversationId) {
  return `${Number(auth?.tenantid) || 0}:${Number(auth?.branchid) || 0}:${Number(auth?.userid) || 0}:${conversationKey(conversationId)}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || item.text || "").trim().slice(0, 2000)
    }))
    .filter((item) => item.content)
    .slice(-MAX_TURNS);
}

function load(auth, conversationId) {
  const key = sessionKey(auth, conversationId);
  const row = sessions.get(key);
  if (!row || Date.now() - row.updatedAt > TTL_MS) {
    if (row) sessions.delete(key);
    return { key, row: { updatedAt: Date.now(), turns: [], state: null } };
  }
  return { key, row };
}

function read(auth, conversationId) {
  return load(auth, conversationId).row.turns.slice();
}

function canonicalizeHistory(history, currentMessage) {
  const source = Array.isArray(history) ? history : [];
  const resultIds = new Set();
  source.forEach((item) => {
    if (item?.role === "tool" && item.toolCallId) resultIds.add(String(item.toolCallId));
  });
  const turns = [];
  source.forEach((item) => {
    if (!item || typeof item !== "object") return;
    if (item.role === "tool") {
      const content = String(item.content || "").trim().slice(0, 2000);
      if (!item.toolCallId || !content) return;
      turns.push({ role: "tool", toolCallId: String(item.toolCallId).slice(0, 80), content });
      return;
    }
    if (item.role !== "user" && item.role !== "assistant") return;
    const content = String(item.content || item.text || "").trim().slice(0, 2000);
    if (!content) return;
    const turn = { role: item.role, content };
    if (item.role === "assistant" && Array.isArray(item.toolCalls) && item.toolCalls.length) {
      const complete = item.toolCalls.every((call) => call?.id && resultIds.has(String(call.id)));
      if (complete) turn.toolCalls = item.toolCalls.map((call) => ({ id: String(call.id), name: call.name || null }));
    }
    turns.push(turn);
  });
  const current = String(currentMessage || "").trim().slice(0, 2000);
  if (current) {
    const last = turns[turns.length - 1];
    if (!last || last.role !== "user" || last.content !== current) {
      turns.push({ role: "user", content: current });
    }
  }
  const kept = turns.slice(-MAX_TURNS);
  if (current && !kept.some((turn) => turn.role === "user" && turn.content === current)) {
    const withoutOldest = kept.slice(1);
    withoutOldest.push({ role: "user", content: current });
    return withoutOldest.slice(-MAX_TURNS);
  }
  return kept;
}

function historyFor(auth, clientHistory, conversationId, currentMessage) {
  const client = canonicalizeHistory(clientHistory, currentMessage);
  const hasPrior = client.some((turn) => !currentMessage || turn.content !== String(currentMessage).trim());
  if (hasPrior || (Array.isArray(clientHistory) && clientHistory.length)) return client;
  const stored = canonicalizeHistory(read(auth, conversationId), currentMessage);
  return stored;
}

function remember(auth, userMessage, assistantAnswer, conversationId) {
  const { key, row } = load(auth, conversationId);
  const turns = row.turns.slice();
  const user = String(userMessage || "").trim();
  const assistant = String(assistantAnswer || "").trim();
  if (user) turns.push({ role: "user", content: user.slice(0, 2000) });
  if (assistant) turns.push({ role: "assistant", content: assistant.slice(0, 2000) });
  sessions.set(key, {
    ...row,
    updatedAt: Date.now(),
    turns: turns.slice(-MAX_TURNS)
  });
}

function rememberState(auth, state, conversationId) {
  const { key, row } = load(auth, conversationId);
  sessions.set(key, {
    ...row,
    updatedAt: Date.now(),
    state: state || null
  });
}

function stateFor(auth, clientState, provided, conversationId) {
  if (provided) return clientState || null;
  return load(auth, conversationId).row.state;
}

module.exports = {
  historyFor,
  remember,
  rememberState,
  stateFor,
  canonicalizeHistory,
  conversationKey
};
