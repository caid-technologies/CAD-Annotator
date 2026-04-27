/**
 * Express Application Setup
 *
 * Configures the Express app with:
 * - Structured JSON logging via Pino (redacts sensitive headers)
 * - CORS for cross-origin requests
 * - JSON body parsing with a 50 MB limit (needed for base64-encoded images)
 * - All API routes mounted under the `/api` prefix
 */
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

/** Allow cross-origin requests. Tighten `origin` in production. */
app.use(cors());

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

export default app;
