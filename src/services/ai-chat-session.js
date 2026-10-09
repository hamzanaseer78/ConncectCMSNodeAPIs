const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TURNS = Math.min(24, Math.max(4, Number(process.env.AI_HISTORY_WINDOW) || 12));
const sessions = new Map();

function sessionKey(auth) {
  return `${Number(auth?.tenantid) || 0}:${Number(auth?.branchid) || 0}:${Number(auth?.userid) || 0}`;
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

function load(auth) {
  const key = sessionKey(auth);
  const row = sessions.get(key);
  if (!row || Date.now() - row.updatedAt > TTL_MS) {
    if (row) sessions.delete(key);
    return { key, row: { updatedAt: Date.now(), turns: [], state: null } };
  }
  return { key, row };
}

function read(auth) {
  return load(auth).row.turns.slice();
}

function historyFor(auth, clientHistory) {
  const client = normalizeHistory(clientHistory);
  if (client.length) return client;
  return read(auth);
}

function remember(auth, userMessage, assistantAnswer) {
  const { key, row } = load(auth);
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

function rememberState(auth, state) {
  const { key, row } = load(auth);
  sessions.set(key, {
    ...row,
    updatedAt: Date.now(),
    state: state || null
  });
}

function stateFor(auth, clientState, provided) {
  if (provided) return clientState || null;
  return load(auth).row.state;
}

module.exports = {
  historyFor,
  remember,
  rememberState,
  stateFor
};
