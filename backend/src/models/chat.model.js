import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxLength: 1000,
    },
    messageType: {
      type: String,
      enum: ["text", "system"], // "system" auto-messages ke liye, jaise "Ali joined the task"
      default: "text",
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// Fast pagination: "get latest messages for this todo"
messageSchema.index({ todo: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);