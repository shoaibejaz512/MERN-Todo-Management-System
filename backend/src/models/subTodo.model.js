import mongoose from "mongoose";

const subTodoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "title is required"],
      minLength: [6, "minimum length must be 6"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "title is required"],
      minLength: [20, "minimum length must be 20 chars long"],
      trim: true,
    },

    source: {
      type: String,
      enum: {
        values: ["manual", "ai"],
        message: "Source must be either manual or ai",
      },
      default: "manual",
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

    deadline: {
      type: Date,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
    },

    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
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
    status: {
      type: String,
      enum: {
        values: ["START", "COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"],
        message: "the status must be [COMPLETED,PENDING,ON_GOING,IN_COMPLETE]",
      },
    },
  },
  { timestamps: true }
);

export const SubTodo = mongoose.model("SubTodo", subTodoSchema);
