const { PrismaClient } = require("@prisma/client");
const { getAutoincrementConfig } = require("../config/postgres-autoincrement-models");
const {
  isBypassingSafeCreate,
  createWithExplicitPrimaryKey,
  createManyWithExplicitPrimaryKeys
} = require("../utils/postgres-create");

const base = new PrismaClient();

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

      if (value && typeof value === "object" && getAutoincrementConfig(String(prop))) {
        return wrapModelDelegate(value, target, String(prop));
      }

      return value;
    }
  });
}

const prisma = wrapClient(base);

module.exports = prisma;
