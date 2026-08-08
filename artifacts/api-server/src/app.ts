import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import router from "./routes/index.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { generalApiLimiter } from "./middlewares/rateLimit.js";
import { Quiz } from "./models/Quiz.js";
import { User } from "./models/User.js";

const app: Express = express();

const normalizedFrontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");
const allowedOrigins = new Set<string>([
  normalizedFrontendUrl,
  ...(env.NODE_ENV === "development"
    ? ["http://localhost:5173", "http://localhost:3000"]
    : []),
]);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.replace(/\/+$/, "");
    callback(null, allowedOrigins.has(normalizedOrigin));
  },
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", generalApiLimiter, router);

const migrateLegacyQuizzes = async () => {
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
        logger.info(`Migrated ${unownedCount} legacy quizzes to user: ${firstUser.username}`);
      } else {
        logger.warn(`Found ${unownedCount} legacy quizzes but no users exist to assign ownership to.`);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error migrating legacy quizzes");
  }
};

mongoose
  .connect(env.MONGODB_URI)
  .then(async () => {
    logger.info("Connected to MongoDB");
    await migrateLegacyQuizzes();
  })
  .catch((err) => logger.error({ err }, "MongoDB connection error"));

export default app;
