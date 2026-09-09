import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import { isMongoReady } from "../db/mongodb.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * Liveness probe — is the process alive and Express responding?
 * Lightweight: no external dependencies checked.
 */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Readiness probe — can this instance safely serve application requests?
 * Checks MongoDB connection state without making a network call.
 *
 * 200 → ready to serve
 * 503 → not ready (e.g. DB still connecting or disconnected)
 */
router.get("/readyz", (_req, res) => {
  if (isMongoReady()) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not_ready" });
  }
});

/**
 * Gemini diagnostic — optional endpoint to manually verify AI connectivity.
 * NOT part of startup or readiness. Safe external responses only:
 *   - no API key values
 *   - no internal stack traces
 *   - no Gemini endpoint URLs
 *   - no response samples
 */
router.get("/healthz/gemini", async (_req, res) => {
  try {
    await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "ping",
    });
    res.json({ status: "ok" });
  } catch (err: unknown) {
    const formatted = formatGeminiError(err, "gemini-3.1-flash-lite");

    // Log full diagnostics internally (endpoint, status, details)
    logger.warn(
      {
        event: "gemini_health_check_failed",
        status: formatted.status,
        details: formatted.details,
      },
      "Gemini health check failed"
    );

    // 429 confirms connectivity and auth — just rate-limited
    if (formatted.status === 429) {
      res.json({ status: "ok" });
      return;
    }

    // All other failures: return opaque unavailable status
    res.status(503).json({ status: "unavailable" });
  }
});

export default router;
