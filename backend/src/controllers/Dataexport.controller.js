import mongoose from "mongoose";
import { DataExport } from "../models/DataExport.model.js";
import { exportQueue } from "../queues/exportQueue.js";
import cloudinary from "../config/cloudinary.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";

const MAX_EXPORTS_PER_DAY = 2;
const DOWNLOAD_LINK_TTL_SECONDS = 5 * 60;

/**
 * @route   POST /api/users/me/export
 * @access  Private (authMiddleware -> limiter -> re-authentication)
 * @desc    Queues a background job that builds the user's data export.
 */
export const requestDataExport = async (req, res, next) => {
  const userId = req.user.userId;

  try {
    // Daily cooldown: protects the DB from heavy repeated exports
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await DataExport.countDocuments({
      user: userId,
      createdAt: { $gte: since },
    });
    if (recent >= MAX_EXPORTS_PER_DAY) {
      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "Export limit reached. Please try again tomorrow.",
            false
          )
        );
    }

    let exportDoc;
    try {
      exportDoc = await DataExport.create({
        user: userId,
        requestedIp: req.ip,
      });
    } catch (err) {
      // Partial unique index hit: an export is already in progress
      if (err?.code === 11000) {
        return res
          .status(409)
          .json(
            new ApiResponse(
              409,
              null,
              "An export is already in progress",
              false
            )
          );
      }
      throw err;
    }

    try {
      await exportQueue.add(
        "build-export",
        { exportId: String(exportDoc._id) },
        { jobId: String(exportDoc._id) }
      );
    } catch (queueError) {
      // Do not leave the user locked out by an orphaned "active" record
      await DataExport.updateOne(
        { _id: exportDoc._id },
        {
          $set: {
            status: "failed",
            isActive: false,
            failureReason: "Queue unavailable",
          },
        }
      );
      throw queueError;
    }

    logger.info("Data export requested", {
      userId: String(userId),
      exportId: String(exportDoc._id),
      ip: req.ip,
    });

    return res
      .status(202)
      .json(
        new ApiResponse(
          202,
          { exportId: exportDoc._id, status: exportDoc.status },
          "Export started. We will email you when it is ready.",
          true
        )
      );
  } catch (error) {
    logger.error("requestDataExport failed", {
      userId: String(userId),
      error: error.message,
    });
    return next(error);
  }
};

/**
 * @route   GET /api/users/me/export/:exportId
 * @access  Private
 * @desc    Returns export status (frontend can poll this).
 */
export const getDataExportStatus = async (req, res, next) => {
  try {
    const { exportId } = req.params;
    if (!mongoose.isValidObjectId(exportId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid export id", false));
    }

    // Ownership is part of the query: users can never read others' exports
    const exportDoc = await DataExport.findOne({
      _id: exportId,
      user: req.user.userId,
    })
      .select("status expiresAt completedAt sizeBytes createdAt")
      .lean();

    if (!exportDoc) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Export not found", false));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, exportDoc, "Export status fetched", true));
  } catch (error) {
    return next(error);
  }
};

/**
 * @route   GET /api/users/me/export/:exportId/download
 * @access  Private
 * @desc    Verifies ownership + expiry, then returns a short-lived
 *          signed Cloudinary download URL (valid for 5 minutes).
 */
export const downloadDataExport = async (req, res, next) => {
  const userId = req.user.userId;

  try {
    const { exportId } = req.params;
    if (!mongoose.isValidObjectId(exportId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid export id", false));
    }

    const exportDoc = await DataExport.findOne({
      _id: exportId,
      user: userId,
    }).lean();

    if (!exportDoc) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Export not found", false));
    }

    if (exportDoc.status !== "ready" || !exportDoc.publicId) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Export is not ready yet", false));
    }

    if (!exportDoc.expiresAt || exportDoc.expiresAt <= new Date()) {
      return res
        .status(410)
        .json(
          new ApiResponse(
            410,
            null,
            "This export has expired. Please request a new one.",
            false
          )
        );
    }

    const url = cloudinary.utils.private_download_url(
      exportDoc.publicId,
      undefined,
      {
        resource_type: "raw",
        type: "authenticated",
        attachment: true,
        expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_TTL_SECONDS,
      }
    );

    // Audit trail
    logger.info("Data export downloaded", {
      userId: String(userId),
      exportId,
      ip: req.ip,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { url, expiresInSeconds: DOWNLOAD_LINK_TTL_SECONDS },
          "Download link generated",
          true
        )
      );
  } catch (error) {
    logger.error("downloadDataExport failed", {
      userId: String(userId),
      error: error.message,
    });
    return next(error);
  }
};
