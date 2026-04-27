/**
 * Route Aggregator
 *
 * Mounts all API route modules onto a single Express router.
 * Each route file exports a Router that handles a specific domain.
 */
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);

export default router;
