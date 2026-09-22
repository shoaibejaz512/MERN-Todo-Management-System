import { mongoose } from "mongoose";
import { SubTodo } from "../models/subTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import { TaskActivity } from "../models/taskactivity.model.js";
import { Notification } from "../models/notification.model.js";
import { io } from "../../server.js";
import { Todo } from "../models/todo.model.js";
import { User } from "../models/user.model.js";

const updateSubTask = async (req, res) => {
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
      // STEP 2.3: FIND USER WHO UPDATED THE SUB-TASK
      // ===================================================

      const actorUser = await User.findById(userId)
        .select("name")
        .session(session);

      if (!actorUser) {
        const error = new Error("User not found.");

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 3: TRACK ACTIVITIES
      // =====================================================

      const activities = [];

      // ---------------------------------------------------
      // TITLE
      // ---------------------------------------------------

      if (title !== undefined && title !== subTask.title) {
        activities.push({
          todo: parentTask._id,

          // User who performed the action
          actor: userId,

          // Snapshot of user's name
          actorName: actorUser.name,

          type: "TITLE_UPDATED",

          message: `${actorUser.name} changed the sub-task title from "${subTask.title}" to "${title}".`,

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
          actorName: actorUser.name,

          type: "DESCRIPTION_UPDATED",

          message: `${actorUser.name} updated the sub-task description.`,

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
          actorName: actorUser.name,

          type: "PRIORITY_UPDATED",

          message: `${actorUser.name} changed the sub-task priority from "${subTask.priority}" to "${priority}".`,

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
          actorName: actorUser.name,

          type: "ESTIMATED_HOURS_UPDATED",

          message: `${actorUser.name} changed estimated hours from "${subTask.estimatedHours}" to "${estimatedHours}".`,

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
          actorName: actorUser.name,

          type: "DEADLINE_UPDATED",

          message: `${actorUser.name} updated the sub-task deadline.`,

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
          actorName: actorUser.name,

          type: "TAGS_UPDATED",

          message: `${actorUser.name} updated the sub-task tags.`,

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
          actorName: actorUser.name,

          type: "STATUS_UPDATED",

          message: `${actorUser.name} changed the sub-task status from "${subTask.status}" to "${status}".`,

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
      // STEP 8: CREATE NOTIFICATIONS
      // ===================================================

      if (recipientIds.length > 0) {
        const notifications = [];

        for (const recipientId of recipientIds) {
          for (const activity of createdActivities) {
            notifications.push({
              user: recipientId,

              // Person who performed the action
              sender: userId,

              type: activity.type,

              title: "Sub-task Updated",

              message: activity.message,

              todo: parentTask._id,

              // Connect notification with activity
              activity: activity._id,

              metadata: {
                ...activity.metadata,

                // Also keep actor information
                actor: userId,
                actorName: actorUser.name,
              },

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

    // =====================================================
    // STEP 10: EMIT ACTIVITIES TO TASK ROOM
    // =====================================================

    for (const activity of createdActivities) {
      io.to(`task:${parentTask._id}`).emit("task:activity", activity);
    }

    // =====================================================
    // STEP 11: RESPONSE
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

const updateSubTaskStatus = async (req, res) => {
  // =====================================================
  // START SESSION
  // =====================================================

  const session = await mongoose.startSession();

  try {
    const { id, subTaskId } = req.params;
    const { status } = req.body;

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

    // =====================================================
    // VARIABLES
    // =====================================================

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
      // STEP 2.3: FIND ACTOR / USER
      // ===================================================

      const actorUser = await User.findById(userId)
        .select("name")
        .session(session);

      if (!actorUser) {
        const error = new Error("User not found.");

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 3: VALIDATE STATUS
      // =====================================================

      if (status === undefined) {
        const error = new Error("Status is required.");

        error.statusCode = 400;
        throw error;
      }

      // ===================================================
      // STEP 4: CHECK STATUS CHANGE
      // ===================================================

      if (status === subTask.status) {
        const error = new Error("No changes were made to the sub-task.");

        error.statusCode = 400;
        throw error;
      }

      // ===================================================
      // STEP 5: CREATE ACTIVITY
      // ===================================================

      const activity = new TaskActivity({
        todo: parentTask._id,

        // User who performed the action
        actor: userId,

        // Historical snapshot of user's name
        actorName: actorUser.name,

        type: "STATUS_UPDATED",

        message: `${actorUser.name} changed the sub-task status from "${subTask.status}" to "${status}".`,

        metadata: {
          subTaskId: subTask._id,
          field: "status",
          oldValue: subTask.status,
          newValue: status,
        },
      });

      // IMPORTANT:
      // Save activity using same transaction session
      await activity.save({ session });

      // Store activity for response + socket
      createdActivities.push(activity);

      // ===================================================
      // STEP 6: UPDATE SUB-TASK STATUS
      // ===================================================

      subTask.status = status;

      updatedSubTask = await subTask.save({
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
      // STEP 8: CREATE NOTIFICATIONS
      // ===================================================

      if (recipientIds.length > 0) {
        const notifications = [];

        for (const recipientId of recipientIds) {
          for (const activity of createdActivities) {
            notifications.push({
              // Person receiving notification
              user: recipientId,

              // Person who performed action
              sender: userId,

              type: activity.type,

              title: "Sub-task Status Updated",

              message: activity.message,

              todo: parentTask._id,

              // Connect notification to activity
              activity: activity._id,

              metadata: {
                ...activity.metadata,

                // Keep actor information
                actor: userId,
                actorName: actorUser.name,
              },

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

    // =====================================================
    // STEP 10: EMIT ACTIVITY TO TASK ROOM
    // =====================================================

    for (const activity of createdActivities) {
      io.to(`task:${parentTask._id}`).emit("task:activity", activity);
    }

    // =====================================================
    // STEP 11: RESPONSE
    // =====================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subTask: updatedSubTask,
          activities: createdActivities,
        },
        "Sub-task status has been changed successfully",
        true
      )
    );
  } catch (error) {
    console.error("Update sub-task status error:", error);

    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Failed to update sub-task status",
          false
        )
      );
  } finally {
    // =====================================================
    // END SESSION
    // =====================================================

    await session.endSession();
  }
};

const deleteSubTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { taskId, subTaskId } = req.params;

    const userId = req.user.userId.toString();

    // ===================================================
    // STEP 1: VALIDATE IDS
    // ===================================================

    if (
      !mongoose.Types.ObjectId.isValid(taskId) ||
      !mongoose.Types.ObjectId.isValid(subTaskId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task or sub-task ID", false));
    }

    let updatedTask;
    let activity;
    let createdNotifications = [];
    let recipientIds = [];

    await session.withTransaction(async () => {
      // ===================================================
      // STEP 2: FIND PARENT TASK
      // ===================================================

      const parentTask = await Todo.findOne({
        _id: taskId,
        isDeleted: false,
        isArchived: false,
        createdBy: userId,
        SubTodos: subTaskId,
      }).session(session);

      if (!parentTask) {
        const error = new Error(
          "Task not found or you are not authorized to delete this sub-task."
        );

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 3: FIND SUB-TASK
      // ===================================================

      const subTask = await SubTodo.findOne({
        _id: subTaskId,
        createdBy: userId,
        isDeleted: false,
        isArchived: false,
      }).session(session);

      if (!subTask) {
        const error = new Error(
          "Sub-task not found or you are not authorized to delete it."
        );

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 4: GET ACTOR / USER NAME
      // ===================================================

      const actor = await User.findById(userId).select("name").session(session);

      if (!actor) {
        const error = new Error("User not found.");

        error.statusCode = 404;
        throw error;
      }

      // ===================================================
      // STEP 5: REMOVE SUB-TASK ID FROM PARENT TASK
      // ===================================================

      updatedTask = await Todo.findOneAndUpdate(
        {
          _id: taskId,
          isDeleted: false,
          isArchived: false,
          createdBy: userId,
          SubTodos: subTaskId,
        },
        {
          $pull: {
            SubTodos: subTaskId,
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!updatedTask) {
        const error = new Error("Sub-task could not be removed.");

        error.statusCode = 400;
        throw error;
      }

      // ===================================================
      // STEP 6: SOFT DELETE SUB-TASK
      // ===================================================

      subTask.isDeleted = true;

      await subTask.save({
        session,
      });

      // ===================================================
      // STEP 7: GET COLLABORATORS
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
      // STEP 8: CREATE ACTIVITY
      // ===================================================

      const activities = await TaskActivity.create(
        [
          {
            todo: taskId,

            // User who performed the action
            actor: userId,

            // Historical snapshot of user's name
            actorName: actor.name,

            type: "TASK_UPDATED",

            message: `${actor.name} deleted sub-task "${subTask.title}"`,

            metadata: {
              extra: {
                subTaskId: subTask._id,
                subTaskTitle: subTask.title,
                action: "SUBTASK_DELETED",
              },
            },
          },
        ],
        {
          session,
        }
      );

      activity = activities[0];

      // ===================================================
      // STEP 9: CREATE NOTIFICATIONS
      // ===================================================

      if (recipientIds.length > 0) {
        const notifications = recipientIds.map((recipientId) => ({
          user: recipientId,

          sender: userId,

          type: "TASK_UPDATED",

          title: "Sub-task Deleted",

          message: `${actor.name} deleted sub-task "${subTask.title}"`,

          todo: parentTask._id,

          activity: activity._id,

          metadata: {
            ...activity.metadata,
            actor: userId,
            actorName: actor.name,
          },

          isRead: false,
        }));

        createdNotifications = await Notification.insertMany(notifications, {
          session,
        });
      }
    });

    // ===================================================
    // STEP 10: REAL-TIME NOTIFICATIONS
    // ===================================================

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

    // ===================================================
    // STEP 11: REAL-TIME ACTIVITY
    // ===================================================

    io.to(`task:${taskId}`).emit("task:activity", activity);

    // ===================================================
    // STEP 12: RESPONSE
    // ===================================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedTask, "Sub-task deleted successfully", true)
      );
  } catch (error) {
    console.error("Delete SubTask Error:", error);

    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Something went wrong",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};

const restoreSubTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id: subTaskId, taskId } = req.params;
    const userId = req.user.userId.toString();

    // =====================================================
    // STEP 1: VALIDATE IDS
    // =====================================================

    if (
      !mongoose.Types.ObjectId.isValid(taskId) ||
      !mongoose.Types.ObjectId.isValid(subTaskId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task or sub-task ID", false));
    }

    let parentTask;
    let restoredSubTask;
    let recipientIds = [];
    let notifications = [];
    let activity = null;

    // =====================================================
    // STEP 2: TRANSACTION
    // =====================================================

    await session.withTransaction(async () => {
      // ---------------------------------------------------
      // Find parent task + verify ownership + relationship
      // ---------------------------------------------------

      parentTask = await Todo.findOne({
        _id: taskId,
        createdBy: userId,
        isDeleted: false,
        isArchived: false,
        SubTodos: subTaskId,
      }).session(session);

      if (!parentTask) {
        const error = new Error(
          "Task not found or you are not authorized to restore this sub-task."
        );

        error.statusCode = 404;
        throw error;
      }

      // ---------------------------------------------------
      // Find deleted sub-task
      // ---------------------------------------------------

      restoredSubTask = await SubTodo.findOne({
        _id: subTaskId,
        createdBy: userId,
        isDeleted: true,
      }).session(session);

      if (!restoredSubTask) {
        const error = new Error(
          "Deleted sub-task not found or you are not authorized to restore it."
        );

        error.statusCode = 404;
        throw error;
      }

      // ---------------------------------------------------
      // Get actor information
      // ---------------------------------------------------

      const actor = await User.findById(userId).select("name").session(session);

      if (!actor) {
        const error = new Error("User not found.");

        error.statusCode = 404;
        throw error;
      }

      // ---------------------------------------------------
      // Restore sub-task
      // ---------------------------------------------------

      restoredSubTask.isDeleted = false;

      await restoredSubTask.save({ session });

      // ===================================================
      // STEP 3: FIND COLLABORATORS
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
      // STEP 4: CREATE NOTIFICATIONS
      // ===================================================

      if (recipientIds.length > 0) {
        notifications = recipientIds.map((recipientId) => ({
          user: recipientId,
          sender: userId,
          type: "TASK_RESTORED",
          title: "Sub-task Restored",
          message: `${actor.name} restored the sub-task "${restoredSubTask.title}"`,
          todo: taskId,
        }));

        await Notification.insertMany(notifications, {
          session,
        });
      }

      // ===================================================
      // STEP 5: CREATE ACTIVITY
      // ===================================================

      [activity] = await TaskActivity.create(
        [
          {
            todo: taskId,
            actor: userId,
            actorName: actor.name,
            type: "TASK_RESTORED",
            message: `${actor.name} restored the sub-task "${restoredSubTask.title}"`,
          },
        ],
        { session }
      );

      if (!activity) {
        const error = new Error("Failed to create task activity.");

        error.statusCode = 500;
        throw error;
      }
    });

    // =====================================================
    // STEP 6: SOCKET EVENTS
    // =====================================================

    // Notify collaborators
    recipientIds.forEach((recipientId) => {
      const userNotifications = notifications.filter(
        (notification) => notification.user.toString() === recipientId
      );

      if (userNotifications.length > 0) {
        io.to(`user:${recipientId}`).emit("notification", {
          notifications: userNotifications,
        });
      }
    });

    // Notify everyone inside task room
    io.to(`task:${taskId}`).emit("task:activity", activity);

    // Optional: realtime sub-task update
    io.to(`task:${taskId}`).emit("subtask:restored", {
      taskId,
      subTask: restoredSubTask,
    });

    // =====================================================
    // STEP 7: RESPONSE
    // =====================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          taskId,
          subTask: restoredSubTask,
          activity,
        },
        "Sub-task restored successfully.",
        true
      )
    );
  } catch (error) {
    console.error("restoreSubTask error:", error);

    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Failed to restore sub-task.",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};
const assignSubTask = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, subTaskId, taskId } = req.params;
    const reqUserId = req.user.userId.toString();

    if (
      !mongoose.Types.ObjectId.isValid(taskId) ||
      !mongoose.Types.ObjectId.isValid(subTaskId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task or sub-task ID", false));
    }

    let subTask;
    let assignUser;
    let ownerUser;
    let task;
    let notifications = [];
    let uniqueRecients = [];
    let activity;

    await session.withTransaction(async () => {
      task = await Todo.findOne({
        _id: taskId,
        isDeleted: false,
        isArchived: false,
        createdBy: reqUserId,
        SubTodos: subTaskId,
      }).session(session);

      if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
      }

      subTask = await SubTodo.findOne({
        _id: subTaskId,
        isDeleted: false,
        createdBy: reqUserId,
      }).session(session);

      if (!subTask) {
        const error = new Error("SubTask not found");
        error.statusCode = 404;
        throw error;
      }

      assignUser = await User.findById(userId).select(
        "name profileImage friends"
      );
      if (!assignUser) {
        const error = new Error("assignUser not found");
        error.statusCode = 404;
        throw error;
      }

      ownerUser = await User.findById(reqUserId).select(
        "name profileImage friends"
      );
      if (!ownerUser) {
        const error = new Error("ownerUser not found");
        error.statusCode = 404;
        throw error;
      }

      //check first the user is in frined list of requested user
      const isFriend = (ownerUser.friends || []).some(
        (friend) => friend.user.toString() === userId
      );

      if (!isFriend) {
        const error = new Error("The user is not in freind list");
        error.statusCode = 404;
        throw error;
      }

      //check the user is participents fo this task
      let isParticipent = task.participants.find(
        (p) => p.user.toString() === userId.toString()
      );
      if (!isParticipent) {
        const error = new Error("The user is not participent of task");
        error.statusCode = 404;
        throw error;
      }

      //lets add the user id in subtask model assignTo field
      subTask.assignedTo = userId;
      await subTask.save({ session });

      uniqueRecients = [
        ...new Set(
          (task.participants || [])
            .map((participant) => participant.user?.toString())
            .filter(
              (participantId) => participantId && participantId !== userId
            )
        ),
      ];

      //createnotifications
      if (uniqueRecients.length > 0) {
        notifications = uniqueRecients.map((user) => ({
          user: user,
          sender: reqUserId,
          type: "TASK_ASSIGN",
          message: `${ownerUser.name} assigned subtask ${subTask.title} to ${assignUser.name}`,
        }));
        await Notification.insertMany(notifications, { session });
      }

      //create activity
      const [createdActivity] = await TaskActivity.create(
        [
          {
            todo: taskId,
            actor: reqUserId,
            actorName: ownerUser.name,
            message: `${ownerUser.name} assigned subtask ${subTask.title} to ${assignUser.name}`,
            metadata: {
              subTaskId: subTask._id,
              subTaskTitle: subTask.title,
              action: "SUBTASK_ASSIGNED",
            },
            type: "TASK_ASSIGN",
          },
        ],
        { session }
      );

      activity = createdActivity;
    });

    //send socket events
    if (uniqueRecients.length > 0) {
      uniqueRecients.forEach((recipientId) => {
        const userNotifications = notifications.filter(
          (notification) => notification.user.toString() === recipientId
        );
        io.to(`user:${recipientId}`).emit("notification", {
          notifications: userNotifications,
        });
      });
    }

    //send activity to task room
    io.to(`task:${taskId}`).emit("task:activity", activity);

    //send response
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subTask: subTask,
          activity: activity,
        },
        "Sub-task assigned successfully",
        true
      )
    );
  } catch (error) {
    console.error("assignSubTask error:", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Failed to assign sub-task.",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};
const getSubTaskProgress = async (req, res) => {
  try {
    const { taskId, subTaskId } = req.params;
    const userId = req.user.userId;

    // =====================================================
    // STEP 1: VALIDATE IDS
    // =====================================================

    if (
      !mongoose.Types.ObjectId.isValid(taskId) ||
      !mongoose.Types.ObjectId.isValid(subTaskId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task or sub-task ID", false));
    }

    const taskObjectId = new mongoose.Types.ObjectId(taskId);
    const subTaskObjectId = new mongoose.Types.ObjectId(subTaskId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // =====================================================
    // STEP 2: AGGREGATION
    // =====================================================

    const result = await Todo.aggregate([
      // ---------------------------------------------------
      // 1. Find parent task
      // ---------------------------------------------------

      {
        $match: {
          _id: taskObjectId,
          createdBy: userObjectId,
          isDeleted: false,
          isArchived: false,

          // Make sure this subtask belongs to this task
          SubTodos: subTaskObjectId,
        },
      },

      // ---------------------------------------------------
      // 2. Get all SubTodos of this task
      // ---------------------------------------------------

      {
        $lookup: {
          from: "subtodos",
          localField: "SubTodos",
          foreignField: "_id",
          as: "subTasks",
        },
      },

      // ---------------------------------------------------
      // 3. Calculate overall task progress
      // ---------------------------------------------------

      {
        $addFields: {
          totalSubTasks: {
            $size: "$subTasks",
          },

          completedTasks: {
            $size: {
              $filter: {
                input: "$subTasks",
                as: "subTask",
                cond: {
                  $eq: ["$$subTask.status", "COMPLETED"],
                },
              },
            },
          },

          pendingTasks: {
            $size: {
              $filter: {
                input: "$subTasks",
                as: "subTask",
                cond: {
                  $eq: ["$$subTask.status", "PENDING"],
                },
              },
            },
          },

          ongoingTasks: {
            $size: {
              $filter: {
                input: "$subTasks",
                as: "subTask",
                cond: {
                  $eq: ["$$subTask.status", "ON_GOING"],
                },
              },
            },
          },

          incompleteTasks: {
            $size: {
              $filter: {
                input: "$subTasks",
                as: "subTask",
                cond: {
                  $eq: ["$$subTask.status", "IN_COMPLETE"],
                },
              },
            },
          },
        },
      },

      // ---------------------------------------------------
      // 4. Calculate percentage
      // ---------------------------------------------------

      {
        $addFields: {
          progressPercentage: {
            $cond: [
              { $gt: ["$totalSubTasks", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: ["$completedTasks", "$totalSubTasks"],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },

      // ---------------------------------------------------
      // 5. Get requested SubTask
      // ---------------------------------------------------

      {
        $addFields: {
          currentSubTask: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$subTasks",
                  as: "subTask",
                  cond: {
                    $eq: ["$$subTask._id", subTaskObjectId],
                  },
                },
              },
              0,
            ],
          },
        },
      },

      // ---------------------------------------------------
      // 6. Participant-wise progress
      // ---------------------------------------------------

      {
        $unwind: {
          path: "$subTasks",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $group: {
          _id: "$subTasks.assignedTo",

          totalTasks: {
            $sum: 1,
          },

          completedTasks: {
            $sum: {
              $cond: [
                {
                  $eq: ["$subTasks.status", "COMPLETED"],
                },
                1,
                0,
              ],
            },
          },

          pendingTasks: {
            $sum: {
              $cond: [
                {
                  $eq: ["$subTasks.status", "PENDING"],
                },
                1,
                0,
              ],
            },
          },

          ongoingTasks: {
            $sum: {
              $cond: [
                {
                  $eq: ["$subTasks.status", "ON_GOING"],
                },
                1,
                0,
              ],
            },
          },

          incompleteTasks: {
            $sum: {
              $cond: [
                {
                  $eq: ["$subTasks.status", "IN_COMPLETE"],
                },
                1,
                0,
              ],
            },
          },
        },
      },

      // ---------------------------------------------------
      // 7. Participant progress percentage
      // ---------------------------------------------------

      {
        $addFields: {
          progressPercentage: {
            $cond: [
              { $gt: ["$totalTasks", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: ["$completedTasks", "$totalTasks"],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },

      // ---------------------------------------------------
      // 8. Put participant progress into array
      // ---------------------------------------------------

      {
        $group: {
          _id: null,

          participantsProgress: {
            $push: {
              user: "$_id",
              totalTasks: "$totalTasks",
              completedTasks: "$completedTasks",
              pendingTasks: "$pendingTasks",
              ongoingTasks: "$ongoingTasks",
              incompleteTasks: "$incompleteTasks",
              progressPercentage: "$progressPercentage",
            },
          },
        },
      },

      // ---------------------------------------------------
      // 9. Return clean response
      // ---------------------------------------------------

      {
        $project: {
          _id: 0,
          participantsProgress: 1,
        },
      },
    ]);

    // =====================================================
    // STEP 3: CHECK TASK
    // =====================================================

    if (!result.length) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task or sub-task not found", false));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result[0],
          "Sub-task progress fetched successfully",
          true
        )
      );
  } catch (error) {
    console.error("Get SubTask Progress Error:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to fetch sub-task progress", false)
      );
  }
};
const reorderSubTasks = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { taskId } = req.params;
    const { subTaskIds } = req.body;

    const userId = req.user.userId.toString();

    // =====================================================
    // STEP 1: VALIDATE TASK ID
    // =====================================================

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID"));
    }

    // =====================================================
    // STEP 2: VALIDATE REQUEST BODY
    // =====================================================

    if (!Array.isArray(subTaskIds)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "subTaskIds must be an array"));
    }

    if (subTaskIds.length === 0) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "At least one subtask is required"));
    }

    // =====================================================
    // STEP 3: VALIDATE SUBTASK IDS
    // =====================================================

    const invalidSubTaskId = subTaskIds.some(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalidSubTaskId) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "One or more subtask IDs are invalid")
        );
    }

    const requestedSubTaskIds = subTaskIds.map((id) => id.toString());

    // =====================================================
    // STEP 4: CHECK DUPLICATE SUBTASK IDS
    // =====================================================

    const uniqueSubTaskIds = new Set(requestedSubTaskIds);

    if (uniqueSubTaskIds.size !== requestedSubTaskIds.length) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Duplicate subtask IDs are not allowed")
        );
    }

    // =====================================================
    // STEP 5: FIND PARENT TASK
    // =====================================================

    const parentTask = await Todo.findOne({
      _id: taskId,
      isDeleted: false,
      isArchived: false,
    })
      .select("_id title createdBy participants SubTodos")
      .lean();

    if (!parentTask) {
      return res.status(404).json(new ApiResponse(404, null, "Task not found"));
    }

    // =====================================================
    // STEP 6: CHECK PARTICIPANT
    // =====================================================

    const participant = (parentTask.participants || []).find(
      (participant) => participant.user?.toString() === userId
    );

    if (!participant) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, null, "You are not a participant of this task")
        );
    }

    // =====================================================
    // STEP 7: CHECK PERMISSION
    // =====================================================

    if (!["owner", "editor"].includes(participant.role)) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, null, "You are not allowed to reorder subtasks")
        );
    }

    // =====================================================
    // STEP 8: GET CURRENT SUBTASK ORDER
    // =====================================================

    const existingSubTaskIds = (parentTask.SubTodos || []).map((id) =>
      id.toString()
    );

    // =====================================================
    // STEP 9: CHECK SAME NUMBER OF SUBTASKS
    // =====================================================

    if (requestedSubTaskIds.length !== existingSubTaskIds.length) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "You must provide all subtasks when reordering"
          )
        );
    }

    // =====================================================
    // STEP 10: CHECK ALL SUBTASKS BELONG TO TASK
    // =====================================================

    const existingSubTaskSet = new Set(existingSubTaskIds);

    const allSubTasksBelongToTask = requestedSubTaskIds.every((id) =>
      existingSubTaskSet.has(id)
    );

    if (!allSubTasksBelongToTask) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "One or more subtasks do not belong to this task"
          )
        );
    }

    // =====================================================
    // STEP 11: CHECK WHETHER ORDER ACTUALLY CHANGED
    // =====================================================

    const orderChanged = requestedSubTaskIds.some(
      (id, index) => id !== existingSubTaskIds[index]
    );

    if (!orderChanged) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            taskId,
            changed: false,
          },
          "Subtask order is already up to date"
        )
      );
    }

    // =====================================================
    // STEP 12: GET SUBTASK DETAILS
    // =====================================================

    const subTasks = await SubTodo.find({
      _id: {
        $in: requestedSubTaskIds,
      },
    })
      .select(
        "_id title description status priority deadline estimatedHours tags assignedTo order"
      )
      .lean();

    if (subTasks.length !== requestedSubTaskIds.length) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "One or more subtasks could not be found")
        );
    }

    // =====================================================
    // STEP 13: CREATE SUBTASK MAP
    // =====================================================

    const subTaskMap = new Map(
      subTasks.map((subTask) => [subTask._id.toString(), subTask])
    );

    // =====================================================
    // STEP 14: GET ACTOR NAME
    // =====================================================

    const actor = await User.findById(userId).select("name").lean();

    if (!actor) {
      return res.status(404).json(new ApiResponse(404, null, "User not found"));
    }

    const actorName = actor.name;

    // =====================================================
    // STEP 15: CREATE POSITION CHANGES
    // =====================================================

    const positionChanges = [];

    requestedSubTaskIds.forEach((subTaskId, newIndex) => {
      const oldIndex = existingSubTaskIds.indexOf(subTaskId);

      if (oldIndex !== newIndex) {
        const subTask = subTaskMap.get(subTaskId);

        positionChanges.push({
          subTask: subTaskId,
          title: subTask?.title || "Untitled subtask",

          oldPosition: oldIndex + 1,
          newPosition: newIndex + 1,
        });
      }
    });

    // =====================================================
    // STEP 16: CREATE HUMAN READABLE MESSAGE
    // =====================================================

    let activityMessage;

    if (positionChanges.length === 1) {
      const change = positionChanges[0];

      activityMessage = `${actorName} moved "${change.title}" from position ${change.oldPosition} to position ${change.newPosition}.`;
    } else {
      const changesText = positionChanges
        .map(
          (change) =>
            `"${change.title}" ${change.oldPosition} → ${change.newPosition}`
        )
        .join(", ");

      activityMessage = `${actorName} reordered the subtasks: ${changesText}.`;
    }

    // =====================================================
    // STEP 17: START TRANSACTION
    // =====================================================

    let updatedSubTasks = [];

    await session.withTransaction(async () => {
      // ===============================================
      // UPDATE SUBTASK ORDER
      // ===============================================

      const bulkOperations = requestedSubTaskIds.map((subTaskId, index) => ({
        updateOne: {
          filter: {
            _id: subTaskId,
          },

          update: {
            $set: {
              order: index + 1,
            },
          },
        },
      }));

      await SubTodo.bulkWrite(bulkOperations, {
        session,
        ordered: true,
      });

      // ===============================================
      // UPDATE PARENT TODO ORDER
      // ===============================================

      await Todo.updateOne(
        {
          _id: taskId,
        },
        {
          $set: {
            SubTodos: requestedSubTaskIds.map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        },
        {
          session,
        }
      );

      // ===============================================
      // CREATE ACTIVITY
      // ===============================================

      await TaskActivity.create(
        [
          {
            todo: taskId,

            actor: userId,

            // Your schema uses "acotorName"
            acotorName: actorName,

            type: "SUBTASK_REORDERED",

            message: activityMessage,

            metadata: {
              oldValue: existingSubTaskIds,

              newValue: requestedSubTaskIds,

              extra: {
                action: "SUBTASK_REORDERED",

                changes: positionChanges,
              },
            },
          },
        ],
        {
          session,
        }
      );

      // ===============================================
      // FETCH UPDATED SUBTASKS
      // ===============================================

      updatedSubTasks = await SubTodo.find({
        _id: {
          $in: requestedSubTaskIds,
        },
      })
        .select(
          "_id title description status priority deadline estimatedHours tags assignedTo order"
        )
        .populate("assignedTo", "name email profileImage")
        .sort({
          order: 1,
        })
        .session(session)
        .lean();
    });

    // =====================================================
    // STEP 18: GET ALL PARTICIPANTS
    // =====================================================

    const recipientIds = [
      ...new Set(
        (parentTask.participants || [])
          .map((participant) => participant.user?.toString())
          .filter(Boolean)
      ),
    ];

    // =====================================================
    // STEP 19: CREATE NOTIFICATIONS
    // =====================================================

    if (recipientIds.length > 0) {
      const notificationDocuments = recipientIds.map((recipientId) => ({
        recipient: recipientId,

        sender: userId,

        todo: taskId,

        type: "task",

        title: "Subtasks reordered",

        message: activityMessage,

        metadata: {
          action: "SUBTASK_REORDERED",

          changes: positionChanges,
        },
      }));

      await Notification.insertMany(notificationDocuments);
    }

    // =====================================================
    // STEP 20: SOCKET.IO TASK UPDATE
    // =====================================================

    io.to(`task:${taskId}`).emit("task:updated", {
      type: "SUBTASK_REORDERED",

      taskId,

      updatedBy: {
        userId,
        name: actorName,
      },

      subTasks: updatedSubTasks,
    });

    // =====================================================
    // STEP 21: SOCKET.IO NOTIFICATION
    // =====================================================

    recipientIds.forEach((recipientId) => {
      io.to(`user:${recipientId}`).emit("notification", {
        type: "task",

        action: "SUBTASK_REORDERED",

        taskId,

        title: "Subtasks reordered",

        message: activityMessage,

        actor: {
          userId,
          name: actorName,
        },
      });
    });

    // =====================================================
    // STEP 22: RESPONSE
    // =====================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          taskId,

          changed: true,

          changes: positionChanges,

          subTasks: updatedSubTasks,
        },

        "Subtasks reordered successfully"
      )
    );
  } catch (error) {
    console.error("reorderSubTasks error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to reorder subtasks"));
  } finally {
    await session.endSession();
  }
};
const searchSubTasks = async (req, res) => {
  try {
    // =====================================================
    // STEP 1: GET REQUEST DATA
    // =====================================================

    const { taskId } = req.params;
    const { q, page = 1, limit = 10 } = req.query;

    const userId = req.user.userId.toString();

    // =====================================================
    // STEP 2: VALIDATE TASK ID
    // =====================================================

    if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID"));
    }

    // =====================================================
    // STEP 3: VALIDATE SEARCH QUERY
    // =====================================================

    const searchQuery = q?.trim();

    if (!searchQuery) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Search query is required"));
    }

    if (searchQuery.length < 2) {
      return res.status(400).json(
        new ApiResponse(
          400,
          null,
          "Search query must contain at least 2 characters"
        )
      );
    }

    // Prevent unnecessarily large queries
    if (searchQuery.length > 100) {
      return res.status(400).json(
        new ApiResponse(
          400,
          null,
          "Search query cannot exceed 100 characters"
        )
      );
    }

    // =====================================================
    // STEP 4: VALIDATE PAGINATION
    // =====================================================

    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);

    if (
      Number.isNaN(parsedPage) ||
      Number.isNaN(parsedLimit) ||
      parsedPage < 1 ||
      parsedLimit < 1
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid pagination values"));
    }

    // Maximum 50 results per request
    const safeLimit = Math.min(parsedLimit, 50);

    const skip = (parsedPage - 1) * safeLimit;

    // =====================================================
    // STEP 5: FIND TASK + CHECK ACCESS
    // =====================================================

    const task = await Todo.findOne({
      _id: taskId,

      isDeleted: false,
      isArchived: false,

      $or: [
        {
          createdBy: userId,
        },
        {
          participants: {
            $elemMatch: {
              user: userId,
            },
          },
        },
      ],
    })
      .select("_id SubTodos")
      .lean();

    // =====================================================
    // STEP 6: TASK NOT FOUND / ACCESS DENIED
    // =====================================================

    if (!task) {
      return res.status(404).json(
        new ApiResponse(
          404,
          null,
          "Task not found or you do not have access to this task"
        )
      );
    }

    // =====================================================
    // STEP 7: SEARCH SUBTASKS
    // =====================================================

    const normalizedSearch = searchQuery.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const searchRegex = new RegExp(normalizedSearch, "i");

    const subtasks = (task.SubTodos || []).filter((subTask) => {
      // Ignore deleted subtasks
      if (subTask.isDeleted === true) {
        return false;
      }

      // Search in title
      if (searchRegex.test(subTask.title || "")) {
        return true;
      }

      // Search in description
      if (searchRegex.test(subTask.description || "")) {
        return true;
      }

      // Search in tags
      if (
        Array.isArray(subTask.tags) &&
        subTask.tags.some((tag) => searchRegex.test(tag || ""))
      ) {
        return true;
      }

      return false;
    });

    // =====================================================
    // STEP 8: SORT RESULTS
    // =====================================================

    subtasks.sort((a, b) => {
      return (a.order ?? 0) - (b.order ?? 0);
    });

    // =====================================================
    // STEP 9: PAGINATION
    // =====================================================

    const totalSubTasks = subtasks.length;

    const totalPages =
      totalSubTasks === 0
        ? 0
        : Math.ceil(totalSubTasks / safeLimit);

    const paginatedSubTasks = subtasks.slice(
      skip,
      skip + safeLimit
    );

    // =====================================================
    // STEP 10: RESPONSE
    // =====================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subtasks: paginatedSubTasks,
          pagination: {
            currentPage: parsedPage,
            limit: safeLimit,
            totalSubTasks,
            totalPages,
            hasNextPage: parsedPage < totalPages,
            hasPreviousPage: parsedPage > 1,
          },
          search: searchQuery,
        },
        "Subtasks fetched successfully"
      )
    );
  } catch (error) {
    console.error("searchSubTasks error:", error);

    return res.status(500).json(
      new ApiResponse(
        500,
        null,
        "Something went wrong while searching subtasks"
      )
    );
  }
};
const filterSubTasks = async (req, res) => {};
const getSubTaskHistory = async (req, res) => {};
const sortSubTasks = async (req, res) => {};

export {
  updateSubTask,
  updateSubTaskStatus,
  deleteSubTask,
  restoreSubTask,
  assignSubTask,
  getSubTaskProgress,
  reorderSubTasks,
  searchSubTasks,
  filterSubTasks,
  getSubTaskHistory,
  sortSubTasks,
};