// models/invite.model.js
import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema(
  {
    todo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invitedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["collaborator"],
      default: "collaborator",
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

// Same task ke liye same banda ko dobara pending invite na ho
inviteSchema.index({ todo: 1, invitedUser: 1 }, { unique: true });

export const Invite = mongoose.model("Invite", inviteSchema);
