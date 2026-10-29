const { PrismaClient } = require("@prisma/client");
const { getAutoincrementConfig } = require("../config/postgres-autoincrement-models");
const {
  isBypassingSafeCreate,
  createWithExplicitPrimaryKey,
  createManyWithExplicitPrimaryKeys
} = require("../utils/postgres-create");

const base = new PrismaClient();

const WRITE_OPS = new Set(["create", "update", "delete", "upsert", "createMany", "updateMany", "deleteMany"]);
const CACHE_MODELS = new Set([
  "job",
  "jobexpenses",
  "jobcollections",
  "customers",
  "jobstatuses",
  "userattendancesession",
  "userorganizations",
  "users"
]);

function wrapCacheDelegate(delegate, modelName) {
  if (!delegate || !CACHE_MODELS.has(String(modelName))) return delegate;
  return new Proxy(delegate, {
    get(target, prop) {
      const original = target[prop];
      if (typeof original !== "function" || !WRITE_OPS.has(String(prop))) {
        return typeof original === "function" ? original.bind(target) : original;
      }
      return async (args) => {
        const result = await original.call(target, args);
        try {
          await require("../ai-mcp-v2/business-cache").invalidateFromWrite(modelName, args);
        } catch {
          // Cache invalidation must not fail the write.
        }
        return result;
      };
    }
  });
}

function wrapModelDelegate(delegate, client, modelName) {
  if (!delegate || !getAutoincrementConfig(modelName)) {
    return delegate;
  }

  return new Proxy(delegate, {
    get(target, prop) {
      const original = target[prop];
      if (typeof original !== "function") {
        return original;
      }

      if (prop === "create") {
        return (args) => {
          if (isBypassingSafeCreate()) {
            return original.call(target, args);
          }
          return createWithExplicitPrimaryKey(client, modelName, args);
        };
      }

      if (prop === "createMany") {
        return (args) => {
          if (isBypassingSafeCreate()) {
            return original.call(target, args);
          }
          return createManyWithExplicitPrimaryKeys(client, modelName, args);
        };
      }

      return original.bind(target);
    }
  });
}

function wrapClient(client) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "$transaction") {
        return (arg, options) => {
          const runTransaction = target.$transaction.bind(target);
          if (typeof arg === "function") {
            return runTransaction(async (tx) => arg(wrapClient(tx)), options);
          }
          return runTransaction(arg, options);
        };
      }

      const value = Reflect.get(target, prop, target);
      if (typeof value === "function") {
        return value.bind(target);
      }

      if (value && typeof value === "object") {
        let next = value;
        if (getAutoincrementConfig(String(prop))) {
          next = wrapModelDelegate(next, target, String(prop));
        }
        return wrapCacheDelegate(next, String(prop));
      }

      return value;
    }
  });
}

const prisma = wrapClient(base);

module.exports = prisma;
