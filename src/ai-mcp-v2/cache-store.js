function serialize(value) {
  return JSON.stringify(value);
}

function deserialize(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createMemoryStore() {
  const items = new Map();
  return {
    kind: "memory",
    async get(key) {
      const item = items.get(String(key));
      if (!item) return null;
      if (item.expiresAt && item.expiresAt <= Date.now()) {
        items.delete(String(key));
        return null;
      }
      return deserialize(item.value);
    },
    async set(key, value, ttlMs) {
      const ttl = Number(ttlMs);
      items.set(String(key), {
        value: serialize(value),
        expiresAt: Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl : 0
      });
    },
    async del(key) {
      items.delete(String(key));
    },
    async keys(prefix) {
      const start = String(prefix || "");
      const now = Date.now();
      const found = [];
      items.forEach((item, key) => {
        if (item.expiresAt && item.expiresAt <= now) {
          items.delete(key);
          return;
        }
        if (!start || key.startsWith(start)) found.push(key);
      });
      return found;
    },
    async clear() {
      items.clear();
    }
  };
}

function createRedisStore(url) {
  let Redis;
  try {
    Redis = require("ioredis");
  } catch {
    return null;
  }
  const client = new Redis(String(url), {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true
  });
  client.on("error", () => {});
  return {
    kind: "redis",
    async get(key) {
      const raw = await client.get(String(key));
      return deserialize(raw);
    },
    async set(key, value, ttlMs) {
      const payload = serialize(value);
      const ttl = Number(ttlMs);
      if (Number.isFinite(ttl) && ttl > 0) {
        await client.set(String(key), payload, "PX", Math.max(1, Math.floor(ttl)));
        return;
      }
      await client.set(String(key), payload);
    },
    async del(key) {
      await client.del(String(key));
    },
    async keys(prefix) {
      const pattern = `${String(prefix || "")}*`;
      return client.keys(pattern);
    },
    async clear() {
      const found = await client.keys("ai-mcp-v2:*");
      if (found.length) await client.del(found);
    }
  };
}

function createCacheStore(env = process.env) {
  const url = String(env.AI_MCP_V2_CACHE_URL || env.REDIS_URL || "").trim();
  if (url) {
    const redis = createRedisStore(url);
    if (redis) return redis;
  }
  return createMemoryStore();
}

module.exports = {
  createMemoryStore,
  createRedisStore,
  createCacheStore
};
