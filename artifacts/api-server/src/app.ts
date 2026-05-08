/**
 * Express Application Setup
 *
 * Configures the Express app with:
 * - Structured JSON logging via Pino (redacts sensitive headers)
 * - CORS for cross-origin requests
 * - JSON body parsing with a 50 MB limit (needed for base64-encoded images)
 * - All API routes mounted under the `/api` prefix
 */
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/* -------------------------------------------------------------------------- */
/*  Middleware                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Structured request/response logging.
 * Redacts authorization and cookie headers to avoid leaking secrets in logs.
 */
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0], // Strip query params from logs
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

/**
 * CORS configuration.
 * In production, restrict to the origin specified by CORS_ORIGIN.
 * In development, allow all origins for convenience.
 */
const corsOrigin = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === "production" && !corsOrigin) {
  throw new Error(
    "CORS_ORIGIN must be set in production. " +
      "Set it to the URL of the frontend (e.g. https://example.com).",
  );
}
app.use(cors({ origin: corsOrigin ?? true }));

/**
 * Parse JSON request bodies up to 50 MB.
 * The `/api/analyze` endpoint receives base64-encoded images which can be large.
 */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* -------------------------------------------------------------------------- */
/*  Routes                                                                     */
/* -------------------------------------------------------------------------- */

app.use("/api", router);

/* -------------------------------------------------------------------------- */
/*  Static File Serving (Production)                                           */
/* -------------------------------------------------------------------------- */

if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve("artifacts/cad-annotator/dist/public");
  app.use(express.static(staticPath));

  // SPA fallback: serve index.html for non-API routes
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(staticPath, "index.html"));
    }
  });
}

export default app;
