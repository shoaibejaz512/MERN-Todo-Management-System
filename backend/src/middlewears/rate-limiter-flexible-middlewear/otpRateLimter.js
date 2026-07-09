import OTPLimiter from "./requestOtp.limiter.js";
import ApiResponse from "../../utils/apiResponseHandler.js";

export const otpRateLimiter = async (req, res, next) => {
  try {
    // Better to use userId if the user is authenticated
    const key = req.user?.userId || req.ip;

    await OTPLimiter.consume(key);

    next();
  } catch (error) {
    return res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          "Too many OTP requests. Please try again after 5 minutes.",
          false
        )
      );
  }
};
