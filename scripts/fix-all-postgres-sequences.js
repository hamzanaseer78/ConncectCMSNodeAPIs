/**
 * Align every PostgreSQL serial/identity sequence with MAX(pk) for public tables.
 * Run on the server after imports or restores: node scripts/fix-all-postgres-sequences.js
 */

const prisma = require("../src/database/prisma");
const { syncPostgresSequence } = require("../src/utils/postgres-sequence");

async function listSerialColumns() {
  return prisma.$queryRawUnsafe(`
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      a.attname AS column,
      pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
    ORDER BY c.relname, a.attname
  `);
}

async function readColumnMax(tx, schema, table, column) {
  const rows = await tx.$queryRawUnsafe(`
    SELECT COALESCE(MAX("${column}"), 0)::bigint AS max
    FROM "${schema}"."${table}"
  `);
  return Number(rows[0]?.max ?? 0);
}

async function main() {
  const columns = await listSerialColumns();
  const report = [];

  for (const entry of columns) {
    const schema = entry.schema;
    const table = entry.table;
    const column = entry.column;

    const beforeMax = await prisma.$transaction(async (tx) => readColumnMax(tx, schema, table, column));

    await prisma.$transaction(async (tx) => {
      await syncPostgresSequence(tx, table, column, schema);
    });

    const afterMax = await prisma.$transaction(async (tx) => readColumnMax(tx, schema, table, column));

    report.push({
      table,
      column,
      seqName: entry.seq_name,
      maxBefore: beforeMax,
      maxAfter: afterMax,
      nextValue: afterMax + 1
    });
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`Aligned ${report.length} PostgreSQL sequence(s) in schema public.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
