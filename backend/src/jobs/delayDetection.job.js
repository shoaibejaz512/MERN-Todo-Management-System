import mongoose from "mongoose";
import Todo from "../models/todo.model.js";
import { analyzeTaskDelay } from "../services/todoDelayAnalysis.service.js";

const runDelayDetection = async (taskId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error("Invalid task ID");
  }

  const task = await Todo.findOne({
    _id: taskId,
    isDeleted: false,
    isArchived: false,
  })
    .select("_id deadline status createdBy participants")
    .lean();

  if (!task) {
    throw new Error("Task not found");
  }

  const isOwner = task.participants?.some(
    (participant) =>
      participant.user?.toString() === userId.toString() &&
      participant.role === "owner"
  );

  if (!isOwner) {
    const error = new Error("Only the task owner can view delay analysis");

    error.statusCode = 403;

    throw error;
  }

  if (
    !task.deadline ||
    new Date(task.deadline) >= new Date() ||
    task.status === "COMPLETED"
  ) {
    return {
      delayed: false,
      taskId: task._id,
      message: "Task is not currently delayed",
    };
  }

  const analysis = await analyzeTaskDelay(task._id);

  return analysis;
};

export { runDelayDetection };
