// Run as a SEPARATE process:  node workers/dataExport.worker.js
// (connect to MongoDB before starting the worker, same as your server does)
import { Worker } from "bullmq";
import { once } from "events";
import { User } from "../models/User.js";
import { SingleTodo } from "../models/SingleTodo.js";
import { Todo } from "../models/Todo.js";
import { SubTodo } from "../models/SubTodo.js";
import { Comment } from "../models/Comment.js";
import { Notification } from "../models/Notification.js";
import { TaskActivity } from "../models/TaskActivity.js";
import { DataExport } from "../models/DataExport.model.js";
import { EXPORT_QUEUE_NAME, exportConnection } from "../queues/exportQueue.js";
import cloudinary from "../config/cloudinary.js";
import { sendEmail } from "../utils/sendEmail.js"; // adapt to your email utility
import logger from "../utils/logger.js";

const EXPORT_VALIDITY_HOURS = 24;
const FORMAT_VERSION = 1;
const CURSOR_BATCH_SIZE = 500;

/* ---------- streaming helpers (constant memory, handles backpressure) ---------- */

const write = async (stream, chunk) => {
  if (!stream.write(chunk)) await once(stream, "drain");
};

const writeArray = async (stream, key, cursor, mapper) => {
  await write(stream, `"${key}":[`);
  let first = true;
  for await (const doc of cursor) {
    await write(stream, (first ? "" : ",") + JSON.stringify(mapper(doc)));
    first = false;
  }
  await write(stream, "]");
};

const cursorOf = (query) =>
  query.lean().cursor({ batchSize: CURSOR_BATCH_SIZE });

/* ---------- main job ---------- */

