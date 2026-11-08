import { Router } from "express";

import {
  livenessCheck,
  readinessCheck,
  dependencyHealth,
} from "../controllers/health.controller.js";

const router = Router();

router.get("/live", livenessCheck);
router.get("/ready", readinessCheck);
router.get("/dependencies", dependencyHealth);

export default router;
