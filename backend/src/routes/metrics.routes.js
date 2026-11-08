import { Router } from "express";
import { registry,getMetrics } from "../config/metrics.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const { contentType, metrics } = await getMetrics();
    res.set("Content-Type", registry.contentType);
    res.send(metrics);
    res.end(await registry.metrics());
  } catch (error) {
    next(error);
  }
});

export default router;