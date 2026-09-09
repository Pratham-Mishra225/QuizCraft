import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { Quiz } from "../models/Quiz.js";
import { User } from "../models/User.js";

/**
 * Migrate quizzes that were created before user ownership was enforced.
 * Runs once after successful DB connection. Errors are logged but do not
 * abort startup — the data is still readable, just not migrated.
 */
async function migrateLegacyQuizzes(): Promise<void> {
  try {
    const unownedCount = await Quiz.countDocuments({
      $or: [{ createdBy: { $exists: false } }, { createdBy: null }],
    });
    if (unownedCount > 0) {
      const firstUser = await User.findOne();
      if (firstUser) {
        await Quiz.updateMany(
          { $or: [{ createdBy: { $exists: false } }, { createdBy: null }] },
          { $set: { createdBy: firstUser._id } }
        );
        logger.info(
          { count: unownedCount, assignedTo: firstUser.username },
          "legacy_quizzes_migrated"
        );
      } else {
        logger.warn(
          { unownedCount },
          "legacy_quizzes_found_but_no_users_exist"
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "legacy_quiz_migration_error");
  }
}

/**
 * Connect to MongoDB. Awaiting this promise ensures the HTTP server
 * only starts after the database is reachable.
 *
 * Throws on connection failure — callers should catch and exit the process.
 */
export async function connectToMongoDB(): Promise<void> {
  logger.info({ event: "database_connecting" }, "Connecting to MongoDB...");

  // mongoose.connect() resolves when the initial connection succeeds,
  // or rejects on the first connection attempt failure.
  await mongoose.connect(env.MONGODB_URI);

  logger.info({ event: "database_connected" }, "Connected to MongoDB");

  await migrateLegacyQuizzes();
}

/**
 * Cleanly close the Mongoose connection. Call this during graceful shutdown.
 */
export async function closeMongoDB(): Promise<void> {
  await mongoose.connection.close();
  logger.info({ event: "database_closed" }, "MongoDB connection closed");
}

/**
 * Returns true when Mongoose reports a live connection (readyState === 1).
 * Safe to call at any time — does not make a network request.
 *
 * Mongoose 9 readyState values:
 *   0 = disconnected
 *   1 = connected
 *   2 = connecting
 *   3 = disconnecting
 */
export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
