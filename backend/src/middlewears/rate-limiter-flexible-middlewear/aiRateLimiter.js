import aiLimiter from "./aiLimter.js";
export const aiRateLimit = async (req, res, next) => {
  try {
    await aiLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many ai prompt attempts. Try again in 5 minutes.",
    });
  }
};
