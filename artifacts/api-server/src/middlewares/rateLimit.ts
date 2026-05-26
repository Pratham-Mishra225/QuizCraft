import { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

const rateLimitResponse = {
  message: "Too many requests. Please try again later.",
};

function tooManyRequestsHandler(_req: Request, res: Response): void {
  res.status(429).json(rateLimitResponse);
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
});

export const pdfAiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
});

export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
  skip: (req) => req.path === "/healthz",
});
