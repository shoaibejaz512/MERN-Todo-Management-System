import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    type: {
      type: String,
      enum: ["DIRECT", "GROUP_TASK"],
      default: "DIRECT",
    },

    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
