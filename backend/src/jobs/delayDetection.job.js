import mongoose from "mongoose";
import Todo from "../models/todo.model.js";
import { analyzeTaskDelay } from "../services/todoDelayAnalysis.service.js";

const runDelayDetection = async (taskId) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error("Invalid task ID");
  }

  // =====================================================
  // 1. FIND SPECIFIC OVERDUE TASK
  // =====================================================

  const task = await Todo.findOne({
    _id: taskId,
    deadline: { $lt: new Date() },
    status: { $ne: "COMPLETED" },
    isDeleted: false,
    isArchived: false,
  }).lean();

  if (!task) {
    return {
      delayed: false,
      message: "Task is not overdue or does not exist",
    };
  }

  // =====================================================
  // 2. SEND TASK TO DELAY SERVICE
  // =====================================================

  const analysis = await analyzeTaskDelay(task._id);

  return analysis;
};

export { runDelayDetection };
