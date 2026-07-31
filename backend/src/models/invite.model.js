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
      enum: ["viewer", "editor"],
      default: "viewer",
    },

    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
    },
    isInviteAccepted:{
      type:Boolean,
      default:false,
    },
  },
  {
    timestamps: true,
  }
);

inviteSchema.index(
  {
    todo: 1,
    invitedUser: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "PENDING",
    },
  }
);

export const Invite = mongoose.model("Invite", inviteSchema);
