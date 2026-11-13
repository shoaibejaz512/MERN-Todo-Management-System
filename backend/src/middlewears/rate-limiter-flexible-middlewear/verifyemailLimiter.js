import { RateLimiterMemory } from "rate-limiter-flexible";

const emailLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 600,
});

export default emailLimiter;

export const emailVerificationLimiter = async (req, res, next) => {
  try {
    await emailLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many registration attempts.",
    });
  }
};