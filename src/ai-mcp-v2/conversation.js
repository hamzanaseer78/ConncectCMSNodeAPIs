const { createCacheStore } = require("./cache-store");

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const defaultStore = createCacheStore();

function conversationKey(scope, conversationId) {
  const id = String(conversationId || "").trim() || "default";
  return `ai-mcp-v2:conv:${scope.tenantid}:${scope.userid}:${id}`;
}

function assertConversationScope(record, scope) {
  if (!record) return null;
  if (Number(record.tenantid) !== Number(scope.tenantid)) return null;
  if (Number(record.userid) !== Number(scope.userid)) return null;
  return record;
}

async function loadConversation(scope, conversationId, store = defaultStore) {
  const record = await store.get(conversationKey(scope, conversationId));
  return assertConversationScope(record, scope) || {
    tenantid: scope.tenantid,
    userid: scope.userid,
    pending: null,
    subject: null,
    report: null,
    range: null,
    status: null,
    lastQuestion: null
  };
}

async function saveConversation(scope, conversationId, state, store = defaultStore, ttlMs = DEFAULT_TTL_MS) {
  const record = {
    tenantid: scope.tenantid,
    userid: scope.userid,
    pending: state?.pending || null,
    subject: state?.subject || null,
    report: state?.report || null,
    range: state?.range || null,
    status: state?.status || null,
    lastQuestion: state?.lastQuestion || null
  };
  await store.set(conversationKey(scope, conversationId), record, ttlMs);
  return record;
}

module.exports = {
  loadConversation,
  saveConversation,
  conversationKey
};
