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
    },
    status: {
      type: String,
      enum: {
        values: ["START", "COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"],
        message:
          "the status must be [COMPLETED,START,PENDING,ON_GOING,IN_COMPLETE]",
      },
    },
  },
  { timestamps: true }
);

export const Todo = mongoose.model("Todo", todoSchema);
