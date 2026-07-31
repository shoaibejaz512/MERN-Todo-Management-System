import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    // conversation: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Conversation",
    //   required: true,
    // },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["TEXT", "TASK_INVITE", "SYSTEM", "FILE", "IMAGE"],
      default: "TEXT",
    },

    content: {
      type: String,
      default: "",
    },

    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
    },

    invite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invite",
    },

    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

messageSchema.index({
  conversation: 1,
  createdAt: -1,
});

export const Message = mongoose.model("Message", messageSchema);
