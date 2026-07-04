import loginLimiter from "./login.limiter.js";

export const loginRateLimit = async (req, res, next) => {
  try {
    await loginLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many login attempts. Try again in 5 minutes.",
    });
  }
};
