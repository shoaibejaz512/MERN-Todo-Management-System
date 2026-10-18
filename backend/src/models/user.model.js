import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { emailRegex } from "../constants.js";

const refreshTokenSchema = new mongoose.Schema(
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
  { _id: false }
);
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
      unique: true,
      match: [emailRegex, "Please enter a valid email address"],
      trim: true,
      index: true,
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
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    groupTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Todo",
      },
    ],
    singleTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SingleTodo",
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
    refreshTokens: [refreshTokenSchema],
    isVerified: {
      type: Boolean,
      default: false,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    scheduledPurgeAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);
// fields se unique:true (aur email ka duplicate index:true) hata do, phir:
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
userSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

userSchema.pre(/^find/, function (next) {
  if (!this.getOptions().withDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

export const User = mongoose.model("User", userSchema);
