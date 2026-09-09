import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { generalApiLimiter } from "./middlewares/rateLimit.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { ErrorCode } from "./lib/errors.js";

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

// ── Middleware stack ──────────────────────────────────────────────────────────
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

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", generalApiLimiter, router);

// ── API 404 — must come after routes, before error handler ───────────────────
// Only matches /api/* paths so the SPA frontend fallback is unaffected.
app.use("/api", (_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: "Route not found.",
    },
  });
});

// ── Centralized error handler — must be last ──────────────────────────────────
app.use(errorHandler);

export default app;
