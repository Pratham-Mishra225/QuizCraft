/**
 * Application error codes.
 * Use these when throwing AppError or constructing error responses.
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  QUIZ_NOT_FOUND: "QUIZ_NOT_FOUND",
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
  CONFLICT: "CONFLICT",
  AI_GENERATION_FAILED: "AI_GENERATION_FAILED",
  PDF_PROCESSING_FAILED: "PDF_PROCESSING_FAILED",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured application error that carries an HTTP status code and a
 * machine-readable error code alongside the human-readable message.
 *
 * Throw this from route handlers or middleware to bypass the generic
 * "unexpected error" path in the centralized error handler.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeType;

  constructor(message: string, statusCode: number, code: ErrorCodeType) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    // Restore prototype chain in compiled JS (needed for instanceof checks)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
