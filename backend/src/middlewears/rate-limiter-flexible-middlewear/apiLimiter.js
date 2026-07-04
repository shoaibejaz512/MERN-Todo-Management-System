import { apiRateLimiter } from "./ratelimiter.js";

export const apiLimiter = async (req, res, next) => {
  try {
    await apiRateLimiter.consume(req.ip);

    next();
  } catch (err) {
    res.set("Retry-After", Math.ceil(err.msBeforeNext / 1000));

    return res.status(429).json({
      success: false,
      message: "Too many requests. Try again later.",
      retryAfter: Math.ceil(err.msBeforeNext / 1000),
    });
  }
};
