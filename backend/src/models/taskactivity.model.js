import mongoose from "mongoose";

const taskActivitySchema = new mongoose.Schema(
  {
    // Task in which the activity occurred
    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
      required: true,
      index: true,
    },

    // User who performed the action
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optional target user (e.g. member added, removed, role changed)
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Activity type
    type: {
      type: String,
      required: true,
      enum: [
        "TASK_CREATED",
        "MEMBER_INVITED",
        "MEMBER_JOINED",
        "MEMBER_LEFT",
        "MEMBER_REMOVED",
        "ROLE_CHANGED",

        "TASK_UPDATED",
        "TITLE_UPDATED",
        "DESCRIPTION_UPDATED",
        "PRIORITY_UPDATED",
        "STATUS_UPDATED",
        "DEADLINE_UPDATED",

        "COMMENT_ADDED",
        "ATTACHMENT_ADDED",

        "TASK_COMPLETED",
        "TASK_REOPENED",
        "TASK_ARCHIVED",
        "TASK_RESTORED",
      ],
    },

    // Human readable text
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional metadata
    metadata: {
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      extra: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Latest activities first
taskActivitySchema.index({
  todo: 1,
  createdAt: -1,
});

export const TaskActivity = mongoose.model("TaskActivity", taskActivitySchema);
