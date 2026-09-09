import { type Request, type Response, type NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import multer from "multer";
import { AppError, ErrorCode } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Shape of every error response body sent to clients.
 * Internal diagnostics (stack traces, raw DB errors, credentials)
 * are never included here — they go to the logger only.
 */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

function buildResponse(
  code: string,
  message: string,
  details?: { field: string; message: string }[]
): ErrorResponseBody {
  const body: ErrorResponseBody = { error: { code, message } };
  if (details && details.length > 0) {
    body.error.details = details;
  }
  return body;
}

/**
 * Centralized Express error-handling middleware.
 *
 * Registration order matters: this MUST be the last middleware in app.ts,
 * registered after all routes. Express identifies error middleware by the
 * four-argument signature (err, req, res, next).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── 1. AppError: thrown intentionally from route/middleware ─────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildResponse(err.code, err.message));
    return;
  }

  // ── 2. Zod validation error ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const details = err.errors.map((issue) => ({
      field: issue.path.join(".") || "input",
      message: issue.message,
    }));
    res
      .status(400)
      .json(buildResponse(ErrorCode.VALIDATION_ERROR, "Invalid request", details));
    return;
  }

  // ── 3. Multer errors ────────────────────────────────────────────────────────
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res
        .status(400)
        .json(buildResponse(ErrorCode.VALIDATION_ERROR, "File too large. Maximum size is 5 MB."));
      return;
    }
    res
      .status(400)
      .json(buildResponse(ErrorCode.VALIDATION_ERROR, "File upload error."));
    return;
  }

  // ── 4. Mongoose duplicate key (E11000) ──────────────────────────────────────
  if (
    err instanceof mongoose.mongo.MongoServerError &&
    err.code === 11000
  ) {
    // Log internal details (includes collection, key) but never expose them
    logger.warn({ err }, "database_duplicate_key");
    res
      .status(409)
      .json(
        buildResponse(
          ErrorCode.CONFLICT,
          "A resource with these details already exists."
        )
      );
    return;
  }

  // ── 5. Mongoose ValidationError ─────────────────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    logger.warn({ err }, "database_validation_error");
    res
      .status(400)
      .json(buildResponse(ErrorCode.VALIDATION_ERROR, "Invalid request", details));
    return;
  }

  // ── 6. Unexpected errors — log full details, return generic safe response ───
  logger.error(
    {
      err,
      req: {
        method: req.method,
        url: req.url,
        // req.id is set by pino-http
        id: (req as Request & { id?: string }).id,
      },
      event: "request_failed",
    },
    "Unhandled error in request"
  );

  res
    .status(500)
    .json(
      buildResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "An unexpected error occurred."
      )
    );
}
