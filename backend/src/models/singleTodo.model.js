import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      minlength: [6, "Minimum length must be 6 characters"],
      maxlength: [100, "Maximum length must be 100 characters"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      minlength: [20, "Minimum length must be 20 characters"],
      trim: true,
    },
    source: {
      type: String,
      enum: {
        values: ["manual", "ai"],
        message: "Source must be either manual or ai",
      },
    },
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high"],
        message: "Priority must be low, medium, or high",
      },
      default: "medium",
    },

    estimatedHours: {
      type: Number,
      min: [0, "Estimated hours cannot be negative"],
      default: 0,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
    deadline: {
      type: Date,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: {
        values: ["START", "COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"],
        message:
          "Status must be START, COMPLETED, PENDING, ON_GOING, or IN_COMPLETE",
      },
      default: "START",
    },
  },
  {
    timestamps: true,
  }
);

export const SingleTodo = mongoose.model("SingleTodo", todoSchema);
