const { createWithExplicitPrimaryKey } = require("./postgres-create");

/**
 * Create a user row with an explicit userid when the serial sequence is out of sync.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {object} data
 */
async function createUserInTransaction(tx, data) {
  return createWithExplicitPrimaryKey(tx, "users", { data });
}

module.exports = {
  createUserInTransaction
};
