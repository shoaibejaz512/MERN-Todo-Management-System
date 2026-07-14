import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { emailRegex } from "../constants.js";


const refreshTokenSchema = new mongoose.Schema({
  refreshTokens: [
    {
      token: {
        type: String,
        required: true,
      },
      device: {
        type: String,
        default: "Unknown Device",
      },
      ip: {
        type: String,
        default: "",
      },
      userAgent: {
        type: String,
        default: "",
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
    },
  ],
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "username is required"],
      lowercase: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "email is required"],
      lowercase: true,
      unique:true,
      match: [emailRegex, "Please enter a valid email address"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minLength: [3, "minimum length must be 3"],
      trim: true,
    },
    bio: {
      type: String,
      required: true,
      trim: true,
    },
    profileImage: {
      url: {
        type: String,
        default: function () {
          return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
            this.name || "User"
          )}`;
        },
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    groupTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Todo",
      },
    ],
    singleTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Todo",
      },
    ],
    totalGroupTasks: {
      type: Number,
      default: 0,
    },
    totalSingleTasks: {
      type: Number,
      default: 0,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpires: {
      type: Date,
      default: null,
    },
    isPasswordResetOtpVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: refreshTokenSchema,
  },
  { timestamps: true }
);

userSchema.index({ name: "text", email: "text" });
userSchema.index({ createdAt: -1 });

export const User = mongoose.model("User", userSchema);
