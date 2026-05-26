import app from "./app";
import { env } from "./config/env.js";
import { logger } from "./lib/logger";

const port = env.PORT;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
