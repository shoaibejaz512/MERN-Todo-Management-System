import { Router } from "express";
import {
  sendPasswordResetOTP,
  loginUser,
  logoutUser,
  registerUser,
  verifyPasswordResetOtp,
  forgotPassword,
  refreshAccessToken,
  updateUserProfile,
} from "../controllers/user.auth.controller.js";
import { validate } from "../middlewears/validatorsMddleware/validation.middleware.js";
import { registerSchema } from "../validations/user.validation.js";
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import { verifyOtpSchema } from "../validations/otp.validate.js";
import { otpRateLimiter } from "../middlewears/rate-limiter-flexible-middlewear/otpRateLimter.js";
import { loginRateLimit } from "../middlewears/rate-limiter-flexible-middlewear/loginRatelimiter.js";
import { registerRateLimit } from "../middlewears/rate-limiter-flexible-middlewear/registerRateLimiter.js";
import upload from "../middlewears/multer/upload.js"

const router = Router();

router
  .route("/register")
  .post(validate(registerSchema), registerRateLimit, registerUser);
router.route("/login").post(loginRateLimit, loginUser);
router.route("/logout").post(verifyJWT, logoutUser);
router
  .route("/send-password-reset-otp")
  .post(verifyJWT, otpRateLimiter, sendPasswordResetOTP);
router
  .route("/verify-password-reset-otp")
  .post(verifyJWT, validate(verifyOtpSchema), verifyPasswordResetOtp);

router.route("/forgot-password").post(verifyJWT, forgotPassword);
router.route("/refresh-token").post(verifyJWT, refreshAccessToken);
router.route("/update-profile").patch(upload.single("profileImage"),verifyJWT,updateUserProfile);

export default router;
