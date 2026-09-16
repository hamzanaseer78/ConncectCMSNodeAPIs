/**
 * List duplicate job codes within the same tenant (organization).
 * Run: node scripts/check-job-code-duplicates.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT tenantid, code, COUNT(*)::int AS cnt, ARRAY_AGG(recno ORDER BY recno) AS job_ids
    FROM job
    WHERE tenantid IS NOT NULL
      AND code IS NOT NULL
      AND TRIM(code) <> ''
    GROUP BY tenantid, code
    HAVING COUNT(*) > 1
    ORDER BY tenantid, code
  `;

  if (!rows.length) {
    console.log("No duplicate job codes found per tenant.");
    return;
  }

  console.log(`Found ${rows.length} duplicate tenant+code group(s):\n`);
  for (const row of rows) {
    console.log(
      `tenantid=${row.tenantid} code="${row.code}" count=${row.cnt} job recnos=${row.job_ids.join(", ")}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
