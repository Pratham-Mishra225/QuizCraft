import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import router from "./routes/index.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { generalApiLimiter } from "./middlewares/rateLimit.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { ErrorCode } from "./lib/errors.js";

const app: Express = express();

// ── Frontend dist path ────────────────────────────────────────────────────────
// Resolve the React production build directory relative to this module's
// location. This is safe regardless of which working directory the server
// is started from, because import.meta.url is always the file's own URL.
//
// In source:  src/app.ts  → quiz-app/dist/public is ../../quiz-app/dist/public
// In bundle:  dist/index.mjs → quiz-app/dist/public is ../../quiz-app/dist/public
//
// Both paths share the same relative layout inside the monorepo:
//   artifacts/api-server/src/app.ts
//   artifacts/quiz-app/dist/public/
//
// When bundled to dist/index.mjs the relative path becomes:
//   artifacts/api-server/dist/index.mjs  →  ../../quiz-app/dist/public
//
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "..", "..", "quiz-app", "dist", "public");
const FRONTEND_INDEX = path.join(FRONTEND_DIST, "index.html");

const hasFrontendBuild = fs.existsSync(FRONTEND_INDEX);
if (!hasFrontendBuild) {
  logger.warn(
    { frontendDist: FRONTEND_DIST, event: "frontend_build_missing" },
    "React production build not found — frontend will not be served. Run `pnpm --filter @workspace/quiz-app run build` first.",
  );
}

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
  // Required for cookie-based auth when frontend/backend are cross-origin (e.g. dev).
  // Without this, browsers will not attach the HttpOnly auth_token cookie.
  credentials: true,
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
// Parse cookies so req.cookies.auth_token is available in auth middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ────────────────────────────────────────────────────────────────
// IMPORTANT: API routes are registered FIRST so that /api/* is never
// accidentally served as a static file or SPA page.
app.use("/api", generalApiLimiter, router);

// ── API 404 — must come after API routes, before static/SPA middleware ────────
// Only catches /api/* paths so the SPA fallback below is unaffected.
app.use("/api", (_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: "Route not found.",
    },
  });
});

// ── Static assets ─────────────────────────────────────────────────────────────
// Serve the built React app's static files (JS, CSS, images, favicon, etc.)
// `index: false` prevents express.static from serving index.html itself — the
// SPA fallback below handles that so wouter client-side routing works on
// direct navigation and refresh.
if (hasFrontendBuild) {
  app.use(
    express.static(FRONTEND_DIST, {
      index: false,
      // Cache static assets aggressively — Vite fingerprints asset filenames.
      maxAge: env.NODE_ENV === "production" ? "1y" : 0,
    }),
  );

  // ── SPA fallback ────────────────────────────────────────────────────────────
  // Any request that reaches here is not an API call and not a static file.
  // Return index.html so the React router can handle client-side navigation.
  //
  // NOTE: Express 5 no longer supports app.get("*path", ...) with a wildcard
  // splat. Use app.use() instead — it is functionally equivalent for a catch-all.
  app.use((_req: Request, res: Response) => {
    res.sendFile(FRONTEND_INDEX);
  });
}

// ── Centralized error handler — must be last ──────────────────────────────────
app.use(errorHandler);

export default app;
