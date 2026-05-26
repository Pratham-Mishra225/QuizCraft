import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { Response } from "express";
import { env } from "../config/env.js";

const router = Router();

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req, res: Response) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { username, email, password } = parsed.data;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    res.status(400).json({ message: "Email or username already taken" });
    return;
  }

  const user = await User.create({ username, email, password });
  const token = signToken(String(user._id));

  res.status(201).json({
    token,
    user: { id: String(user._id), username: user.username, email: user.email },
  });
});

router.post("/login", async (req, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error" });
    return;
  }

  const { email, password } = parsed.data;
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signToken(String(user._id));
  res.json({
    token,
    user: { id: String(user._id), username: user.username, email: user.email },
  });
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).select("-password");
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  res.json({ id: String(user._id), username: user.username, email: user.email });
});

export default router;
