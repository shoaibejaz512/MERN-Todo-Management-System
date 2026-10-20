import { createHash } from "node:crypto";
import { redisClient } from "../config/redis.config.js";

const LOGIN_ATTEMPT_PREFIX = "auth:login";
const EMAIL_HASH_LENGTH = 64;

/**
 * Normalize and hash an email so the raw email
 * is never exposed in the Redis key.
 */
const getEmailHash = (email) => {
  if (typeof email !== "string" || !email.trim()) {
    throw new TypeError("A valid email is required");
  }

  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, EMAIL_HASH_LENGTH);
};

/**
 * Shared keys for login-attempt tracking.
 *
 * IMPORTANT:
 * protectLoginBruteForce must use these same keys
 * when recording failures and checking lockout state.
 */
export const getLoginAttemptKeys = (email) => {
  const emailHash = getEmailHash(email);

  return {
    attemptsKey: `${LOGIN_ATTEMPT_PREFIX}:attempts:${emailHash}`,
    lockKey: `${LOGIN_ATTEMPT_PREFIX}:lock:${emailHash}`,
  };
};

/**
 * Clear account-specific failed-login tracking
 * after successful authentication.
 *
 * Reuses the application's existing node-redis client.
 */
export const clearLoginAttemptState = async (req) => {
  const email = req.body?.email;

  if (typeof email !== "string" || !email.trim()) {
    throw new TypeError("Cannot clear login attempts without an email");
  }

  if (!redisClient?.isOpen) {
    throw new Error("Redis connection is not available");
  }

  const { attemptsKey, lockKey } = getLoginAttemptKeys(email);

  const deletedCount = await redisClient.del([attemptsKey, lockKey]);

  return {
    success: true,
    deletedCount,
  };
};
