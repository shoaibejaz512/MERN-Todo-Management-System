import { RateLimiterRedis } from "rate-limiter-flexible";

import { redisClient } from "../config/redis.js";
import ApiResponse from "../utils/ApiResponse.js";

export const updateEmailOtpRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "update-email-otp-limit",
  points: 3,
  duration: 900,
  blockDuration: 900,
});

export const updateEmailOtpLimiter = async (req, res, next) => {
  try {
    const { userId } = req.user;

    await updateEmailOtpRateLimiter.consume(userId);

    return next();
  } catch (error) {
    if (error instanceof Error) {
      console.error("Update email OTP rate limiter failed:", error.message);

      return res
        .status(503)
        .json(
          new ApiResponse(
            503,
            null,
            "Email verification service is temporarily unavailable",
            false
          )
        );
    }

    return res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          "Too many OTP requests. Please try again later.",
          false
        )
      );
  }
};
