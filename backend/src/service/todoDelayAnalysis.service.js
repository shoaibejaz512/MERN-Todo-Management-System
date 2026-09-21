import mongoose from "mongoose";

import { Todo } from "../models/todo.model.js";
import { SubTodo } from "../models/subTodo.model.js";
import { TaskActivity } from "../models/taskactivity.model.js";
import { analyzeDelayWithGroq } from "../service/groqService.js";

const analyzeTaskDelay = async (taskId) => {
  // =====================================================
  // 1. VALIDATE TASK ID
  // =====================================================

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error("Invalid task ID");
  }

  const now = new Date();

  // =====================================================
  // 2. FIND PARENT TASK
  // =====================================================

  const task = await Todo.findOne({
    _id: taskId,
    isDeleted: false,
    isArchived: false,
  })
    .select(
      "title description priority estimatedHours deadline tags status createdBy participants SubTodos"
    )
    .populate("participants.user", "name email profileImage")
    .lean();

  if (!task) {
    throw new Error("Task not found");
  }

  // =====================================================
  // 3. CHECK PARENT TASK DEADLINE
  // =====================================================

  const isOverdue = task.deadline && new Date(task.deadline) < now;

  if (!isOverdue) {
    return {
      delayed: false,
      taskId: task._id,
      message: "Task is not overdue",
    };
  }

  // =====================================================
  // 4. FIND SUBTASKS
  // =====================================================

  const subTaskIds = task.SubTodos || [];

  const subTasks = await SubTodo.find({
    _id: { $in: subTaskIds },
    isDeleted: false,
    isArchived: false,
  })
    .select(
      "title description assignedTo priority estimatedHours deadline tags status"
    )
    .populate("assignedTo", "name email profileImage")
    .lean();

  // =====================================================
  // 5. CALCULATE SUBTASK PROGRESS
  // =====================================================

  const totalSubTasks = subTasks.length;

  const completedSubTasks = subTasks.filter(
    (subTask) => subTask.status === "COMPLETED"
  );

  const incompleteSubTasks = subTasks.filter(
    (subTask) => subTask.status !== "COMPLETED"
  );

  const overdueSubTasks = incompleteSubTasks.filter(
    (subTask) => subTask.deadline && new Date(subTask.deadline) < now
  );

  // =====================================================
  // 6. BUILD SUBTASK CONTEXT
  // =====================================================

  const subTaskContext = subTasks.map((subTask) => ({
    id: subTask._id,

    title: subTask.title,

    status: subTask.status,

    priority: subTask.priority,

    deadline: subTask.deadline,

    estimatedHours: subTask.estimatedHours,

    assignedTo: subTask.assignedTo
      ? {
          id: subTask.assignedTo._id,
          name: subTask.assignedTo.name,
        }
      : null,

    isCompleted: subTask.status === "COMPLETED",

    isOverdue: Boolean(
      subTask.deadline &&
      new Date(subTask.deadline) < now &&
      subTask.status !== "COMPLETED"
    ),
  }));

  // =====================================================
  // 7. FIND TASK ACTIVITIES
  // =====================================================

  const activities = await TaskActivity.find({
    todo: task._id,
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .select("actor acotorName targetUser type message metadata createdAt")
    .populate("actor", "name email profileImage")
    .lean();

  // =====================================================
  // 8. BUILD ACTIVITY CONTEXT
  // =====================================================

  const activityContext = activities.map((activity) => ({
    type: activity.type,

    message: activity.message,

    actor: {
      id: activity.actor?._id || null,

      name: activity.acotorName || activity.actor?.name || "Unknown User",
    },

    createdAt: activity.createdAt,

    metadata: activity.metadata || null,
  }));

  // =====================================================
  // 9. BUILD PARTICIPANT CONTEXT
  // =====================================================

  const participantContext = (task.participants || []).map((participant) => ({
    userId: participant.user?._id || participant.user,

    name: participant.user?.name || null,

    role: participant.role,

    addedAt: participant.addedAt,
  }));

  // =====================================================
  // 10. BUILD AI CONTEXT
  // =====================================================

  const delayContext = {
    task: {
      id: task._id,

      title: task.title,

      description: task.description,

      priority: task.priority,

      estimatedHours: task.estimatedHours,

      deadline: task.deadline,

      status: task.status,

      isOverdue: true,
    },

    progress: {
      totalSubTasks,

      completedSubTasks: completedSubTasks.length,

      incompleteSubTasks: incompleteSubTasks.length,

      overdueSubTasks: overdueSubTasks.length,

      completionPercentage:
        totalSubTasks > 0
          ? Math.round((completedSubTasks.length / totalSubTasks) * 100)
          : 0,
    },

    subTasks: subTaskContext,

    participants: participantContext,

    activities: activityContext,
  };

  // =====================================================
  // 11. SEND CONTEXT TO GROQ
  // =====================================================

  const analysis = await analyzeDelayWithGroq(delayContext);

  // =====================================================
  // 12. RETURN FINAL RESULT
  // =====================================================

  return {
    delayed: true,

    taskId: task._id,

    analysis,
  };
};

export { analyzeTaskDelay };
