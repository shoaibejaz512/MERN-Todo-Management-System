import mongoose from "mongoose";
import { emailRegex } from "../constants.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "username is required"],
      lowercase: true,
      unique: [true, "username must be lowercase"],
      trim:true
    },
    email: {
      type: String,
      required: [true, "email is required"],
      lowercase: true,
      unique: [true, "email must be unique"],
      match: [emailRegex, "Please enter a valid email address"],
      trim:true
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minLength: [3, "minimum length must be 3"],
      maxLength: [30, "maximum length must be 30"],
      trim:true,
    },
    profileImage:{
        type:String,
        trim:true,
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
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
