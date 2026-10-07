import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    // ----------------------------------------------------------
    // User who owns this session
    // ----------------------------------------------------------

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ----------------------------------------------------------
    // Refresh token hash
    // NEVER store the raw refresh token
    // ----------------------------------------------------------

    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
    },

    // ----------------------------------------------------------
    // Device information
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // Network information
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // Session lifecycle
    // ----------------------------------------------------------

    createdAt: {
      type: Date,
      default: Date.now,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
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

// ----------------------------------------------------------
// Useful indexes
// ----------------------------------------------------------

sessionSchema.index({
  user: 1,
  expiresAt: 1,
});

sessionSchema.index({
  user: 1,
  lastActiveAt: -1,
});

sessionSchema.index({
  refreshTokenHash: 1,
});

// ----------------------------------------------------------
// Automatically remove expired sessions
// ----------------------------------------------------------

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model("Session", sessionSchema);

export default Session;
