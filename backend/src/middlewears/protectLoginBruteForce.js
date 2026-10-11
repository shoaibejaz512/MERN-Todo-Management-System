import { createHash } from "node:crypto";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";

import  redisClient  from "../config/redis.config.js";

// --------------------------------------------------
// Rate limiter configuration
// --------------------------------------------------

// IP-level protection:
// Maximum 30 login requests per 15 minutes.
const ipLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login:ip",
  points: 30,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// Email + IP protection:
// Maximum 5 attempts per 15 minutes.
// Successful login par is counter ko clear karenge.
const emailIpLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login:email-ip",
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// --------------------------------------------------
// Normalize and hash identifiers
// --------------------------------------------------

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const hashIdentifier = (value) =>
  createHash("sha256").update(value).digest("hex");

// Use the same key generation in middleware and helpers.
const getIpKey = (ip) => hashIdentifier(ip || "unknown");

const getEmailIpKey = (email, ip) =>
  hashIdentifier(`${normalizeEmail(email)}:${ip || "unknown"}`);

// --------------------------------------------------
// Handle rate-limit responses
// --------------------------------------------------

const sendRateLimitResponse = (res, error) => {
  const retryAfter = Math.max(1, Math.ceil(error.msBeforeNext / 1000));

  res.set("Retry-After", String(retryAfter));

  return res.status(429).json({
    success: false,
    message: "Too many login attempts. Please try again later.",
    retryAfter,
  });
};

// --------------------------------------------------
// Login brute-force protection middleware
// --------------------------------------------------

export const protectLoginBruteForce = async (req, res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const email = normalizeEmail(req.body?.email);

    // First layer: limit requests from the same IP.
    await ipLimiter.consume(getIpKey(ip));

    // Second layer: limit attempts for this email from
    // this IP. Skip this layer if email is missing/invalid;
    // normal login validation should handle that case.
    if (email && email.length <= 254) {
      await emailIpLimiter.consume(getEmailIpKey(email, ip));
    }

    return next();
  } catch (error) {
    // Expected rate-limit rejection.
    if (error instanceof RateLimiterRes) {
      return sendRateLimitResponse(res, error);
    }

    // Redis/infrastructure failure:
    // Fail closed rather than silently bypassing security.
    console.error("Login rate limiter unavailable:", error.message);

    return res.status(503).json({
      success: false,
      message:
        "Login service is temporarily unavailable. Please try again later.",
    });
  }
};

// --------------------------------------------------
// Clear email + IP counter after successful login
// --------------------------------------------------

export const clearLoginAttemptState = async (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const email = normalizeEmail(req.body?.email);

  if (!email || email.length > 254) {
    return;
  }

  await emailIpLimiter.delete(getEmailIpKey(email, ip));
};
