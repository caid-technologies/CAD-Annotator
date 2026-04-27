/**
 * Health Check Route
 *
 * Provides a lightweight endpoint for load balancers, orchestrators (K8s),
 * and monitoring tools to verify the server is running and responsive.
 *
 * GET /api/healthz → { status: "ok" }
 */
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
