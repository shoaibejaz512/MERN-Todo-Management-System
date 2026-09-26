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
      "title description priority estimatedHours deadline tags status createdBy participants SubTodos delayAnalysis"
    )
    .populate("participants.user", "name email profileImage")
    .lean();

  if (!task) {
    throw new Error("Task not found");
  }

  // =====================================================
  // 3. CHECK CURRENT TASK DELAY STATUS
  // =====================================================

  const isOverdue = task.deadline && new Date(task.deadline) < now;

  if (!isOverdue || task.status === "COMPLETED") {
    return {
      delayed: false,
      taskId: task._id,
      message: "Task is not overdue",
      cached: false,
    };
  }

  // =====================================================
  // 4. CHECK CACHED AI ANALYSIS
  // =====================================================

  if (task.delayAnalysis?.analyzedAt && task.delayAnalysis?.delayed === true) {
    return {
      delayed: true,
      taskId: task._id,
      analysis: task.delayAnalysis,
      cached: true,
    };
  }

  // =====================================================
  // 5. FIND SUBTASKS
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
  // 6. CALCULATE SUBTASK PROGRESS
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
  // 7. BUILD SUBTASK CONTEXT
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
  // 8. FIND TASK ACTIVITIES
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
  // 9. BUILD ACTIVITY CONTEXT
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
  // 10. BUILD PARTICIPANT CONTEXT
  // =====================================================

  const participantContext = (task.participants || []).map((participant) => ({
    userId: participant.user?._id || participant.user,

    name: participant.user?.name || null,

    role: participant.role,

    addedAt: participant.addedAt,
  }));

  // =====================================================
  // 11. BUILD AI CONTEXT
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
  // 12. SEND CONTEXT TO GROQ
  // =====================================================

  const analysis = await analyzeDelayWithGroq(delayContext);

  // =====================================================
  // 13. NORMALIZE AI RESPONSE
  // =====================================================

  const normalizedAnalysis = {
    delayed: Boolean(analysis.delayed),

    summary:
      typeof analysis.summary === "string" ? analysis.summary.trim() : "",

    reasons: Array.isArray(analysis.reasons)
      ? analysis.reasons
          .filter(
            (reason) =>
              reason &&
              typeof reason.type === "string" &&
              typeof reason.description === "string"
          )
          .map((reason) => ({
            type: reason.type.trim(),
            description: reason.description.trim(),
          }))
      : [],

    affectedSubtasks: Array.isArray(analysis.affectedSubtasks)
      ? analysis.affectedSubtasks
          .filter(
            (subTask) =>
              subTask && subTask.id && typeof subTask.title === "string"
          )
          .map((subTask) => ({
            id: subTask.id,
            title: subTask.title.trim(),
          }))
      : [],
  };

  // =====================================================
  // 14. SAVE AI ANALYSIS TO TODO
  // =====================================================

  await Todo.findByIdAndUpdate(
    taskId,
    {
      $set: {
        delayAnalysis: {
          analyzedAt: new Date(),

          delayed: normalizedAnalysis.delayed,

          summary: normalizedAnalysis.summary,

          reasons: normalizedAnalysis.reasons,

          affectedSubtasks: normalizedAnalysis.affectedSubtasks,
        },
      },
    },
    {
      new: false,
      runValidators: true,
    }
  );

  // =====================================================
  // 15. RETURN FINAL RESULT
  // =====================================================

  return {
    delayed: normalizedAnalysis.delayed,

    taskId: task._id,

    analysis: normalizedAnalysis,

    cached: false,
  };
};

export { analyzeTaskDelay };
