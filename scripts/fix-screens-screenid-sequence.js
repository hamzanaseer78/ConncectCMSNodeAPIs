/**
 * Fixes PostgreSQL serial/identity sequence for screens.screenid when it falls behind
 * MAX(screenid) (e.g. after manual inserts or restores). Run on the server:
 *   node scripts/fix-screens-screenid-sequence.js
 */

const prisma = require("../src/database/prisma");

async function main() {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('screens', 'screenid'),
      COALESCE((SELECT MAX(screenid) FROM screens), 0) + 1,
      false
    )
  `);
  console.log("screens.screenid sequence aligned so the next insert gets MAX(screenid) + 1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
