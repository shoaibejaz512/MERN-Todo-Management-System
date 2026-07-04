import publicLimiter from "./publicLimiter.js";

export const publicRateLimit = async (req, res, next) => {
  try {
    await publicLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many requests.",
    });
  }
};
