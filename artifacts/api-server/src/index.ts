import http from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { connectToMongoDB, closeMongoDB } from "./db/mongodb.js";

// ── Process-level error guards ────────────────────────────────────────────────
// These catch programming errors that escape all other handlers.
// Always exit — a process in an unknown state should not continue serving.

process.on("uncaughtException", (err) => {
  logger.fatal({ err, event: "uncaught_exception" }, "Uncaught exception — exiting");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason, event: "unhandled_rejection" }, "Unhandled promise rejection — exiting");
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  logger.info({ event: "server_starting", port: env.PORT }, "Starting server...");

  // Connect to MongoDB first. If this fails, we exit — the server must not
  // start without a working database connection.
  try {
    await connectToMongoDB();
  } catch (err) {
    logger.fatal(
      { err, event: "database_connection_failed" },
      "Failed to connect to MongoDB — aborting startup"
    );
    process.exit(1);
  }

  // Database is ready. Start the HTTP server.
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info({ event: "server_ready", port: env.PORT }, "Server ready");
  });

  server.on("error", (err) => {
    logger.fatal({ err, event: "server_listen_error" }, "HTTP server failed to start");
    process.exit(1);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal, event: "server_shutdown" }, "Shutdown signal received");

    // Stop accepting new connections
    server.close(async () => {
      try {
        await closeMongoDB();
      } catch (err) {
        logger.error({ err }, "Error closing MongoDB during shutdown");
      }
      logger.info({ event: "server_stopped" }, "Server stopped cleanly");
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.warn({ event: "shutdown_timeout" }, "Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT",  () => { void shutdown("SIGINT"); });
}

startServer();
