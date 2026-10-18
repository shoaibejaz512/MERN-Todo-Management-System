import mongoose from "mongoose";

const dataExportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "ready",
        "failed",
        "cancelled",
        "expired",
      ],
      default: "pending",
    },
    // true only while the export is pending/processing.
    // Combined with the partial unique index below it guarantees
    // ONE active export per user, even under concurrent requests.
    isActive: { type: Boolean, default: true },
    publicId: { type: String, default: null }, // Cloudinary raw asset id
    sizeBytes: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    requestedIp: { type: String, default: "" },
  },
  { timestamps: true }
);

dataExportSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
dataExportSchema.index({ status: 1, expiresAt: 1 });

export const DataExport = mongoose.model("DataExport", dataExportSchema);
