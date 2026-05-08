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
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start the server
 */
const server = app.listen(PORT, () => {
  console.log(`[SERVER] ✓ Started on port ${PORT} (${NODE_ENV})`);
  console.log(`[SERVER] API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`[SERVER] GraphQL Playground: http://localhost:${PORT}/graphql/playground`);
});

/**
 * Graceful shutdown handler
 * Ensures all connections are closed properly before exit
 */
async function shutdown(signal) {
  console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new requests
  server.close(async () => {
    console.log("[SHUTDOWN] HTTP server closed");
  });

  try {
    // Set a timeout for shutdown (30 seconds)
    const shutdownTimeout = setTimeout(() => {
      console.error("[SHUTDOWN] Timeout, forcing exit");
      process.exit(1);
    }, 30000);

    // Close database connections
    await prisma.$disconnect();
    console.log("[SHUTDOWN] ✓ Database connections closed");

    clearTimeout(shutdownTimeout);
    console.log("[SHUTDOWN] ✓ Graceful shutdown completed");
    process.exit(0);
  } catch (err) {
    console.error("[SHUTDOWN] Error during shutdown:", err.message);
    process.exit(1);
  }
}

/**
 * Signal handlers for graceful shutdown
 */
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/**
 * Handle uncaught exceptions
 */
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION]", reason);
  process.exit(1);
});

