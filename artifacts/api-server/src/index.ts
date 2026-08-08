import app from "./app";
import { env } from "./config/env.js";
import { logger } from "./lib/logger";
import { validateGeminiConnection, formatGeminiError } from "@workspace/integrations-gemini-ai";

const port = env.PORT;

async function startServer() {
  logger.info("Validating Gemini API connection at startup...");
  try {
    await validateGeminiConnection();
    logger.info("Gemini API connection validation succeeded.");
  } catch (err: any) {
    const errorDetails = formatGeminiError(err);
    logger.error(
      { errorDetails, err },
      "FATAL: Gemini API connection validation failed at startup. Process exiting."
    );
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

startServer();
