import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "task title is required"],
      minLength: [6, "minimum length must be 6"],
      maxLength: [30, "maximum length must be 30"],
      trim: true,
    },
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
          enum: ["owner", "collaborator"],
          default: "collaborator",
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
          "the status must be [COMPLETED,START,PENDING,ON_GOING,IN_COMPLETE]",
      },
      default: "START",
    },
  },
  { timestamps: true }
);

// Fast lookup: "give me all todos this user is part of"
todoSchema.index({ "participants.user": 1 });
todoSchema.index({ createdBy: 1 });

export const Todo = mongoose.model("Todo", todoSchema);
