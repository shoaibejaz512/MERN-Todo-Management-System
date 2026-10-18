import { User } from "../models/User.js";
import { SingleTodo } from "../models/SingleTodo.js"; // apne path/export ke hisaab se
import { deleteFromCloudinary } from "../utils/cloudinary.js"; // apne path ke hisaab se

// TODO: --------------------------CHECK THE ERROR AND GET THE PREV CODE OF THIS FILE FROM CLAUDE ----------


const users = await User.find({
  isDeleted: true,
  scheduledPurgeAt: { $lte: new Date() },
})
  .setOptions({ withDeleted: true })
  .select("_id email profileImage.publicId singleTasks groupTasks")
  .limit(BATCH_SIZE)
  .lean();

for (const user of users) {
  try {
    // 1. Related data cleanup FIRST
    await deleteFromCloudinary(user.profileImage?.publicId);

    await User.updateMany(
      { friends: user._id },
      { $pull: { friends: user._id } }
    );

    await SingleTodo.deleteMany({ _id: { $in: user.singleTasks } });

    // groupTasks: shared hain, wahi alag logic chahiye (Todo schema bhejo)

    // 2. Hard delete the user LAST
    await User.deleteOne({ _id: user._id, isDeleted: true });
    purged += 1;
  } catch (err) {
    failed += 1;
    logger.error("Failed to purge user", {
      userId: String(user._id),
      error: err.message,
    });
  }
}