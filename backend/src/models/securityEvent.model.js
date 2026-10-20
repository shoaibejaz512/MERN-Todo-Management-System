import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const SECURITY_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FAILED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "EMAIL_VERIFICATION_SUCCEEDED",
  "EMAIL_CHANGED",
  "EMAIL_CHANGE_FAILED",
  "SESSION_CREATED",
  "SESSION_REVOKED",
  "ALL_SESSIONS_REVOKED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_UNLOCKED",
  "ACCOUNT_DELETED",
  "SUSPICIOUS_ACTIVITY",
  "ACCESS_DENIED",
];

const SECURITY_EVENT_OUTCOMES = ["SUCCESS", "FAILURE", "BLOCKED"];

const SECURITY_EVENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const SECURITY_EVENT_SOURCES = ["AUTH", "SESSION", "ACCOUNT", "SECURITY"];

const RETENTION_DAYS = Number(process.env.SECURITY_EVENT_RETENTION_DAYS || 180);

if (!Number.isInteger(RETENTION_DAYS) || RETENTION_DAYS < 1) {
  throw new Error("SECURITY_EVENT_RETENTION_DAYS must be a positive integer");
}

const metadataSchema = new Schema(
  {
    reason: {
      type: String,
      maxlength: 200,
    },

    authMethod: {
      type: String,
      enum: ["PASSWORD", "OTP", "GOOGLE", "OTHER"],
    },

    failureCode: {
      type: String,
      maxlength: 80,
    },

    changedFields: {
      type: [String],
      default: undefined,
      validate: {
        validator: (fields) =>
          !fields ||
          (fields.length <= 20 &&
            fields.every(
              (field) => typeof field === "string" && field.length <= 64
            )),
        message: "Invalid changedFields metadata",
      },
    },
  },
  {
    _id: false,
    strict: "throw",
  }
);

const securityEventSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },

    eventType: {
      type: String,
      enum: {
        values: SECURITY_EVENT_TYPES,
        message: "Invalid security event type",
      },
      required: true,
      immutable: true,
    },

    source: {
      type: String,
      enum: SECURITY_EVENT_SOURCES,
      required: true,
      immutable: true,
    },

    outcome: {
      type: String,
      enum: SECURITY_EVENT_OUTCOMES,
      required: true,
      immutable: true,
    },

    severity: {
      type: String,
      enum: SECURITY_EVENT_SEVERITIES,
      default: "LOW",
      required: true,
      immutable: true,
    },

    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      default: null,
      immutable: true,
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      immutable: true,
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: null,
      immutable: true,
    },

    requestId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
      immutable: true,
    },

    metadata: {
      type: metadataSchema,
      default: () => ({}),
      immutable: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    strict: "throw",
    minimize: false,
  }
);

// Fetch a user's newest security events.
securityEventSchema.index({
  userId: 1,
  createdAt: -1,
});

// Filter events by type and date.
securityEventSchema.index({
  eventType: 1,
  createdAt: -1,
});

// MongoDB automatically expires records after expiresAt.
securityEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SecurityEvent =
  models.SecurityEvent || model("SecurityEvent", securityEventSchema);

export default SecurityEvent;
