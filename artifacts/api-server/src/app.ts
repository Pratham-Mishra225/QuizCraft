import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const MONGODB_URI = process.env["MONGODB_URI"];

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => logger.info("Connected to MongoDB"))
    .catch((err) => logger.error({ err }, "MongoDB connection error"));
} else {
  logger.warn("MONGODB_URI not set — database features will not work");
}

export default app;
