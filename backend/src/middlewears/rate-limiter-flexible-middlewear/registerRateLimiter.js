import registerLimiter from "./register.Limiter.js";

export const registerRateLimit = async (req, res, next) => {
  try {
    await registerLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many registration attempts.",
    });
  }
};
