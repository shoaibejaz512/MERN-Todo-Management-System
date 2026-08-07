import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    type: {
      type: String,
      enum: [
        "TASK_COMMENTED",
        "TASK_RESTORE",
        "TASK_UPDATED",
        "TASK_CREATED",
        "TASK_INVITE",
        "TASK_ACCEPTED",
        "TASK_REJECTED",
        "TASK_REMOVED",
        "TASK_ROLE_CHANGED",
        "TASK_COMPLETED",
        "MENTION",
      ],
    },

    title: String,

    message: String,

    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
    },

    invite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invite",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = mongoose.model("Notification", notificationSchema);
