import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { Notification } from "../models/notification.model.js";
import { redisClient } from "../config/redis.config.js";
import transporter from "../config/nodemailer.config.js";
import ApiResponse from "../utils/ApiResponse.js";

// ----------------------------------------------------
// Configuration
// ----------------------------------------------------

const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

const emailChangeKey = (userId) => `security:email-change:${userId}`;

const emailChangeCooldownKey = (userId) =>
  `security:email-change:cooldown:${userId}`;

const emailChangeAttemptsKey = (userId) =>
  `security:email-change:attempts:${userId}`;

const normalizeEmail = (email) => email.trim().toLowerCase();

const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

class EmailChangeError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sendResponse = (res, statusCode, message, data = null) =>
  res.status(statusCode).json(new ApiResponse(statusCode, data, message));

// ----------------------------------------------------
// 1. Request email change and send verification OTP
// ----------------------------------------------------

export const emailChangeSecurity = async (req, res) => {
  let userId;

  try {
    userId = req.user?.userId;

    const { newEmail, currentPassword } = req.body ?? {};

    if (!userId) {
      return sendResponse(res, 401, "Authentication required");
    }

    if (
      typeof newEmail !== "string" ||
      typeof currentPassword !== "string" ||
      !newEmail.trim() ||
      !currentPassword
    ) {
      return sendResponse(
        res,
        400,
        "New email and current password are required"
      );
    }

    const normalizedEmail = normalizeEmail(newEmail);

    if (!isValidEmail(normalizedEmail)) {
      return sendResponse(res, 400, "Invalid email address");
    }

    const user = await User.findById(userId)
      .select("+password email isVerified")
      .lean();

    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    if (!user.password) {
      return sendResponse(
        res,
        400,
        "Password verification is unavailable for this account"
      );
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatches) {
      return sendResponse(res, 403, "Current password is incorrect");
    }

    if (normalizeEmail(user.email) === normalizedEmail) {
      return sendResponse(
        res,
        400,
        "New email must differ from your current email"
      );
    }

    const existingUser = await User.exists({
      email: normalizedEmail,
      _id: { $ne: userId },
    });

    if (existingUser) {
      return sendResponse(res, 409, "Email is already in use");
    }

    // Atomically acquire the resend cooldown.
    const cooldownAcquired = await redisClient.set(
      emailChangeCooldownKey(userId),
      "1",
      "EX",
      RESEND_COOLDOWN_SECONDS,
      "NX"
    );

    if (!cooldownAcquired) {
      return sendResponse(
        res,
        429,
        "Please wait before requesting another OTP"
      );
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    const pendingChange = {
      userId: String(userId),
      currentEmail: normalizeEmail(user.email),
      newEmail: normalizedEmail,
      otpHash: hashOTP(otp),
      createdAt: Date.now(),
    };

    try {
      await redisClient.set(
        emailChangeKey(userId),
        JSON.stringify(pendingChange),
        "EX",
        OTP_TTL_SECONDS
      );

      await redisClient.del(emailChangeAttemptsKey(userId));

      await transporter.sendMail({
        to: normalizedEmail,
        subject: "Verify your new FlowDo email",
        text: [
          `Your FlowDo email-change OTP is: ${otp}`,
          `This code expires in ${OTP_TTL_SECONDS / 60} minutes.`,
          "If you did not request this change, ignore this email.",
        ].join("\n"),
      });
    } catch (error) {
      await Promise.allSettled([
        redisClient.del(emailChangeKey(userId)),
        redisClient.del(emailChangeCooldownKey(userId)),
        redisClient.del(emailChangeAttemptsKey(userId)),
      ]);

      throw error;
    }

    return sendResponse(res, 200, "Verification OTP sent to the new email", {
      email: normalizedEmail,
      expiresIn: OTP_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Email change request failed:", error);

    return sendResponse(res, 500, "Unable to process email change");
  }
};

// ----------------------------------------------------
// 2. Verify OTP, change email, revoke sessions,
//    persist notification, then emit through Socket.IO
// ----------------------------------------------------

export const verifyEmailChangeOTP = async (req, res) => {
  const userId = req.user?.userId;
  const { otp } = req.body ?? {};

  if (!userId) {
    return sendResponse(res, 401, "Authentication required");
  }

  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return sendResponse(res, 400, "A valid six-digit OTP is required");
  }

  const otpKey = emailChangeKey(userId);
  const attemptsKey = emailChangeAttemptsKey(userId);

  let transactionSession;

  try {
    // Increment atomically so concurrent invalid attempts
    // cannot bypass the maximum attempt limit.
    const attempts = await redisClient.incr(attemptsKey);

    if (attempts === 1) {
      await redisClient.expire(attemptsKey, OTP_TTL_SECONDS);
    }

    if (attempts > MAX_OTP_ATTEMPTS) {
      await Promise.allSettled([
        redisClient.del(otpKey),
        redisClient.del(attemptsKey),
      ]);

      return sendResponse(
        res,
        429,
        "Too many OTP attempts. Request a new code later."
      );
    }

    const storedValue = await redisClient.get(otpKey);

    if (!storedValue) {
      return sendResponse(
        res,
        400,
        "OTP expired or no email change is pending"
      );
    }

    let pendingChange;

    try {
      pendingChange = JSON.parse(storedValue);
    } catch {
      await redisClient.del(otpKey);

      return sendResponse(res, 400, "Invalid or expired email change request");
    }

    if (
      pendingChange.userId !== String(userId) ||
      typeof pendingChange.otpHash !== "string" ||
      typeof pendingChange.newEmail !== "string" ||
      typeof pendingChange.currentEmail !== "string" ||
      !/^[a-f0-9]{64}$/i.test(pendingChange.otpHash)
    ) {
      return sendResponse(res, 400, "Invalid email change request");
    }

    const submittedHash = hashOTP(otp);

    const otpMatches = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(pendingChange.otpHash, "hex")
    );

    if (!otpMatches) {
      return sendResponse(res, 400, "Incorrect OTP");
    }

    const newEmail = normalizeEmail(pendingChange.newEmail);
    const oldEmail = normalizeEmail(pendingChange.currentEmail);

    if (
      !isValidEmail(newEmail) ||
      !isValidEmail(oldEmail) ||
      newEmail === oldEmail
    ) {
      return sendResponse(res, 400, "Invalid email change request");
    }

    // Ensure the application has a MongoDB replica set or
    // supported sharded cluster configured for transactions.
    transactionSession = await mongoose.startSession();

    let updatedUser;
    let persistedNotification;

    await transactionSession.withTransaction(
      async () => {
        // Re-read the user within the transaction.
        // The original email condition prevents replaying an
        // OTP after another request has already changed the email.
        const user = await User.findOne({
          _id: userId,
          email: oldEmail,
        })
          .select("_id email isVerified")
          .session(transactionSession);

        if (!user) {
          throw new EmailChangeError(
            409,
            "Account changed during this request. Please retry."
          );
        }

        const existingUser = await User.findOne({
          email: newEmail,
          _id: { $ne: userId },
        })
          .select("_id")
          .session(transactionSession)
          .lean();

        if (existingUser) {
          throw new EmailChangeError(409, "Email is already in use");
        }

        // Update email and invalidate stored refresh tokens.
        // The unique email index remains the final protection
        // against concurrent requests claiming the same email.
        updatedUser = await User.findOneAndUpdate(
          {
            _id: userId,
            email: oldEmail,
          },
          {
            $set: {
              email: newEmail,
              isVerified: true,
              refreshTokens: [],
            },
          },
          {
            new: true,
            runValidators: true,
            session: transactionSession,
          }
        ).select("_id email isVerified");

        if (!updatedUser) {
          throw new EmailChangeError(
            409,
            "Account changed during this request. Please retry."
          );
        }

        // Revoke server-side sessions in the same transaction.
        await Session.deleteMany(
          { user: userId },
          { session: transactionSession }
        );

        // Persist the notification atomically with the change.
        // Add EMAIL_CHANGED to your Notification type enum.
        const [notification] = await Notification.create(
          [
            {
              user: userId,
              sender: userId,
              type: "EMAIL_CHANGED",
              title: "Email address changed",
              message:
                "Your FlowDo email address was changed successfully. If this wasn't you, secure your account immediately.",
            },
          ],
          { session: transactionSession }
        );

        persistedNotification = notification.toObject();
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      }
    );

    // IMPORTANT: the database transaction has committed here.
    // Do not emit Socket.IO events inside withTransaction:
    // MongoDB may retry the transaction callback.

    // Consume the OTP after the successful database commit.
    // Failure to delete it must not report a failed email change.
    const cleanupResults = await Promise.allSettled([
      redisClient.del(otpKey),
      redisClient.del(attemptsKey),
      redisClient.del(emailChangeCooldownKey(userId)),
    ]);

    if (cleanupResults.some((result) => result.status === "rejected")) {
      console.error("Email-change Redis cleanup failed", {
        userId: String(userId),
      });
    }

    // Emit the persisted notification to the user's own room.
    // The saved notification remains available if the user is offline.
    try {
      const io = req.app.get("io");

      if (io && persistedNotification) {
        io.to(`user:${String(userId)}`).emit(
          "notification",
          persistedNotification
        );
      } else {
        console.warn(
          "Socket.IO unavailable; email-change notification remains persisted"
        );
      }
    } catch (socketError) {
      // A socket delivery failure must not undo a committed change.
      console.error("Email-change socket notification failed", {
        userId: String(userId),
        message: socketError.message,
      });
    }

    // Notify the previous email address after the commit.
    // Email delivery failure does not roll back the database.
    try {
      await transporter.sendMail({
        to: oldEmail,
        subject: "Your FlowDo email was changed",
        text: "Your FlowDo account email was changed. If you did not make this change, contact FlowDo support immediately and secure your account.",
      });
    } catch (emailError) {
      console.error("Old-email security alert failed", {
        userId: String(userId),
        message: emailError.message,
      });
    }

    // Clear this browser's cookies. These options must match
    // the options used when the cookies were originally set.
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    };

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    return sendResponse(
      res,
      200,
      "Email changed successfully. Please log in again.",
      {
        email: updatedUser.email,
        isVerified: updatedUser.isVerified,
        reLoginRequired: true,
      }
    );
  } catch (error) {
    if (error instanceof EmailChangeError) {
      return sendResponse(res, error.statusCode, error.message);
    }

    if (error?.code === 11000) {
      return sendResponse(res, 409, "Email is already in use");
    }

    console.error("Email change verification failed:", error);

    return sendResponse(res, 500, "Unable to complete email change");
  } finally {
    if (transactionSession) {
      await transactionSession.endSession();
    }
  }
};
