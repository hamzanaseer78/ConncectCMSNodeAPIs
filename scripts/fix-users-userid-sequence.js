/**
 * Fixes PostgreSQL serial for users.userid when it lags behind MAX(userid).
 * Run on the server: node scripts/fix-users-userid-sequence.js
 */

const prisma = require("../src/database/prisma");
const { syncPostgresSequence } = require("../src/utils/postgres-sequence");

async function main() {
  const maxRow = await prisma.users.aggregate({ _max: { userid: true } });
  const maxUserid = maxRow._max.userid ?? 0;

  await prisma.$transaction(async (tx) => {
    await syncPostgresSequence(tx, "users", "userid");
  });

  console.log(
    `users.userid sequence aligned; MAX(userid)=${maxUserid}, next insert will use ${maxUserid + 1}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
