import { Request, Response, NextFunction } from "express";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AUTH_COOKIE_NAME } from "../lib/cookie.js";

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Extract the bearer token from the Authorization header.
 * Returns null if the header is absent or malformed.
 *
 * NOTE: Bearer header support is retained solely for the test suite (supertest),
 * which cannot easily manage HttpOnly cookies. The browser application exclusively
 * uses the HttpOnly cookie path. Remove Bearer fallback before any public release.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) return null;
  const token = match[1].trim();
  return token || null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // ── Primary: HttpOnly cookie (browser authentication) ────────────────────────
  const cookieToken: string | undefined = req.cookies?.[AUTH_COOKIE_NAME];

  // ── Fallback: Authorization: Bearer <token> (test suite compatibility) ───────
  const bearerToken = extractBearerToken(req);

  const token = cookieToken ?? bearerToken ?? null;

  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ message: "Token expired" });
      return;
    }
    if (err instanceof JsonWebTokenError) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }
    res.status(401).json({ message: "Unauthorized" });
  }
}
