import type { Response } from "express";
import { env } from "../config/env.js";

/**
 * The name used for the HttpOnly authentication cookie.
 * Centralised here so auth routes, middleware, and tests all reference the same constant.
 */
export const AUTH_COOKIE_NAME = "auth_token";

/**
 * Parse a vercel/ms-style duration string (e.g. "7d", "1h", "30m") to seconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks).
 * Returns the numeric seconds, or a safe default of 7 days if parsing fails.
 */
function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)(s|m|h|d|w)$/.exec(ttl.trim().toLowerCase());
  if (!match) return 7 * 24 * 60 * 60; // default: 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 60 * 60;
    case "d": return value * 24 * 60 * 60;
    case "w": return value * 7 * 24 * 60 * 60;
    default:  return 7 * 24 * 60 * 60;
  }
}

const isProduction = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
const MAX_AGE_SECONDS = ttlToSeconds(env.AUTH_TOKEN_TTL);

/**
 * Set the HttpOnly authentication cookie on the response.
 *
 * Security attributes:
 *   HttpOnly  — JS cannot read the token (XSS protection)
 *   Secure    — only sent over HTTPS in production
 *   SameSite  — Lax: sent on same-site requests + top-level navigations,
 *               prevents CSRF on cross-site POST without needing a token
 *   Path      — "/" so all API routes receive the cookie
 *   Max-Age   — aligned with the JWT expiry (AUTH_TOKEN_TTL)
 */
export function setCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS * 1000, // Express cookie maxAge is in milliseconds
  });
}

/**
 * Clear the authentication cookie.
 * Must use the same path/domain/sameSite attributes as setCookie,
 * otherwise some browsers won't actually remove the cookie.
 */
export function clearCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}
