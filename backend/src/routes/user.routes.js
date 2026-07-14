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
  getAllUsers,
  getUserProfile,
  getCurrentUser,
  changePassword,
  deleteMyAccount,
} from "../controllers/user.auth.controller.js";
import { validate } from "../middlewears/validatorsMddleware/validation.middleware.js";
import { registerSchema } from "../validations/user.validation.js";
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import { verifyOtpSchema } from "../validations/otp.validate.js";
import { otpRateLimiter } from "../middlewears/rate-limiter-flexible-middlewear/otpRateLimter.js";
import { loginRateLimit } from "../middlewears/rate-limiter-flexible-middlewear/loginRatelimiter.js";
import { registerRateLimit } from "../middlewears/rate-limiter-flexible-middlewear/registerRateLimiter.js";
import upload from "../middlewears/multer/upload.js";

const router = Router();

router
  .route("/register")
  .post(validate(registerSchema), registerRateLimit, registerUser);
router.route("/login").post(loginRateLimit, loginUser);
router.route("/logout").post(verifyJWT, logoutUser);
router
  .route("/send-password-reset-otp")
  .post(otpRateLimiter, sendPasswordResetOTP);
router
  .route("/verify-password-reset-otp")
  .post(validate(verifyOtpSchema), verifyPasswordResetOtp);

router.route("/forgot-password").post(forgotPassword);
router.route("/change-password").patch(verifyJWT)
router.route("/refresh-token").post(refreshAccessToken);
router
  .route("/update-profile")
  .patch(verifyJWT, upload.single("profileImage"), updateUserProfile);
router.route("/").get(verifyJWT, getAllUsers);
router.route("/delete-account").delete(verifyJWT, deleteMyAccount);
router.route("/me").get(verifyJWT, getCurrentUser);
router.route("/:id").get(verifyJWT, getUserProfile);

export default router;
