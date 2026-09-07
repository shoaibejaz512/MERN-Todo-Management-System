import { mongoose } from "mongoose";
import { SubTodo } from "../models/subTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import { TaskActivity } from "../models/taskactivity.model.js";
import { Notification } from "../models/notification.model.js";
import { io } from "../../server.js";

export const updateSubTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id, subTaskId } = req.params;

    const {
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      status,
    } = req.body;

    const userId = req.user.userId.toString();

    // =====================================================
    // STEP 1: VALIDATE IDS
    // =====================================================

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(subTaskId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task or sub-task ID", false));
    }

    let updatedSubTask = null;
    let parentTask = null;

    let createdActivities = [];
    let createdNotifications = [];

    let recipientIds = [];

    // =====================================================
    // STEP 2: TRANSACTION
    // =====================================================

    await session.withTransaction(async () => {
      // ===================================================
      // STEP 2.1: FIND PARENT TASK
      // ===================================================

      parentTask = await Todo.findOne({
        _id: id,
        createdBy: userId,
        isDeleted: false,
        isArchived: false,
        SubTodos: subTaskId,
      }).session(session);

      if (!parentTask) {
        const error = new Error(
          "Task not found or you are not authorized to update it."
        );

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 2.2: FIND SUB-TASK
      // ===================================================

      const subTask = await SubTodo.findOne({
        _id: subTaskId,
        createdBy: userId,
        isDeleted: false,
        isArchived: false,
      }).session(session);

      if (!subTask) {
        const error = new Error(
          "Sub-task not found or you are not authorized to update it."
        );

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 3: TRACK ACTIVITIES
      // ===================================================

      const activities = [];

      // ---------------------------------------------------
      // TITLE
      // ---------------------------------------------------

      if (title !== undefined && title !== subTask.title) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "TITLE_UPDATED",
          message: `Sub-task title was changed from "${subTask.title}" to "${title}".`,
          metadata: {
            subTaskId: subTask._id,
            field: "title",
            oldValue: subTask.title,
            newValue: title,
          },
        });

        subTask.title = title;
      }

      // ---------------------------------------------------
      // DESCRIPTION
      // ---------------------------------------------------

      if (description !== undefined && description !== subTask.description) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "DESCRIPTION_UPDATED",
          message: "Sub-task description was updated.",
          metadata: {
            subTaskId: subTask._id,
            field: "description",
            oldValue: subTask.description,
            newValue: description,
          },
        });

        subTask.description = description;
      }

      // ---------------------------------------------------
      // PRIORITY
      // ---------------------------------------------------

      if (priority !== undefined && priority !== subTask.priority) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "PRIORITY_UPDATED",
          message: `Sub-task priority changed from "${subTask.priority}" to "${priority}".`,
          metadata: {
            subTaskId: subTask._id,
            field: "priority",
            oldValue: subTask.priority,
            newValue: priority,
          },
        });

        subTask.priority = priority;
      }

      // ---------------------------------------------------
      // ESTIMATED HOURS
      // ---------------------------------------------------

      if (
        estimatedHours !== undefined &&
        Number(estimatedHours) !== Number(subTask.estimatedHours)
      ) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "ESTIMATED_HOURS_UPDATED",
          message: `Estimated hours changed from "${subTask.estimatedHours}" to "${estimatedHours}".`,
          metadata: {
            subTaskId: subTask._id,
            field: "estimatedHours",
            oldValue: subTask.estimatedHours,
            newValue: estimatedHours,
          },
        });

        subTask.estimatedHours = estimatedHours;
      }

      // ---------------------------------------------------
      // DEADLINE
      // ---------------------------------------------------

      if (
        deadline !== undefined &&
        String(deadline) !== String(subTask.deadline)
      ) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "DEADLINE_UPDATED",
          message: "Sub-task deadline was updated.",
          metadata: {
            subTaskId: subTask._id,
            field: "deadline",
            oldValue: subTask.deadline,
            newValue: deadline,
          },
        });

        subTask.deadline = deadline;
      }

      // ---------------------------------------------------
      // TAGS
      // ---------------------------------------------------

      if (
        tags !== undefined &&
        JSON.stringify(tags) !== JSON.stringify(subTask.tags)
      ) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "TAGS_UPDATED",
          message: "Sub-task tags were updated.",
          metadata: {
            subTaskId: subTask._id,
            field: "tags",
            oldValue: subTask.tags,
            newValue: tags,
          },
        });

        subTask.tags = tags;
      }

      // ---------------------------------------------------
      // STATUS
      // ---------------------------------------------------

      if (status !== undefined && status !== subTask.status) {
        activities.push({
          todo: parentTask._id,
          actor: userId,
          type: "STATUS_UPDATED",
          message: `Sub-task status changed from "${subTask.status}" to "${status}".`,
          metadata: {
            subTaskId: subTask._id,
            field: "status",
            oldValue: subTask.status,
            newValue: status,
          },
        });

        subTask.status = status;
      }

      // ===================================================
      // STEP 4: NO CHANGES
      // ===================================================

      if (activities.length === 0) {
        const error = new Error("No changes were made to the sub-task.");

        error.statusCode = 400;
        throw error;
      }

      // ===================================================
      // STEP 5: SAVE SUB-TASK
      // ===================================================

      updatedSubTask = await subTask.save({
        session,
      });

      // ===================================================
      // STEP 6: CREATE ACTIVITIES
      // ===================================================

      createdActivities = await TaskActivity.insertMany(activities, {
        session,
      });

      // ===================================================
      // STEP 7: FIND NOTIFICATION RECIPIENTS
      // ===================================================

      recipientIds = [
        ...new Set(
          (parentTask.participants || [])
            .map((participant) => participant.user?.toString())
            .filter(
              (participantId) => participantId && participantId !== userId
            )
        ),
      ];

      // ===================================================
      // STEP 8: CREATE NOTIFICATIONS FROM ACTIVITIES
      // ===================================================

      if (recipientIds.length > 0) {
        const notifications = [];

        for (const recipientId of recipientIds) {
          for (const activity of createdActivities) {
            notifications.push({
              user: recipientId,
              sender: userId,

              type: activity.type,

              title: "Sub-task Updated",

              message: activity.message,

              todo: parentTask._id,

              // Connect notification with activity
              activity: activity._id,

              metadata: activity.metadata,

              isRead: false,
            });
          }
        }

        createdNotifications = await Notification.insertMany(notifications, {
          session,
        });
      }
    });

    // =====================================================
    // STEP 9: REAL-TIME NOTIFICATIONS
    // =====================================================

    if (recipientIds.length > 0) {
      recipientIds.forEach((recipientId) => {
        const userNotifications = createdNotifications.filter(
          (notification) => notification.user.toString() === recipientId
        );

        io.to(`user:${recipientId}`).emit("notification", {
          notifications: userNotifications,
        });
      });
    }

    // ==========================================
    // STEP 7: Emit Activities to Task Room
    // ==========================================

    for (const activity of createdActivities) {
      io.to(`task:${parentTask._id}`).emit("task:activity", activity);
    }

    // =====================================================
    // STEP 10: RESPONSE
    // =====================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subTask: updatedSubTask,
          activities: createdActivities,
        },
        "Sub-task updated successfully",
        true
      )
    );
  } catch (error) {
    console.error("Update sub-task error:", error);

    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Failed to update sub-task",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};
const updateSubTaskStatus = async (req, res) => {};
const deleteSubTask = async (req, res) => {};

export { updateSubTask, updateSubTaskStatus, deleteSubTask };
