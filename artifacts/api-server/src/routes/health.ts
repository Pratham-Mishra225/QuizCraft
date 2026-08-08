import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/gemini", async (_req, res) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "ping",
    });
    res.json({
      status: "ok",
      model: "gemini-3.1-flash-lite",
      responseSample: response.text?.trim() || "",
    });
  } catch (err: any) {
    const formatted = formatGeminiError(err, "gemini-3.1-flash-lite");
    // A 429 Quota Exceeded error actually confirms SDK initialization, auth, and endpoint are valid, 
    // it's just a rate-limiting metric constraint on free tier. We consider it "healthy" for connection/auth checks.
    if (formatted.status === 429) {
      res.json({
        status: "ok",
        model: "gemini-3.1-flash-lite",
        message: "Connection verified, but quota currently exceeded (429)",
        details: formatted,
      });
      return;
    }
    res.status(503).json({
      status: "error",
      message: formatted.message,
      statusCode: formatted.status || 500,
      details: formatted.details,
    });
  }
});

export default router;
