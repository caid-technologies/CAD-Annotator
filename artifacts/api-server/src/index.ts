/**
 * API Server Entry Point
 *
 * Validates required environment variables, then starts the Express HTTP
 * server. Exits with code 1 on startup failure so process managers (systemd,
 * Docker, etc.) can detect and restart the service.
 */
import app from "./app";
import { logger } from "./lib/logger";

/* -------------------------------------------------------------------------- */
/*  Environment validation                                                     */
/* -------------------------------------------------------------------------- */

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/* -------------------------------------------------------------------------- */
/*  Start server                                                               */
/* -------------------------------------------------------------------------- */

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
