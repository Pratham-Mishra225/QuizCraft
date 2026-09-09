import { Router, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import { RegisterSchema, LoginSchema } from "../schemas/auth.js";
import { env } from "../config/env.js";
import { authLimiter } from "../middlewares/rateLimit.js";
import { setCookie, clearCookie } from "../lib/cookie.js";

const router = Router();

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.AUTH_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
// Creates a new user account, issues an HttpOnly auth cookie, and returns the
// safe user object. Does NOT return the JWT in the response body.
router.post("/register", authLimiter, async (req, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { username, email, password } = parsed.data;

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });
  if (existing) {
    res.status(400).json({ message: "Email or username already taken" });
    return;
  }

  const user = await User.create({
    username,
    email: email.toLowerCase(),
    password,
  });

  const token = signToken(String(user._id));
  setCookie(res, token);

  res.status(201).json({
    user: { id: String(user._id), username: user.username, email: user.email },
  });
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
// Validates credentials, issues an HttpOnly auth cookie, and returns the
// safe user object. Does NOT return the JWT in the response body.
router.post("/login", authLimiter, async (req, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signToken(String(user._id));
  setCookie(res, token);

  res.json({
    user: { id: String(user._id), username: user.username, email: user.email },
  });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Clears the authentication cookie on the server side.
// No requireAuth guard — logout should always succeed (even if already logged out),
// to prevent information leakage about session validity.
//
// NOTE: This clears the browser's cookie. The JWT remains mathematically valid
// until it expires (stateless design). A server-side revocation mechanism (e.g.
// a Redis token blacklist) would be required to truly invalidate all copies of
// a token — this is out of scope for Stage 5.
router.post("/logout", (_req, res: Response) => {
  clearCookie(res);
  res.json({ message: "Logged out successfully" });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Returns the currently authenticated user. The browser sends the HttpOnly
// cookie automatically; no client-side token management required.
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).select("-password");
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  res.json({ id: String(user._id), username: user.username, email: user.email });
});

export default router;
