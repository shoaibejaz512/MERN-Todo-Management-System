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
  const session =await mongoose.startSession();
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
      );;
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
      await subTask.save({session});

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
      if(uniqueRecients.length > 0){
        notifications = uniqueRecients.map((user) => ({
          user:user,
          sender: reqUserId,
          type:"TASK_ASSIGN",
          message:`${ownerUser.name} assigned subtask ${subTask.title} to ${assignUser.name}`,
        }));
        await Notification.insertMany(notifications, {session});
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
const getSubTaskProgress = async (req, res) => {};
const reorderSubTasks = async (req, res) => {};
const searchSubTasks = async (req, res) => {};
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
