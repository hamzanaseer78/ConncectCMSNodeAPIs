/**
 * Fixes PostgreSQL serial for branches.branchid when it lags behind MAX(branchid).
 * Run on the server: node scripts/fix-branches-branchid-sequence.js
 */

const prisma = require("../src/database/prisma");
const { syncPostgresSequence } = require("../src/utils/postgres-sequence");

async function main() {
  await prisma.$transaction(async (tx) => {
    await syncPostgresSequence(tx, "branches", "branchid");
  });
  console.log("branches.branchid sequence aligned so the next insert gets MAX(branchid) + 1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