const buildExport = async (job) => {
  const { exportId } = job.data;

  const exportDoc = await DataExport.findById(exportId);
  if (!exportDoc || exportDoc.status === "cancelled") return;

  // Whitelist select: secrets (password, tokens, OTP fields) are never read.
  // The soft-delete hook on User also makes deleted accounts return null.
  const user = await User.findById(exportDoc.user)
    .select("name email bio profileImage.url friends createdAt")
    .lean();

  if (!user) {
    await DataExport.updateOne(
      { _id: exportId },
      { $set: { status: "cancelled", isActive: false } }
    );
    return;
  }

  await DataExport.updateOne(
    { _id: exportId },
    { $set: { status: "processing" } }
  );

  const userId = user._id;
  const publicId = `exports/${userId}/${exportId}.json`;

  // Stream straight into Cloudinary: no temp file, no big in-memory object
  let uploadStream;
  const uploadResult = new Promise((resolve, reject) => {
    uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        type: "authenticated",
        public_id: publicId,
        overwrite: true,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
  uploadResult.catch(() => {}); // surfaced below via await

  try {
    const friends = user.friends?.length
      ? await User.find({ _id: { $in: user.friends } })
          .select("name")
          .lean()
      : [];

    await write(uploadStream, "{");
    await write(
      uploadStream,
      `"meta":${JSON.stringify({
        formatVersion: FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        note: "Contains only your own data. Secrets and other users' private data are excluded.",
      })},`
    );
    await write(
      uploadStream,
      `"profile":${JSON.stringify({
        name: user.name,
        email: user.email,
        bio: user.bio,
        profileImageUrl: user.profileImage?.url ?? null,
        joinedAt: user.createdAt,
        friends: friends.map((f) => ({ name: f.name })), // names only
      })},`
    );

    // Personal tasks
    await writeArray(
      uploadStream,
      "singleTodos",
      cursorOf(
        SingleTodo.find({ createdBy: userId, isDeleted: { $ne: true } }).select(
          "title description source priority status estimatedHours deadline tags isArchived createdAt updatedAt"
        )
      ),
      (t) => t
    );
    await write(uploadStream, ",");

    // Group tasks: collect ids so sub-tasks can be scoped correctly below
    const ownedGroupIds = [];
    const memberGroupIds = [];

    await writeArray(
      uploadStream,
      "groupTodos",
      cursorOf(
        Todo.find({
          isDeleted: { $ne: true },
          $or: [{ createdBy: userId }, { "participants.user": userId }],
        }).select(
          "title description source priority status estimatedHours deadline tags isArchived createdBy participants createdAt updatedAt"
        )
      ),
      (t) => {
        const isCreator = String(t.createdBy) === String(userId);
        (isCreator ? ownedGroupIds : memberGroupIds).push(t._id);
        const me = t.participants?.find(
          (p) => String(p.user) === String(userId)
        );
        const { createdBy, participants, ...rest } = t;
        return {
          ...rest,
          isCreator,
          yourRole: me?.role ?? null,
          participantCount: participants?.length ?? 0, // no other users' ids
        };
      }
    );
    await write(uploadStream, ",");

    // Sub-tasks: all of them in tasks you created,
    // only the ones assigned to you in tasks you joined.
    await writeArray(
      uploadStream,
      "subTodos",
      cursorOf(
        SubTodo.find({
          isDeleted: { $ne: true },
          $or: [
            { groupId: { $in: ownedGroupIds } },
            { groupId: { $in: memberGroupIds }, assignedTo: userId },
          ],
        }).select(
          "title description order source priority status estimatedHours deadline tags groupId isArchived createdAt updatedAt"
        )
      ),
      (s) => s
    );
    await write(uploadStream, ",");

    await writeArray(
      uploadStream,
      "comments",
      cursorOf(
        Comment.find({ user: userId, isDeleted: { $ne: true } }).select(
          "message todo createdAt updatedAt"
        )
      ),
      (c) => c
    );
    await write(uploadStream, ",");

    await writeArray(
      uploadStream,
      "notifications",
      cursorOf(
        Notification.find({ user: userId }).select(
          "type title message todo isRead createdAt"
        ) // sender intentionally excluded
      ),
      (n) => n
    );
    await write(uploadStream, ",");

    await writeArray(
      uploadStream,
      "activity",
      cursorOf(
        TaskActivity.find({ actor: userId }).select(
          "type message todo createdAt"
        )
      ), // metadata (Mixed) excluded: may contain other users' data
      (a) => a
    );

    await write(uploadStream, "}");
    uploadStream.end();
  } catch (error) {
    uploadStream.destroy(error); // abort the partial upload
    throw error;
  }

  const uploaded = await uploadResult;

  // Only flip to "ready" if the export was not cancelled meanwhile
  // (e.g. the user deleted their account while the job was running).
  const finalized = await DataExport.findOneAndUpdate(
    { _id: exportId, status: "processing" },
    {
      $set: {
        status: "ready",
        isActive: false,
        publicId: uploaded.public_id,
        sizeBytes: uploaded.bytes ?? 0,
        completedAt: new Date(),
        expiresAt: new Date(
          Date.now() + EXPORT_VALIDITY_HOURS * 60 * 60 * 1000
        ),
      },
    },
    { new: true }
  );

  if (!finalized) {
    await cloudinary.uploader.destroy(uploaded.public_id, {
      resource_type: "raw",
      type: "authenticated",
      invalidate: true,
    });
    return;
  }

  // Email failure must not fail the export itself
  try {
    await sendEmail({
      to: user.email,
      subject: "Your data export is ready",
      html: `<p>Hi ${user.name},</p>
        <p>Your data export is ready. Log in and download it within ${EXPORT_VALIDITY_HOURS} hours:</p>
        <p><a href="${process.env.CLIENT_URL}/settings/data-export/${exportId}">Download my data</a></p>
        <p>If you did not request this, please change your password immediately.</p>`,
    });
  } catch (mailError) {
    logger.error("Export email failed", { exportId, error: mailError.message });
  }

  logger.info("Data export completed", {
    exportId,
    userId: String(userId),
    bytes: finalized.sizeBytes,
  });
};

/* ---------- worker wiring ---------- */

const worker = new Worker(EXPORT_QUEUE_NAME, buildExport, {
  connection: exportConnection,
  concurrency: 2,
});

worker.on("failed", async (job, err) => {
  logger.error("Export job attempt failed", {
    exportId: job?.data?.exportId,
    attempt: job?.attemptsMade,
    error: err.message,
  });

  // Mark as failed only after the final retry
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await DataExport.updateOne(
      { _id: job.data.exportId },
      {
        $set: {
          status: "failed",
          isActive: false,
          failureReason: err.message.slice(0, 500),
        },
      }
    );
  }
});

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);