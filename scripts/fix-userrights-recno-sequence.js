/**
 * Fixes PostgreSQL serial for userrights.recno when it lags behind MAX(recno).
 * Run on the server: node scripts/fix-userrights-recno-sequence.js
 */

const prisma = require("../src/database/prisma");

async function main() {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('userrights', 'recno'),
      COALESCE((SELECT MAX(recno) FROM userrights), 0) + 1,
      false
    )
  `);
  console.log("userrights.recno sequence aligned so the next insert gets MAX(recno) + 1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
