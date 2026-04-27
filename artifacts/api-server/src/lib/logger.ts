/**
 * Application Logger
 *
 * Uses Pino for structured JSON logging in production and pretty-printed
 * coloured output in development. Log level is configurable via the
 * `LOG_LEVEL` environment variable (defaults to "info").
 *
 * Sensitive headers (Authorization, Cookie, Set-Cookie) are automatically
 * redacted from request/response logs.
 */
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",

  /** Prevent secrets from appearing in log output. */
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],

  /**
   * In development, pipe logs through pino-pretty for human-readable output.
   * In production, emit raw JSON for log aggregation tools (Datadog, ELK, etc.).
   */
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
