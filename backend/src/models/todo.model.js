import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      minlength: [6, "Minimum length must be 6 characters"],
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

    // Group specific fields
    SubTodos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubTodo",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["viewer", "contributor", "editor", "owner"],
          default: "owner",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    status: {
      type: String,
      enum: {
        values: ["START", "COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"],
        message:
          "Status must be START, COMPLETED, PENDING, ON_GOING, or IN_COMPLETE",
      },
      default: "START",
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
    taskInvitations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invite",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
todoSchema.index({ createdBy: 1 });
todoSchema.index({ "participants.user": 1 });
todoSchema.index({ status: 1 });
todoSchema.index({ isArchived: 1 });
todoSchema.index({ isDeleted: 1 });

export const Todo = mongoose.model("Todo", todoSchema);
