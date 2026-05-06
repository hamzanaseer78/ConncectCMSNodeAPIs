require("dotenv").config({ quiet: true });

// Validate environment variables on startup
const { validateEnv } = require("./utils/env-validator");
try {
  validateEnv();
} catch (err) {
  console.error("[STARTUP] Fatal error:", err.message);
  process.exit(1);
}

const app = require("./app");
const prisma = require("./database/prisma");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

async function shutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}`);
  try {
    await prisma.$disconnect();
    server.close(() => {
      console.log("[SHUTDOWN] Closed gracefully");
      process.exit(0);
    });
  } catch (err) {
    console.error("[SHUTDOWN] Error:", err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Unhandled errors
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT] Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED] Promise rejection:", reason);
  process.exit(1);
});
