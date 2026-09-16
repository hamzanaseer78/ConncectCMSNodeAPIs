#!/usr/bin/env node
/**
 * Apply job-approval migration and regenerate Prisma client.
 * Run on the server after git pull: npm run setup:approval
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

async function verify() {
  require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
  const schemaPath = path.join(root, "prisma/schema.prisma");
  const schemaText = require("fs").readFileSync(schemaPath, "utf8");
  if (!schemaText.includes("model jobapprovalsettings")) {
    console.error("\n[ERROR] prisma/schema.prisma is missing job approval models. Deploy latest code (git pull).");
    process.exit(1);
  }

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.warn(`\n[WARN] Node ${process.version} — Prisma 6 needs Node 18+. Use: nvm install 18 && nvm use 18`);
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1 AS ok FROM jobapprovalsettings LIMIT 1`;
    const ok = Boolean(prisma.jobapprovalsettings?.findFirst);
    if (ok) {
      console.log("\n[OK] Prisma client includes jobapprovalsettings.");
    } else {
      console.warn(
        "\n[WARN] Tables exist but Prisma client was not regenerated. API will use SQL fallback until you run:"
      );
      console.warn("       npx prisma generate   (on Node 18+)");
    }
  } catch (err) {
    console.error("\n[ERROR] Verification failed:", err.message);
    if (/does not exist|42P01/i.test(String(err.message))) {
      console.error("Run: npx prisma migrate deploy");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

console.log("=== Job approval setup ===");
run("npx prisma migrate deploy");
run("npx prisma generate");
verify();
console.log("\n=== Done. Restart the API process (pm2 restart all) ===\n");
