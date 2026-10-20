import { createHash } from "node:crypto";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";

import redisClient from "../config/redis.config.js";

// Maximum requests per IP: 30 per 15 minutes.
const ipLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login:ip",
  points: 30,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// Maximum attempts per normalized email + IP: 5 per 15 minutes.
const emailIpLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login:email-ip",
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const hashIdentifier = (value) =>
  createHash("sha256").update(value).digest("hex");

const getIpKey = (ip) => hashIdentifier(ip || "unknown");

const getEmailIpKey = (email, ip) =>
  hashIdentifier(`${normalizeEmail(email)}:${ip || "unknown"}`);

const sendRateLimitResponse = (res, error) => {
  const retryAfter = Math.max(1, Math.ceil(error.msBeforeNext / 1000));

  res.set("Retry-After", String(retryAfter));

  return res.status(429).json({
    success: false,
    message: "Too many login attempts. Please try again later.",
    retryAfter,
  });
};

export const protectLoginBruteForce = async (req, res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";

    const email = normalizeEmail(req.body?.email);

    // Reject malformed email input from the email limiter,
    // but allow normal controller validation to return 400.
    const validEmailForLimiter = email.length > 0 && email.length <= 254;

    // Consume both applicable limits.
    // IP limiter protects against attempts using many emails.
    await ipLimiter.consume(getIpKey(ip));

    if (validEmailForLimiter) {
      await emailIpLimiter.consume(getEmailIpKey(email, ip));
    }

    return next();
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return sendRateLimitResponse(res, error);
    }

    // Fail closed if Redis or the limiter infrastructure fails.
    console.error("Login rate limiter unavailable.");

    return res.status(503).json({
      success: false,
      message:
        "Login service is temporarily unavailable. Please try again later.",
    });
  }
};

export const clearLoginAttemptState = async (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";

  const email = normalizeEmail(req.body?.email);

  if (!email || email.length > 254) {
    return false;
  }

  // Clear only the email + IP counter.
  // Never clear the shared IP-level limiter on successful login.
  await emailIpLimiter.delete(getEmailIpKey(email, ip));

  return true;
};
