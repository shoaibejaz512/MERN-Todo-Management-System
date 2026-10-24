import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
    },

    device: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown Device",
    },

    browser: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown Browser",
    },

    os: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown OS",
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

sessionSchema.index({ user: 1, expiresAt: 1 });
sessionSchema.index({ user: 1, lastActiveAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model("Session", sessionSchema);

export default Session;
