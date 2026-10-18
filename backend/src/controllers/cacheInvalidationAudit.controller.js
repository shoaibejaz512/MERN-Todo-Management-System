import mongoose from "mongoose";
import CacheInvalidationAudit from "../models/cacheInvalidationAudit.model.js";

export const cacheInvalidationAudit = async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 50;

    const parsedHours = Number.parseInt(req.query.hours, 10);
    const hours = Number.isFinite(parsedHours)
      ? Math.min(Math.max(parsedHours, 1), 168)
      : 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const dateFilter = {
      createdAt: { $gte: since },
    };

    const [
      totalOperations,
      failedOperations,
      successfulOperations,
      recentAudits,
    ] = await Promise.all([
      CacheInvalidationAudit.countDocuments(dateFilter),

      CacheInvalidationAudit.countDocuments({
        ...dateFilter,
        status: "FAILED",
      }),

      CacheInvalidationAudit.countDocuments({
        ...dateFilter,
        status: "SUCCESS",
      }),

      CacheInvalidationAudit.find(dateFilter)
        .select(
          "event entityType entityId keys status actorId errorCode createdAt"
        )
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Cache invalidation audit fetched successfully.",
      data: {
        windowHours: hours,
        totalOperations,
        successfulOperations,
        failedOperations,
        recentAudits,
      },
    });
  } catch (error) {
    console.error("[Cache Invalidation Audit Controller]", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch cache invalidation audit.",
    });
  }
};
