import { DataExport } from "../models/Dataexport.model.js";
import cloudinary from "../config/cloudinary.js";
import logger from "../utils/logger.js";

// NOTE: your existing deleteFromCloudinary helper does not pass resource_type,
// so it cannot delete these raw + authenticated files. Use this instead.
const destroyExportFile = (publicId) =>
  cloudinary.uploader.destroy(publicId, {
    resource_type: "raw",
    type: "authenticated",
    invalidate: true,
  });

/**
 * Call from your existing daily purge cron: removes expired export files.
 */
export const purgeExpiredExports = async (batchSize = 100) => {
  const expired = await DataExport.find({
    status: "ready",
    expiresAt: { $lte: new Date() },
  })
    .select("_id publicId")
    .limit(batchSize)
    .lean();

  for (const exp of expired) {
    try {
      if (exp.publicId) await destroyExportFile(exp.publicId);
      await DataExport.updateOne(
        { _id: exp._id },
        { $set: { status: "expired", publicId: null } }
      );
    } catch (err) {
      logger.error("Failed to purge expired export", {
        exportId: String(exp._id),
        error: err.message,
      });
    }
  }
  return expired.length;
};

/**
 * Call when an account is deleted / permanently purged:
 * cancels running exports and removes every stored file for that user.
 */
export const deleteAllExportsForUser = async (userId) => {
  await DataExport.updateMany(
    { user: userId, isActive: true },
    { $set: { status: "cancelled", isActive: false } }
  );

  const exports = await DataExport.find({
    user: userId,
    publicId: { $ne: null },
  })
    .select("_id publicId")
    .lean();

  for (const exp of exports) {
    try {
      await destroyExportFile(exp.publicId);
    } catch (err) {
      logger.error("Failed to delete user export file", {
        exportId: String(exp._id),
        error: err.message,
      });
    }
  }

  // Keep DB records on soft delete (audit); remove them only in the purge job:
  // await DataExport.deleteMany({ user: userId });
};
