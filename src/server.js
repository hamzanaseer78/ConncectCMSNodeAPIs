require("dotenv").config({ quiet: true });

// Validate environment variables on startup
const { validateEnv } = require("./utils/env-validator");
const logger = require("./utils/logger");

try {
  validateEnv();
} catch (err) {
  logger.fatal("Startup validation failed", {}, err);
  process.exit(1);
}

const app = require("./app");
const prisma = require("./database/prisma");
const seqProxy = app.seqProxy;

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Start the server
 */
const server = app.listen(PORT, async () => {
  logger.info("Server started", {
    Port: PORT,
    Environment: NODE_ENV,
    ApiDocsUrl: `http://localhost:${PORT}/api-docs`,
    GraphqlPlaygroundUrl: `http://localhost:${PORT}/graphql/playground`,
    GraphqlStudioUrl: `http://localhost:${PORT}/graphql/studio`,
    SeqLoggingEnabled: logger.isSeqEnabled(),
    SeqUiUrl: process.env.SEQ_SERVER_URL || null
  });

  try {
    const jobApprovalService = require("./services/job-approval.service");
    const diag = await jobApprovalService.getDiagnostics({ tenantid: 0, branchid: 0 });
    if (diag.ready) {
      logger.info("Job approval workflow ready");
    } else {
      logger.warn("Job approval workflow not ready", { Fix: diag.fix });
    }
  } catch (err) {
    logger.warn("Job approval check skipped", {}, err);
  }

  try {
    const { isFirebaseConfigured } = require("./config/firebase");
    if (isFirebaseConfigured()) {
      logger.info("Firebase ready", { Features: "FCM + Firestore notifications inbox" });
    } else {
      logger.warn("Firebase not configured", {
        Hint: "Set FIREBASE_SERVICE_ACCOUNT_PATH for push notifications"
      });
    }
  } catch (err) {
    logger.warn("Firebase check skipped", {}, err);
  }
});

if (seqProxy) {
  server.on("upgrade", (req, socket, head) => {
    if (seqProxy.handleUpgrade(req, socket, head)) {
      return;
    }
    socket.destroy();
  });
}

/**
 * Graceful shutdown handler
 * Ensures all connections are closed properly before exit
 */
async function shutdown(signal) {
  logger.info("Graceful shutdown started", { Signal: signal });

  // Stop accepting new requests
  server.close(async () => {
    logger.info("HTTP server closed");
  });

  try {
    // Set a timeout for shutdown (30 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.fatal("Shutdown timeout, forcing exit");
      process.exit(1);
    }, 30000);

    // Close database connections
    await prisma.$disconnect();
    logger.info("Database connections closed");

    clearTimeout(shutdownTimeout);
    await logger.close();
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", {}, err);
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
  logger.fatal("Uncaught exception", {}, err);
  logger.close().finally(() => process.exit(1));
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.fatal("Unhandled promise rejection", {}, err);
  logger.close().finally(() => process.exit(1));
});

