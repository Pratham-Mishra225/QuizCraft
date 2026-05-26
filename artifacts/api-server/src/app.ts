import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import router from "./routes/index.js";
import { env } from "./config/env.js";
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

mongoose
  .connect(env.MONGODB_URI)
  .then(() => logger.info("Connected to MongoDB"))
  .catch((err) => logger.error({ err }, "MongoDB connection error"));

export default app;
