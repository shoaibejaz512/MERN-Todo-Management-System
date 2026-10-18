import mongoose from "mongoose";

const cacheInvalidationAuditSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    entityType: {
      type: String,
      required: true,
      enum: ["SOLO_TASK", "SUBTASK", "GROUP_TASK", "USER", "NOTIFICATION"],
    },

    entityId: {
      type: String,
      required: true,
      maxlength: 100,
    },

    keys: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      required: true,
      enum: ["SUCCESS", "FAILED"],
    },

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    errorCode: {
      type: String,
      default: null,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Audit history ko efficiently retrieve karne ke liye.
cacheInvalidationAuditSchema.index({ createdAt: -1 });
cacheInvalidationAuditSchema.index({ status: 1, createdAt: -1 });

const CacheInvalidationAudit = mongoose.model(
  "CacheInvalidationAudit",
  cacheInvalidationAuditSchema
);

export default CacheInvalidationAudit;
