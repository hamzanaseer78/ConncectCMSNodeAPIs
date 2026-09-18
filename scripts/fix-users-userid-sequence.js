/**
 * Diagnose and fix users.userid serial drift.
 * Run on the server: node scripts/fix-users-userid-sequence.js
 * For every table: node scripts/fix-all-postgres-sequences.js
 */

const prisma = require("../src/database/prisma");
const { syncPostgresSequence } = require("../src/utils/postgres-sequence");

async function readDiagnostics(tx) {
  const maxRow = await tx.users.aggregate({ _max: { userid: true } });
  const maxUserid = maxRow._max.userid ?? 0;

  const seqRows = await tx.$queryRawUnsafe(`
    SELECT
      pg_get_serial_sequence('public.users', 'userid') AS seq_name,
      COALESCE(
        (SELECT last_value FROM pg_sequences
          WHERE schemaname = 'public'
            AND sequencename = 'users_userid_seq'),
        0
      )::bigint AS seq_last_value
  `);

  return {
    maxUserid,
    seqName: seqRows[0]?.seq_name ?? null,
    seqLastValue: Number(seqRows[0]?.seq_last_value ?? 0)
  };
}

async function main() {
  const before = await prisma.$transaction(async (tx) => readDiagnostics(tx));

  await prisma.$transaction(async (tx) => {
    await syncPostgresSequence(tx, "users", "userid");
  });

  const after = await prisma.$transaction(async (tx) => readDiagnostics(tx));

  console.log(JSON.stringify({ before, after }, null, 2));
  console.log(
    `users.userid sequence aligned; next autoincrement should use ${after.maxUserid + 1}.`
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
