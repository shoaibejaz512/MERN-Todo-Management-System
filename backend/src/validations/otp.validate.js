import { z } from "zod";

export const verifyOtpSchema = z.object({
  otp: z
    .string()
    .trim()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
  email: z.string(),
});

export const verifyEmailSchema = z
  .object({
    otp: z
      .string()
      .trim()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
  })
  .strict();