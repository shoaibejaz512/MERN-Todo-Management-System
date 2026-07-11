import mongoose from "mongoose";
import { emailRegex } from "../constants.js";
import { boolean } from "zod";

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
    refreshToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
