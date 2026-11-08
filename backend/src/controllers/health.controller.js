import mongoose from "mongoose";

// IMPORTANT:
// Apne existing Redis client ka actual import path aur export
// yahan use karo. Neeche redisClient ek placeholder hai.
import { redisClient } from "../config/redis.js";

export function livenessCheck(req, res) {
  // Agar event loop blocked hai, request waqt par process nahi hogi.
  return res.status(200).json({
    status: "alive",
    requestId: req.id,
  });
}

export async function readinessCheck(req, res) {
  try {
    const mongoReady = mongoose.connection.readyState === 1;

    if (!mongoReady) {
      return res.status(503).json({
        status: "not_ready",
        requestId: req.id,
      });
    }

    return res.status(200).json({
      status: "ready",
      requestId: req.id,
    });
  } catch (error) {
    req.log?.error({ err: error, requestId: req.id }, "Readiness check failed");

    return res.status(503).json({
      status: "not_ready",
      requestId: req.id,
    });
  }
}

export async function dependencyHealth(req, res) {
  const dependencies = {};

  // MongoDB check
  try {
    if (!mongoose.connection.db) {
      throw new Error("MongoDB connection unavailable");
    }

    await mongoose.connection.db.admin().ping();
    dependencies.mongodb = "up";
  } catch {
    dependencies.mongodb = "down";
  }

  // Redis check
  try {
    if (!redisClient || redisClient.status !== "ready") {
      throw new Error("Redis is not ready");
    }

    await redisClient.ping();
    dependencies.redis = "up";
  } catch {
    dependencies.redis = "down";
  }

  const allHealthy = Object.values(dependencies).every(
    (status) => status === "up"
  );

  return res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "healthy" : "degraded",
    dependencies,
    requestId: req.id,
  });
}
