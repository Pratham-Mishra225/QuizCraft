import { Request, Response, NextFunction } from "express";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: "Authorization header missing" });
    return;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    res
      .status(401)
      .json({ message: "Authorization header must be in the format: Bearer <token>" });
    return;
  }

  const token = match[1].trim();
  if (!token) {
    res.status(401).json({ message: "Authorization token missing" });
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
