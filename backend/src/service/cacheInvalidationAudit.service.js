import { redisClient } from "../config/redis.js";
import CacheInvalidationAudit from "../models/cacheInvalidationAudit.model.js";

export const invalidateCacheWithAudit = async ({
  keys,
  event,
  entityType,
  entityId,
  actorId = null,
}) => {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];

  if (!uniqueKeys.length) {
    return { success: true, deletedCount: 0 };
  }

  let status = "SUCCESS";
  let errorCode = null;
  let deletedCount = 0;

  try {
    if (!redisClient.isReady) {
      throw new Error("REDIS_UNAVAILABLE");
    }

    deletedCount = await redisClient.del(uniqueKeys);
  } catch (error) {
    status = "FAILED";

    // Raw error message ya cache values audit mein store nahi karte.
    errorCode =
      error.message === "REDIS_UNAVAILABLE"
        ? "REDIS_UNAVAILABLE"
        : "CACHE_INVALIDATION_FAILED";

    console.error("[Cache Invalidation]", {
      event,
      entityType,
      entityId,
      errorCode,
    });
  }

  try {
    await CacheInvalidationAudit.create({
      event,
      entityType,
      entityId: String(entityId),
      keys: uniqueKeys,
      status,
      actorId,
      errorCode,
    });
  } catch (auditError) {
    // Audit DB failure ki wajah se successful MongoDB write ko
    // automatically fail nahi karna chahiye.
    console.error("[Cache Audit Persistence Failed]", {
      event,
      entityType,
      entityId: String(entityId),
    });
  }

  return {
    success: status === "SUCCESS",
    deletedCount,
  };
};
