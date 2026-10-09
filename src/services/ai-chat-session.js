const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TURNS = 12;
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

function read(auth) {
  const key = sessionKey(auth);
  const row = sessions.get(key);
  if (!row) return [];
  if (Date.now() - row.updatedAt > TTL_MS) {
    sessions.delete(key);
    return [];
  }
  return row.turns.slice();
}

function historyFor(auth, clientHistory) {
  const client = normalizeHistory(clientHistory);
  if (client.length) return client;
  return read(auth);
}

function remember(auth, userMessage, assistantAnswer) {
  const turns = read(auth);
  const user = String(userMessage || "").trim();
  const assistant = String(assistantAnswer || "").trim();
  if (user) turns.push({ role: "user", content: user.slice(0, 2000) });
  if (assistant) turns.push({ role: "assistant", content: assistant.slice(0, 2000) });
  sessions.set(sessionKey(auth), {
    updatedAt: Date.now(),
    turns: turns.slice(-MAX_TURNS)
  });
}

module.exports = {
  historyFor,
  remember
};
