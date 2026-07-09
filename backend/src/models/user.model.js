import mongoose from "mongoose";
import { emailRegex } from "../constants.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "username is required"],
      lowercase: true,
      unique: [true, "name must be unique"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "email is required"],
      lowercase: true,
      unique: [true, "email must be unique"],
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
      type: String,
      trim: true,
      default: function () {
        return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(this.name)}`;
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
    refreshToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
