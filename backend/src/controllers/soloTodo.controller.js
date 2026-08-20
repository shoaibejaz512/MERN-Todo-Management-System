import { SingleTodo } from "../models/singleTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import todoAIService from "../service/ai.service.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Notification } from "../models/notification.model.js";
import { TaskActivity } from "../models/taskactivity.model.js";
import { Invite } from "../models/invite.model.js";
import { io } from "../../server.js";

// controllers/todo.controller.js

export const createSoloTodo = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { title, description, priority, estimatedHours, deadline, tags } =
      req.body;

    if (!title || !description || !deadline) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Title, description and deadline are required",
            false
          )
        );
    }

    const userId = req.user.userId;

    let todo;
    let user;
    let notification;

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 1: CREATE TODO
      // ==========================================
      todo = await SingleTodo.create(
        {
          title,
          description,
          priority,
          estimatedHours,
          deadline,
          tags,
          createdBy: userId,
          source: "manual",

          participants: [
            {
              user: userId,
              role: "owner",
            },
          ],
        },
        { session }
      );

      // ==========================================
      // STEP 2: CREATE TASK ACTIVITY
      // ==========================================
      await TaskActivity.create(
        [
          {
            todo: todo._id,
            actor: userId,
            targetUser: null,
            type: "TASK_CREATED",
            message: "A new task was created.",
            metadata: {
              extra: {
                title: todo.title,
                source: todo.source,
              },
            },
          },
        ],
        { session }
      );

      // ==========================================
      // STEP 3: CREATE NOTIFICATION
      // ==========================================
      notification = await Notification.create(
        {
          user: userId,
          sender: userId,
          type: "TASK_CREATED",
          title: "Task Created",
          message: "You have created a new task",
          todo: todo._id,
          isRead: false,
        },
        { session }
      );

      // ==========================================
      // STEP 4: UPDATE USER
      // ==========================================
      user = await User.findByIdAndUpdate(
        userId,
        {
          $addToSet: {
            singleTasks: todo._id,
          },
        },
        {
          new: true,
          session,
        }
      );

      // ==========================================
      // STEP 5: CHECK USER
      // ==========================================
      if (!user) {
        throw new Error("User not found");
      }
    });

    // ==========================================
    // STEP 6: EMIT SOCKET EVENT
    // ==========================================
    io.to(`user:${userId.toString()}`).emit("notification", notification);

    return res
      .status(201)
      .json(new ApiResponse(201, todo, "Todo created successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    await session.endSession();
  }
};
export const generateAITodo = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    const todo = await todoAIService.generateSingleTodo(prompt);
    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Todo Generated Successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
export const saveAITodo = async (req, res) => {
  // Start a MongoDB session so all related DB operations
  // can be committed or rolled back together.
  const session = await mongoose.startSession();

  try {
    const { title, description, priority, estimatedHours, deadline, tags } =
      req.body;

    // -----------------------------------------
    // 1. Validate required fields
    // -----------------------------------------
    if (!title || !description) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Title and description are required",
            false
          )
        );
    }

    const userId = req.user.userId;

    // These variables will hold the documents
    // created inside the transaction.
    let todo;
    let activity;
    let notification;

    // -----------------------------------------
    // 2. Start transaction
    // -----------------------------------------
    await session.withTransaction(async () => {
      // -----------------------------------------
      // 3. Create AI Todo
      // -----------------------------------------
      todo = await SingleTodo.create(
        [
          {
            title,
            description,
            priority,
            estimatedHours,
            deadline,
            tags,
            createdBy: userId,
            participants: [
              {
                user: userId,
                role: "owner",
              },
            ],
            // This identifies that the task
            // was generated/saved through AI.
            source: "ai",
          },
        ],
        { session }
      );

      // create() with an array returns an array
      // when used with a session.
      todo = todo[0];

      if (!todo) {
        throw new Error("Failed to save AI Todo");
      }

      // -----------------------------------------
      // 4. Add Todo reference to User
      // -----------------------------------------
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $addToSet: {
            singleTasks: todo._id,
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!user) {
        throw new Error("User not found");
      }

      // -----------------------------------------
      // 5. Create task activity
      // -----------------------------------------
      const activityResult = await TaskActivity.create(
        [
          {
            todo: todo._id,
            actor: userId,
            targetUser: null,

            type: "TASK_CREATED",

            message: "A new AI task was created.",

            metadata: {
              extra: {
                title: todo.title,
                source: todo.source,
              },
            },
          },
        ],
        { session }
      );

      // create() returns an array when passed
      // an array of documents.
      activity = activityResult[0];

      if (!activity) {
        throw new Error("Failed to create task activity");
      }

      // -----------------------------------------
      // 6. Create notification
      // -----------------------------------------
      const notificationResult = await Notification.create(
        [
          {
            user: userId,
            sender: userId,

            type: "TASK_CREATED",

            title: "AI Task Created",

            message: "You have created a new AI task.",

            todo: todo._id,

            isRead: false,
          },
        ],
        { session }
      );

      notification = notificationResult[0];

      if (!notification) {
        throw new Error("Failed to create notification");
      }

      // -----------------------------------------
      // IMPORTANT:
      // Do NOT emit Socket.io events here.
      //
      // The transaction may still rollback.
      // We emit events only after the transaction
      // successfully commits.
      // -----------------------------------------
    });

    // -----------------------------------------
    // 7. Transaction successfully committed
    // -----------------------------------------

    // Send real-time task activity to the user
    // only after the database transaction succeeds.
    io.to(`user:${userId.toString()}`).emit("taskActivity", activity);

    // Send real-time notification to the user.
    io.to(`user:${userId.toString()}`).emit("notification", notification);

    // -----------------------------------------
    // 8. Send successful response
    // -----------------------------------------
    return res
      .status(201)
      .json(new ApiResponse(201, todo, "AI Todo saved successfully", true));
  } catch (error) {
    // -----------------------------------------
    // Transaction will automatically rollback
    // if an error is thrown inside withTransaction.
    // -----------------------------------------

    console.error("saveAITodo Error:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to save AI Todo",
          false
        )
      );
  } finally {
    // Always close the MongoDB session.
    await session.endSession();
  }
};
export const updateTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    const {
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      status,
    } = req.body;

    const userId = req.user.userId;

    // ==========================================
    // STEP 1: Validate MongoDB Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    let todo;
    let createdActivities = [];
    let notifications = [];

    // ==========================================
    // STEP 2: Start MongoDB Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 3: Find Task
      // ==========================================

      todo = await SingleTodo.findOne({
        _id: id,
        isDeleted: false,
        isArchived: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 4: Determine Task Type
      //
      // Personal Task:
      // participants does not exist or is empty.
      //
      // Collaborative Task:
      // participants contains one or more users.
      // ==========================================

      const isCollaborative =
        Array.isArray(todo.participants) && todo.participants.length > 0;

      // ==========================================
      // STEP 5: Find Current User Participant
      // ==========================================

      const participant = isCollaborative
        ? todo.participants.find(
            (participant) => participant.user.toString() === userId.toString()
          )
        : null;

      // ==========================================
      // STEP 6: Determine User Role
      // ==========================================

      let userRole = null;

      // Task creator is always the owner
      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      }

      // Collaborative participant
      else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 7: Authorization
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // ==========================================
      // PERSONAL TASK
      //
      // Only owner can update personal task.
      // ==========================================

      if (!isCollaborative && userRole !== "owner") {
        throw new Error("You do not have permission to update this task");
      }

      // ==========================================
      // COLLABORATIVE TASK
      //
      // Viewer cannot update anything.
      // ==========================================

      if (isCollaborative && userRole === "viewer") {
        throw new Error("You do not have permission to update this task");
      }

      // ==========================================
      // STEP 8: Prepare Activities
      // ==========================================

      const activities = [];

      // ==========================================
      // TITLE
      //
      // Personal:
      // Owner
      //
      // Collaborative:
      // Owner + Editor
      // ==========================================

      if (title !== undefined && title !== todo.title) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error("You do not have permission to update the title");
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "TITLE_UPDATED",

          message: "Task title was updated.",

          metadata: {
            oldValue: todo.title,
            newValue: title,
          },
        });

        todo.title = title;
      }

      // ==========================================
      // DESCRIPTION
      //
      // Personal:
      // Owner
      //
      // Collaborative:
      // Owner + Editor
      // ==========================================

      if (description !== undefined && description !== todo.description) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error(
            "You do not have permission to update the description"
          );
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "DESCRIPTION_UPDATED",

          message: "Task description was updated.",

          metadata: {
            oldValue: todo.description,
            newValue: description,
          },
        });

        todo.description = description;
      }

      // ==========================================
      // PRIORITY
      // ==========================================

      if (priority !== undefined && priority !== todo.priority) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error("You do not have permission to update priority");
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "PRIORITY_UPDATED",

          message: "Task priority was updated.",

          metadata: {
            oldValue: todo.priority,
            newValue: priority,
          },
        });

        todo.priority = priority;
      }

      // ==========================================
      // ESTIMATED HOURS
      // ==========================================

      if (
        estimatedHours !== undefined &&
        estimatedHours !== todo.estimatedHours
      ) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error(
            "You do not have permission to update estimated hours"
          );
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "TASK_UPDATED",

          message: "Estimated hours were updated.",

          metadata: {
            oldValue: todo.estimatedHours,
            newValue: estimatedHours,
          },
        });

        todo.estimatedHours = estimatedHours;
      }

      // ==========================================
      // DEADLINE
      // ==========================================

      if (
        deadline !== undefined &&
        String(deadline) !== String(todo.deadline)
      ) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error("You do not have permission to update the deadline");
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "DEADLINE_UPDATED",

          message: "Task deadline was updated.",

          metadata: {
            oldValue: todo.deadline,
            newValue: deadline,
          },
        });

        todo.deadline = deadline;
      }

      // ==========================================
      // TAGS
      // ==========================================

      if (
        tags !== undefined &&
        JSON.stringify(tags) !== JSON.stringify(todo.tags)
      ) {
        if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
          throw new Error("You do not have permission to update tags");
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "TASK_UPDATED",

          message: "Task tags were updated.",

          metadata: {
            oldValue: todo.tags,
            newValue: tags,
          },
        });

        todo.tags = tags;
      }

      // ==========================================
      // STATUS
      //
      // Personal:
      // Owner
      //
      // Collaborative:
      // Owner + Editor + Contributor
      // ==========================================

      if (status !== undefined && status !== todo.status) {
        if (
          isCollaborative &&
          userRole !== "owner" &&
          userRole !== "editor" &&
          userRole !== "contributor"
        ) {
          throw new Error("You do not have permission to update task status");
        }

        activities.push({
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "STATUS_UPDATED",

          message: "Task status was updated.",

          metadata: {
            oldValue: todo.status,
            newValue: status,
          },
        });

        todo.status = status;
      }

      // ==========================================
      // STEP 9: Check Whether Anything Changed
      // ==========================================

      if (activities.length === 0) {
        return;
      }

      // ==========================================
      // STEP 10: Save Updated Task
      // ==========================================

      await todo.save({ session });

      // ==========================================
      // STEP 11: Create Activities
      //
      // IMPORTANT:
      // Both personal and collaborative tasks
      // create activities.
      // ==========================================

      createdActivities = await TaskActivity.insertMany(activities, {
        session,
      });

      // ==========================================
      // STEP 12: Notifications
      //
      // IMPORTANT:
      // Notifications are ONLY created for
      // collaborative tasks.
      // ==========================================

      if (isCollaborative) {
        // ========================================
        // Get All Participants Except Actor
        // ========================================

        const participantIds = todo.participants
          .map((participant) => participant.user)
          .filter(
            (participantId) => participantId.toString() !== userId.toString()
          );

        // ========================================
        // Include Owner
        //
        // If owner is not inside participants,
        // add the owner manually.
        // ========================================

        if (
          todo.createdBy.toString() !== userId.toString() &&
          !participantIds.some(
            (participantId) =>
              participantId.toString() === todo.createdBy.toString()
          )
        ) {
          participantIds.push(todo.createdBy);
        }

        // ========================================
        // Remove Duplicate Users
        // ========================================

        const uniqueParticipantIds = [
          ...new Map(
            participantIds.map((participantId) => [
              participantId.toString(),
              participantId,
            ])
          ).values(),
        ];

        // ========================================
        // Create Notifications
        // ========================================

        if (uniqueParticipantIds.length > 0) {
          notifications = await Notification.insertMany(
            uniqueParticipantIds.map((participantId) => ({
              // Notification receiver
              user: participantId,

              // User who performed update
              sender: userId,

              type: "TASK_UPDATED",

              title: "Task Updated",

              message: `A task you are participating in was updated.`,

              todo: todo._id,

              isRead: false,
            })),
            { session }
          );
        }
      }
    });

    // ==========================================
    // STEP 13: No Changes Made
    // ==========================================

    if (createdActivities.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, todo, "No changes were made to the task.", true)
        );
    }

    // ==========================================
    // STEP 14: Emit Notifications
    //
    // Only collaborative tasks have notifications.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 15: Emit Activities
    //
    // Only collaborative tasks have a task room.
    // ==========================================

    if (Array.isArray(todo.participants) && todo.participants.length > 0) {
      for (const activity of createdActivities) {
        io.to(`task:${todo._id.toString()}`).emit("task:activity", activity);
      }
    }

    // ==========================================
    // STEP 16: Success Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Task updated successfully.", true));
  } catch (error) {
    console.error("updateTask Error:", error);

    // ==========================================
    // STEP 17: Handle Not Found
    // ==========================================

    if (error.message === "Task not found") {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

    // ==========================================
    // STEP 18: Handle Authorization
    // ==========================================

    if (error.message === "You are not a participant of this task") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 19: Handle Permission Errors
    // ==========================================

    if (error.message.includes("permission")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 20: Handle Other Errors
    // ==========================================

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to update task",
          false
        )
      );
  } finally {
    // ==========================================
    // Always Close MongoDB Session
    // ==========================================

    await session.endSession();
  }
};
export const updateTaskStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    // ==========================================
    // STEP 1: Validate MongoDB Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 2: Validate Status
    // ==========================================

    const allowedStatuses = [
      "START",
      "PENDING",
      "ON_GOING",
      "COMPLETED",
      "IN_COMPLETE",
    ];

    if (!status) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Status is required", false));
    }

    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid status", false));
    }

    let todo;
    let createdActivities = [];
    let notifications = [];

    // ==========================================
    // STEP 3: Start MongoDB Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 4: Find Task
      // ==========================================

      todo = await SingleTodo.findOne({
        _id: id,
        isDeleted: false,
        isArchived: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 5: Check Whether Task Is
      // Single or Collaborative
      // ==========================================

      const isCollaborative =
        Array.isArray(todo.participants) && todo.participants.length > 0;

      // ==========================================
      // STEP 6: Authorization
      // ==========================================

      let userRole = null;

      // Single task / Owner
      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      }

      // Collaborative task
      if (isCollaborative) {
        const participant = todo.participants.find(
          (participant) => participant.user.toString() === userId.toString()
        );

        if (participant) {
          userRole = participant.role;
        }
      }

      // ==========================================
      // User is neither owner nor participant
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // ==========================================
      // Viewer cannot update status
      // ==========================================

      if (userRole === "viewer") {
        throw new Error("You do not have permission to update task status");
      }

      // ==========================================
      // STEP 7: Check Status Change
      // ==========================================

      if (status === todo.status) {
        return;
      }

      const oldStatus = todo.status;

      // ==========================================
      // STEP 8: Update Status
      // ==========================================

      todo.status = status;

      await todo.save({ session });

      // ==========================================
      // STEP 9:
      // Activity + Notification ONLY for
      // Collaborative Tasks
      // ==========================================

      if (isCollaborative) {
        // ========================================
        // Create Activity
        // ========================================

        const activity = {
          todo: todo._id,
          actor: userId,
          targetUser: null,

          type: "STATUS_UPDATED",

          message: "Task status was updated.",

          metadata: {
            oldValue: oldStatus,
            newValue: status,
          },
        };

        createdActivities = await TaskActivity.insertMany([activity], {
          session,
        });

        // ========================================
        // Get Participants
        // Except Current User
        // ========================================

        const participantIds = todo.participants
          .map((participant) => participant.user)
          .filter(
            (participantId) => participantId.toString() !== userId.toString()
          );

        // ========================================
        // Include Owner
        // If Owner Is Not In Participants
        // ========================================

        if (
          todo.createdBy.toString() !== userId.toString() &&
          !participantIds.some(
            (participantId) =>
              participantId.toString() === todo.createdBy.toString()
          )
        ) {
          participantIds.push(todo.createdBy);
        }

        // ========================================
        // Create Notifications
        // ========================================

        if (participantIds.length > 0) {
          notifications = await Notification.insertMany(
            participantIds.map((participantId) => ({
              // Receiver
              user: participantId,

              // Person who changed status
              sender: userId,

              type: "TASK_UPDATED",

              title: "Task Status Updated",

              message: `Task "${todo.title}" status was changed from ${oldStatus} to ${status}.`,

              todo: todo._id,

              isRead: false,
            })),
            { session }
          );
        }
      }
    });

    // ==========================================
    // STEP 10: No Status Change
    // ==========================================

    if (todo.status === status) {
      // If it was already the same status and
      // no activity was created
      if (createdActivities.length === 0) {
        return res
          .status(200)
          .json(
            new ApiResponse(
              200,
              todo,
              "Task status is already up to date.",
              true
            )
          );
      }
    }

    // ==========================================
    // STEP 11: Emit Notifications
    // ONLY Collaborative Task
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 12: Emit Activity
    // ONLY Collaborative Task
    // ==========================================

    for (const activity of createdActivities) {
      io.to(`task:${todo._id.toString()}`).emit("task:activity", activity);
    }

    // ==========================================
    // STEP 13: Success Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, todo, "Task status updated successfully.", true)
      );
  } catch (error) {
    console.error("updateTaskStatus Error:", error);

    // ==========================================
    // Handle Not Found / Authorization
    // ==========================================

    if (
      error.message === "Task not found" ||
      error.message === "You are not a participant of this task"
    ) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

    // ==========================================
    // Handle Permission Errors
    // ==========================================

    if (error.message.includes("permission")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // Handle Other Errors
    // ==========================================

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to update task status",
          false
        )
      );
  } finally {
    // ==========================================
    // Always End Session
    // ==========================================

    await session.endSession();
  }
};
export const deleteTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // ==========================================
    // STEP 1: Validate MongoDB Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    let deletedTask;
    let createdActivity = null;
    let notifications = [];

    // ==========================================
    // STEP 2: Start Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 3: Find Task
      // ==========================================

      const todo = await SingleTodo.findOne({
        _id: id,
        isArchived: false,
        isDeleted: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 4: Determine Task Type
      // ==========================================

      const isCollaborative =
        Array.isArray(todo.participants) && todo.participants.length > 0;

      // ==========================================
      // STEP 5: Find Participant
      // ==========================================

      const participant = isCollaborative
        ? todo.participants.find(
            (participant) => participant.user.toString() === userId.toString()
          )
        : null;

      // ==========================================
      // STEP 6: Determine User Role
      // ==========================================

      let userRole = null;

      // Owner
      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      }

      // Collaborative participant
      else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 7: Authorization
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // ==========================================
      // PERSONAL TASK
      //
      // Only owner can delete.
      // ==========================================

      if (!isCollaborative && userRole !== "owner") {
        throw new Error("You do not have permission to delete this task");
      }

      // ==========================================
      // COLLABORATIVE TASK
      //
      // Only owner can delete the task.
      //
      // If you want editor to delete too,
      // change this condition.
      // ==========================================

      if (isCollaborative && userRole !== "owner") {
        throw new Error("Only the task owner can delete this task");
      }

      // ==========================================
      // STEP 8: Create Delete Activity
      //
      // Activity is created for BOTH:
      // Personal + Collaborative tasks.
      // ==========================================

      const activity = {
        todo: todo._id,
        actor: userId,
        targetUser: null,

        type: "TASK_DELETED",

        message: "Task was deleted.",

        metadata: {
          oldStatus: todo.status,
          taskTitle: todo.title,
        },
      };

      const activities = await TaskActivity.insertMany([activity], { session });

      createdActivity = activities[0];

      // ==========================================
      // STEP 9: Soft Delete Task
      // ==========================================

      todo.isDeleted = true;
      todo.deletedAt = new Date();

      await todo.save({ session });

      deletedTask = todo;

      // ==========================================
      // STEP 10: Notifications
      //
      // ONLY collaborative tasks.
      // Personal tasks have nobody to notify.
      // ==========================================

      if (isCollaborative) {
        // ========================================
        // Get all participants except actor
        // ========================================

        const participantIds = todo.participants
          .map((participant) => participant.user)
          .filter(
            (participantId) => participantId.toString() !== userId.toString()
          );

        // ========================================
        // Include owner if owner is not already
        // inside participants.
        // ========================================

        if (
          todo.createdBy.toString() !== userId.toString() &&
          !participantIds.some(
            (participantId) =>
              participantId.toString() === todo.createdBy.toString()
          )
        ) {
          participantIds.push(todo.createdBy);
        }

        // ========================================
        // Remove duplicate users
        // ========================================

        const uniqueParticipantIds = [
          ...new Map(
            participantIds.map((participantId) => [
              participantId.toString(),
              participantId,
            ])
          ).values(),
        ];

        // ========================================
        // Create Notifications
        // ========================================

        if (uniqueParticipantIds.length > 0) {
          notifications = await Notification.insertMany(
            uniqueParticipantIds.map((participantId) => ({
              // Notification receiver
              user: participantId,

              // User who deleted the task
              sender: userId,

              type: "TASK_DELETED",

              title: "Task Deleted",

              message: `The task "${todo.title}" was deleted.`,

              todo: todo._id,

              isRead: false,
            })),
            { session }
          );
        }
      }
    });

    // ==========================================
    // STEP 11: Emit Notifications
    //
    // Only collaborative tasks have notifications.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 12: Emit Activity
    //
    // Only collaborative tasks have a task room.
    // ==========================================

    if (
      Array.isArray(deletedTask.participants) &&
      deletedTask.participants.length > 0
    ) {
      io.to(`task:${deletedTask._id.toString()}`).emit(
        "task:activity",
        createdActivity
      );

      // ========================================
      // Optional: Tell task room that task
      // has been deleted.
      // ========================================

      io.to(`task:${deletedTask._id.toString()}`).emit("task:deleted", {
        todoId: deletedTask._id,
        deletedBy: userId,
      });
    }

    // ==========================================
    // STEP 13: Success Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, deletedTask, "Task deleted successfully", true)
      );
  } catch (error) {
    console.error("deleteTask Error:", error);

    // ==========================================
    // STEP 14: Handle Not Found
    // ==========================================

    if (error.message === "Task not found") {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

    // ==========================================
    // STEP 15: Handle Authorization
    // ==========================================

    if (error.message === "You are not a participant of this task") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 16: Handle Permission
    // ==========================================

    if (error.message.includes("permission")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    if (error.message.includes("Only the task owner")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 17: Handle Other Errors
    // ==========================================

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to delete task",
          false
        )
      );
  } finally {
    // ==========================================
    // Always Close Session
    // ==========================================

    await session.endSession();
  }
};
export const getTask = async (req, res) => {
  try {
    const { id } = req.params;

    // STEP 1: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    //STEP:2 FIND TASK BY ID
    const task = await SingleTodo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isArchived: false, // Ensure the task is not archived
      isDeleted: false,
    });

    //STEP:3 CHECK THE TASK IS FOUND OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:5 RETURN SUCCESS MESSAGE TO THE USER
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task fetched successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
export const getAllTasks = async (req, res) => {
  try {
    // STEP 1: Get all tasks of logged-in user
    const tasks = await SingleTodo.find({
      createdBy: req.user.userId,
      isArchived: false, // Ensure only non-archived tasks are fetched
      isDeleted: false,
    }).sort({ createdAt: -1 });

    // STEP 2: Return success
    return res
      .status(200)
      .json(new ApiResponse(200, tasks, "Tasks fetched successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
export const restoreArchiveTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // ==========================================
    // STEP 1: Validate MongoDB Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    let restoredTask;
    let createdActivity = null;
    let notifications = [];

    // ==========================================
    // STEP 2: Start Transaction
    //
    // Task restoration, activity creation and
    // notifications must succeed together.
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 3: Find Archived Task
      //
      // Do NOT filter by createdBy here because
      // collaborative editors may also restore
      // the task.
      // ==========================================

      const todo = await SingleTodo.findOne({
        _id: id,
        isArchived: true,
        isDeleted: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 4: Determine Task Type
      //
      // A task is considered collaborative when
      // it contains participants.
      // ==========================================

      const isCollaborative =
        Array.isArray(todo.participants) && todo.participants.length > 0;

      // ==========================================
      // STEP 5: Find Current User as Participant
      //
      // This is only required for collaborative
      // tasks.
      // ==========================================

      const participant = isCollaborative
        ? todo.participants.find(
            (participant) => participant.user.toString() === userId.toString()
          )
        : null;

      // ==========================================
      // STEP 6: Determine User Role
      // ==========================================

      let userRole = null;

      // ------------------------------------------
      // Task Owner
      // ------------------------------------------

      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      }

      // ------------------------------------------
      // Collaborative Participant
      // ------------------------------------------
      else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 7: Authorization
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // ==========================================
      // PERSONAL TASK
      //
      // Only the owner can restore a personal task.
      // ==========================================

      if (!isCollaborative && userRole !== "owner") {
        throw new Error("You do not have permission to restore this task");
      }

      // ==========================================
      // COLLABORATIVE TASK
      //
      // Owner and editor can restore the task.
      // Viewer/member cannot restore it.
      // ==========================================

      if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
        throw new Error("You do not have permission to restore this task");
      }

      // ==========================================
      // STEP 8: Create Task Activity
      //
      // Activity is created for both personal
      // and collaborative tasks.
      // ==========================================

      const activity = {
        todo: todo._id,
        actor: userId,

        // No specific target for a restore activity.
        targetUser: null,

        type: "TASK_RESTORED",

        message: `Task "${todo.title}" was restored.`,

        metadata: {
          oldValue: true,
          newValue: false,
          taskTitle: todo.title,
        },
      };

      const activities = await TaskActivity.insertMany([activity], { session });

      createdActivity = activities[0];

      // ==========================================
      // STEP 9: Restore Task
      //
      // Convert archived task back to active state.
      // ==========================================

      todo.isArchived = false;

      await todo.save({ session });

      restoredTask = todo;

      // ==========================================
      // STEP 10: Create Notifications
      //
      // Personal tasks have nobody else to notify.
      //
      // Collaborative tasks notify every participant
      // except the user who performed the restore.
      // ==========================================

      if (isCollaborative) {
        // ----------------------------------------
        // Get all participants except actor
        // ----------------------------------------

        const participantIds = todo.participants
          .map((participant) => participant.user)
          .filter(
            (participantId) => participantId.toString() !== userId.toString()
          );

        // ----------------------------------------
        // Include owner if owner is not already
        // present inside participants.
        // ----------------------------------------

        if (
          todo.createdBy.toString() !== userId.toString() &&
          !participantIds.some(
            (participantId) =>
              participantId.toString() === todo.createdBy.toString()
          )
        ) {
          participantIds.push(todo.createdBy);
        }

        // ----------------------------------------
        // Remove duplicate users
        // ----------------------------------------

        const uniqueParticipantIds = [
          ...new Map(
            participantIds.map((participantId) => [
              participantId.toString(),
              participantId,
            ])
          ).values(),
        ];

        // ----------------------------------------
        // Create Notifications
        // ----------------------------------------

        if (uniqueParticipantIds.length > 0) {
          notifications = await Notification.insertMany(
            uniqueParticipantIds.map((participantId) => ({
              // Notification receiver
              user: participantId,

              // User who restored the task
              sender: userId,

              type: "TASK_RESTORED",

              title: "Task Restored",

              message: `The task "${todo.title}" was restored.`,

              todo: todo._id,

              isRead: false,
            })),
            { session }
          );
        }
      }
    });

    // ==========================================
    // STEP 11: Emit Notifications
    //
    // Socket events are emitted AFTER the
    // transaction successfully commits.
    //
    // This prevents users from receiving a
    // notification for a transaction that failed.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 12: Emit Task Activity
    //
    // Only collaborative tasks have a task room.
    // ==========================================

    if (
      Array.isArray(restoredTask.participants) &&
      restoredTask.participants.length > 0
    ) {
      // ----------------------------------------
      // Notify task room about new activity
      // ----------------------------------------

      io.to(`task:${restoredTask._id.toString()}`).emit(
        "task:activity",
        createdActivity
      );

      // ----------------------------------------
      // Notify task room that task was restored
      // ----------------------------------------

      io.to(`task:${restoredTask._id.toString()}`).emit("task:restored", {
        todoId: restoredTask._id,
        restoredBy: userId,
      });
    }

    // ==========================================
    // STEP 13: Return Success Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, restoredTask, "Task restored successfully", true)
      );
  } catch (error) {
    console.error("restoreArchiveTask Error:", error);

    // ==========================================
    // STEP 14: Handle Task Not Found
    // ==========================================

    if (error.message === "Task not found") {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

    // ==========================================
    // STEP 15: Handle Participant Authorization
    // ==========================================

    if (error.message === "You are not a participant of this task") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 16: Handle Permission Errors
    // ==========================================

    if (error.message.includes("permission")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 17: Handle Unexpected Errors
    // ==========================================

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to restore task",
          false
        )
      );
  } finally {
    // ==========================================
    // STEP 18: Always Close MongoDB Session
    // ==========================================

    await session.endSession();
  }
};
export const restoreDeletedTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // ==========================================
    // STEP 1: Validate MongoDB Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    let restoredTask;
    let createdActivity = null;
    let notifications = [];

    // ==========================================
    // STEP 2: Start MongoDB Transaction
    //
    // Task restoration, activity creation and
    // notifications should succeed together.
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 3: Find Deleted Task
      //
      // Do not filter by createdBy here because
      // collaborative participants may also have
      // permission to restore the task.
      // ==========================================

      const todo = await SingleTodo.findOne({
        _id: id,
        isDeleted: true,
      }).session(session);

      // ==========================================
      // STEP 4: Check Task Exists
      // ==========================================

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 5: Determine Task Type
      //
      // A task is collaborative when it contains
      // one or more participants.
      // ==========================================

      const isCollaborative =
        Array.isArray(todo.participants) && todo.participants.length > 0;

      // ==========================================
      // STEP 6: Find Current User as Participant
      //
      // This is required only for collaborative
      // tasks.
      // ==========================================

      const participant = isCollaborative
        ? todo.participants.find(
            (participant) => participant.user.toString() === userId.toString()
          )
        : null;

      // ==========================================
      // STEP 7: Determine User Role
      // ==========================================

      let userRole = null;

      // ------------------------------------------
      // Task Owner
      // ------------------------------------------

      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      }

      // ------------------------------------------
      // Collaborative Participant
      // ------------------------------------------
      else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 8: Authorization
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // ==========================================
      // PERSONAL TASK
      //
      // Only the owner can restore a personal task.
      // ==========================================

      if (!isCollaborative && userRole !== "owner") {
        throw new Error("You do not have permission to restore this task");
      }

      // ==========================================
      // COLLABORATIVE TASK
      //
      // Owner and editor can restore the task.
      // Viewer/member cannot restore it.
      // ==========================================

      if (isCollaborative && userRole !== "owner" && userRole !== "editor") {
        throw new Error("You do not have permission to restore this task");
      }

      // ==========================================
      // STEP 9: Create Task Activity
      //
      // Activity is created for both personal and
      // collaborative tasks.
      // ==========================================

      const activity = {
        todo: todo._id,
        actor: userId,

        // No specific target user for restore activity.
        targetUser: null,

        type: "TASK_RESTORED",

        message: `Task "${todo.title}" was restored.`,

        metadata: {
          oldValue: true,
          newValue: false,
          taskTitle: todo.title,
        },
      };

      const activities = await TaskActivity.insertMany([activity], { session });

      createdActivity = activities[0];

      // ==========================================
      // STEP 10: Restore Deleted Task
      //
      // Reset soft-delete fields so the task becomes
      // active again.
      // ==========================================

      todo.isDeleted = false;
      todo.deletedAt = null;

      await todo.save({ session });

      restoredTask = todo;

      // ==========================================
      // STEP 11: Create Notifications
      //
      // Personal tasks do not have other users to
      // notify.
      //
      // Collaborative tasks notify all participants
      // except the user who restored the task.
      // ==========================================

      if (isCollaborative) {
        // ----------------------------------------
        // Get all participants except the actor
        // ----------------------------------------

        const participantIds = todo.participants
          .map((participant) => participant.user)
          .filter(
            (participantId) => participantId.toString() !== userId.toString()
          );

        // ----------------------------------------
        // Include owner if owner is not already
        // present inside participants.
        // ----------------------------------------

        if (
          todo.createdBy.toString() !== userId.toString() &&
          !participantIds.some(
            (participantId) =>
              participantId.toString() === todo.createdBy.toString()
          )
        ) {
          participantIds.push(todo.createdBy);
        }

        // ----------------------------------------
        // Remove duplicate users
        // ----------------------------------------

        const uniqueParticipantIds = [
          ...new Map(
            participantIds.map((participantId) => [
              participantId.toString(),
              participantId,
            ])
          ).values(),
        ];

        // ----------------------------------------
        // Create Notifications
        // ----------------------------------------

        if (uniqueParticipantIds.length > 0) {
          notifications = await Notification.insertMany(
            uniqueParticipantIds.map((participantId) => ({
              // Notification receiver
              user: participantId,

              // User who restored the task
              sender: userId,

              type: "TASK_RESTORED",

              title: "Task Restored",

              message: `The task "${todo.title}" was restored.`,

              todo: todo._id,

              isRead: false,
            })),
            { session }
          );
        }
      }
    });

    // ==========================================
    // STEP 12: Emit Notifications
    //
    // Socket events are emitted only after the
    // transaction successfully commits.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 13: Emit Task Activity
    //
    // Collaborative tasks have a dedicated
    // Socket.io task room.
    // ==========================================

    if (
      Array.isArray(restoredTask.participants) &&
      restoredTask.participants.length > 0
    ) {
      // ----------------------------------------
      // Notify task room about the activity
      // ----------------------------------------

      io.to(`task:${restoredTask._id.toString()}`).emit(
        "task:activity",
        createdActivity
      );

      // ----------------------------------------
      // Notify task room that task was restored
      // ----------------------------------------

      io.to(`task:${restoredTask._id.toString()}`).emit("task:restored", {
        todoId: restoredTask._id,
        restoredBy: userId,
      });
    }

    // ==========================================
    // STEP 14: Return Success Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, restoredTask, "Task restored successfully", true)
      );
  } catch (error) {
    console.error("restoreDeletedTask Error:", error);

    // ==========================================
    // STEP 15: Handle Task Not Found
    // ==========================================

    if (error.message === "Task not found") {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

    // ==========================================
    // STEP 16: Handle Participant Authorization
    // ==========================================

    if (error.message === "You are not a participant of this task") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 17: Handle Permission Errors
    // ==========================================

    if (error.message.includes("permission")) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, error.message, false));
    }

    // ==========================================
    // STEP 18: Handle Unexpected Errors
    // ==========================================

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to restore task",
          false
        )
      );
  } finally {
    // ==========================================
    // STEP 19: Always Close MongoDB Session
    // ==========================================

    await session.endSession();
  }
};
export const archiveTask = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // STEP 1: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    let task;

    await session.withTransaction(async () => {
      // STEP 2: Find task
      // Do NOT filter by createdBy here because
      // collaborative participants may also archive the task.
      task = await SingleTodo.findOne({
        _id: id,
        isArchived: false,
        isDeleted: false,
      }).session(session);

      // STEP 3: Check task exists
      if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
      }

      // STEP 4: Determine whether this is a collaborative task
      const isCollaborative = task.participants?.length > 0;

      let userRole = null;

      if (isCollaborative) {
        /*
         * Owner is stored in createdBy.
         */
        if (task.createdBy.toString() === userId) {
          userRole = "owner";
        } else {
          /*
           * Otherwise check participant role.
           */
          const participant = task.participants.find(
            (participant) => participant.user.toString() === userId
          );

          if (participant) {
            userRole = participant.role;
          }
        }

        // STEP 5: Permission check
        // Owner and editor can archive.
        if (userRole !== "owner" && userRole !== "editor") {
          const error = new Error(
            "You do not have permission to archive this task"
          );

          error.statusCode = 403;
          throw error;
        }
      } else {
        /*
         * Normal single task.
         *
         * Only the creator/owner can archive it.
         */
        if (task.createdBy.toString() !== userId) {
          const error = new Error(
            "You do not have permission to archive this task"
          );

          error.statusCode = 403;
          throw error;
        }

        userRole = "owner";
      }

      // STEP 6: Archive task
      task.isArchived = true;

      await task.save({ session });

      // STEP 7: Create activities and notifications
      if (isCollaborative) {
        /*
         * Notify every participant except the person
         * who performed the archive action.
         */
        const participantUserIds = task.participants
          .map((participant) => participant.user.toString())
          .filter((participantId) => participantId !== userId);

        const activities = participantUserIds.map((participantId) => ({
          todo: task._id,
          actor: userId,
          targetUser: participantId,
          type: "TASK_ARCHIVED",
          message: "Task was archived",
          metadata: {
            oldValue: false,
            newValue: true,
            role: userRole,
          },
        }));

        const notifications = participantUserIds.map((participantId) => ({
          user: participantId,
          sender: userId,
          type: "TASK_ARCHIVED",
          title: "Task Archived",
          message:
            userRole === "owner"
              ? "Task was archived by the owner"
              : "Task was archived by an editor",
          todo: task._id,
          isRead: false,
        }));

        // Only insert if there is something to insert
        if (activities.length > 0) {
          await TaskActivity.insertMany(activities, { session });
        }

        if (notifications.length > 0) {
          await Notification.insertMany(notifications, { session });
        }
      }
    });

    // STEP 8: Success response
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task archived successfully", true));
  } catch (error) {
    console.error("archiveTask error:", error);

    const statusCode = error.statusCode || 500;

    return res
      .status(statusCode)
      .json(
        new ApiResponse(
          statusCode,
          null,
          error.message || "Failed to archive task",
          false
        )
      );
  } finally {
    // STEP 9: Always close MongoDB session
    await session.endSession();
  }
};
export const shareTodo = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { email, role } = req.body;

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 1: Validate Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 2: Validate Email
    // ==========================================

    if (!email || !email.trim()) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email is required", false));
    }

    // ==========================================
    // STEP 3: Validate Role
    // ==========================================

    const allowedRoles = ["viewer", "contributor", "editor"];

    if (!role || !allowedRoles.includes(role)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid participant role", false));
    }

    const normalizedEmail = email.trim().toLowerCase();

    let task;
    let invitedUser;
    let invite;
    let notification;
    let activity;
    let message;

    // ==========================================
    // STEP 4: Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 4.1: Find Task
      // ==========================================

      task = await SingleTodo.findOne({
        _id: id,
        createdBy: userId,
        isArchived: false,
        isDeleted: false,
      }).session(session);

      if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
      }

      // ==========================================
      // STEP 4.2: Find Invited User
      // ==========================================

      invitedUser = await User.findOne({
        email: normalizedEmail,
      })
        .select("_id name email profileImage")
        .session(session);

      if (!invitedUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      // ==========================================
      // STEP 4.3: Prevent Self Invitation
      // ==========================================

      if (invitedUser._id.toString() === userId) {
        const error = new Error("You cannot invite yourself");

        error.statusCode = 400;
        throw error;
      }

      // ==========================================
      // STEP 4.4: Check Friendship
      // ==========================================

      const isFriend = await User.exists({
        _id: userId,
        friends: invitedUser._id,
      });

      if (!isFriend) {
        const error = new Error("User is not in your friend list");

        error.statusCode = 403;
        throw error;
      }

      // ==========================================
      // STEP 4.5: Check Existing Member
      // ==========================================

      const alreadyMember = task.participants.some(
        (participant) =>
          participant.user.toString() === invitedUser._id.toString()
      );

      if (alreadyMember) {
        const error = new Error("User is already a member of this task");

        error.statusCode = 409;
        throw error;
      }

      // ==========================================
      // STEP 4.6: Check Existing Pending Invitation
      // ==========================================

      const pendingInvite = await Invite.findOne({
        todo: task._id,
        invitedUser: invitedUser._id,
        status: "PENDING",
      }).session(session);

      if (pendingInvite) {
        const error = new Error("User already has a pending invitation");

        error.statusCode = 409;
        throw error;
      }

      // ==========================================
      // STEP 4.7: Create Invitation
      // ==========================================

      [invite] = await Invite.create(
        [
          {
            todo: task._id,
            invitedBy: userId,
            invitedUser: invitedUser._id,
            role,
            status: "PENDING",
          },
        ],
        { session }
      );

      // ==========================================
      // STEP 4.8: Create Notification
      // ==========================================

      [notification] = await Notification.create(
        [
          {
            user: invitedUser._id,
            sender: userId,
            type: "TASK_INVITE",
            title: "Task Invitation",
            message: `${req.user.name} invited you to join "${task.title}" as ${role}.`,
            todo: task._id,
            invite: invite._id,
            isRead: false,
          },
        ],
        { session }
      );

      // ==========================================
      // STEP 4.9: Create Task Activity
      // ==========================================

      [activity] = await TaskActivity.create(
        [
          {
            todo: task._id,
            actor: userId,
            targetUser: invitedUser._id,
            type: "MEMBER_INVITED",
            message: `${req.user.name} invited ${invitedUser.name} to join the task as ${role}.`,
            metadata: {
              extra: {
                role,
                invitedUserId: invitedUser._id,
                inviteId: invite._id,
              },
            },
          },
        ],
        { session }
      );

      // ==========================================
      // STEP 4.10: Create Chat Message
      // ==========================================

      [message] = await Message.create(
        [
          {
            sender: userId,
            type: "TASK_INVITE",
            invite: invite._id,
            todo: task._id,
            content: `${req.user.name} invited ${invitedUser.name} as ${role}.`,
          },
        ],
        { session }
      );
    });

    // ==========================================
    // STEP 5: Emit Notification
    // ==========================================

    req.io.to(`user:${invitedUser._id.toString()}`).emit("notification", {
      type: "TASK_INVITE",

      notification: {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      },

      sender: {
        _id: req.user.userId,
        name: req.user.name,
        profileImage: req.user.profileImage,
      },
    });

    // ==========================================
    // STEP 6: Emit New Invitation
    // ==========================================

    req.io.to(`user:${invitedUser._id.toString()}`).emit("invite:new", {
      invite: {
        _id: invite._id,
        role: invite.role,
        status: invite.status,
      },

      task: {
        _id: task._id,
        title: task.title,
      },

      sender: {
        _id: req.user.userId,
        name: req.user.name,
        profileImage: req.user.profileImage,
      },
    });

    // ==========================================
    // STEP 7: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 8: Emit Task Update
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:updated", {
      action: "MEMBER_INVITED",

      taskId: task._id,

      participant: {
        _id: invitedUser._id,
        name: invitedUser.name,
        email: invitedUser.email,
        role,
      },

      invitedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 9: Emit Chat Message
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("message:new", {
      message: {
        _id: message._id,
        type: message.type,
        content: message.content,

        sender: {
          _id: req.user.userId,
          name: req.user.name,
          profileImage: req.user.profileImage,
        },

        createdAt: message.createdAt,
      },
    });

    // ==========================================
    // STEP 10: Response
    // ==========================================

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          invite,
          notification,
          activity,
        },
        "Invitation sent successfully",
        true
      )
    );
  } catch (error) {
    console.error("Share Todo Error:", error);

    const statusCode = error.statusCode || 500;

    return res
      .status(statusCode)
      .json(
        new ApiResponse(
          statusCode,
          null,
          error.message || "Failed to share task",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};
export const getTodoMembers = async (req, res) => {
  try {
    const { id } = req.params;

    // ==========================================
    // STEP 1: VALIDATE TODO ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid todo ID", false));
    }

    // ==========================================
    // STEP 2: FIND TODO
    // ==========================================

    const task = await SingleTodo.findOne({
      _id: id,
      isArchived: false,
      isDeleted: false,
      $or: [
        // Task owner
        {
          createdBy: req.user.userId,
        },

        // Task participant
        {
          "participants.user": req.user.userId,
        },
      ],
    })
      .populate("participants.user", "name email profileImage bio")
      .populate("createdBy", "name email profileImage bio")
      .select("title createdBy participants");

    // ==========================================
    // STEP 3: CHECK TODO EXISTS
    // ==========================================

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Todo not found", false));
    }

    // ==========================================
    // STEP 4: RETURN MEMBERS
    // ==========================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          taskId: task._id,
          title: task.title,

          owner: task.createdBy,

          members: task.participants,
        },
        "Todo members fetched successfully",
        true
      )
    );
  } catch (error) {
    console.error("Get Todo Members Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch todo members", false));
  }
};
export const updateTodoMemberRole = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id, memberId } = req.params;
    const { role } = req.body;

    // ==========================================
    // STEP 1: VALIDATE IDS
    // ==========================================

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Invalid task ID or member ID", false)
        );
    }

    // ==========================================
    // STEP 2: VALIDATE ROLE
    // ==========================================

    const allowedRoles = ["viewer", "contributor", "editor"];

    if (!allowedRoles.includes(role)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid role. Allowed roles are viewer, contributor, and editor",
            false
          )
        );
    }

    const userId = req.user.userId;

    let updatedMember = null;
    let activity = null;
    let notification = null;

    // ==========================================
    // STEP 3: START TRANSACTION
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 4: FIND TASK
      // ==========================================

      const task = await SingleTodo.findOne({
        _id: id,
        createdBy: userId,
        isArchived: false,
        isDeleted: false,
        "participants.user": memberId,
      }).session(session);

      // ==========================================
      // STEP 5: CHECK TASK
      // ==========================================

      if (!task) {
        throw new Error("TASK_NOT_FOUND");
      }

      // ==========================================
      // STEP 6: FIND MEMBER
      // ==========================================

      const member = task.participants.find(
        (participant) => participant.user.toString() === memberId
      );

      if (!member) {
        throw new Error("MEMBER_NOT_FOUND");
      }

      // ==========================================
      // STEP 7: PREVENT OWNER ROLE CHANGE
      // ==========================================

      if (member.role === "owner") {
        throw new Error("OWNER_ROLE_CANNOT_BE_CHANGED");
      }

      // ==========================================
      // STEP 8: CHECK SAME ROLE
      // ==========================================

      if (member.role === role) {
        throw new Error("SAME_ROLE");
      }

      // ==========================================
      // STEP 9: STORE OLD ROLE
      // ==========================================

      const oldRole = member.role;

      // ==========================================
      // STEP 10: UPDATE MEMBER ROLE
      // ==========================================

      member.role = role;

      await task.save({ session });

      // ==========================================
      // STEP 11: CREATE TASK ACTIVITY
      // ==========================================

      const createdActivity = await TaskActivity.create(
        [
          {
            todo: task._id,
            actor: userId,
            targetUser: memberId,
            type: "ROLE_CHANGED",
            message: `Owner changed member role from ${oldRole} to ${role}`,
            metadata: {
              oldValue: oldRole,
              newValue: role,
            },
          },
        ],
        { session }
      );

      activity = createdActivity[0];

      // ==========================================
      // STEP 12: CREATE NOTIFICATION
      // ==========================================

      const createdNotification = await Notification.create(
        [
          {
            user: memberId,
            sender: userId,
            type: "TASK_UPDATED",
            title: "Role Changed",
            message: `Your role was changed from ${oldRole} to ${role}`,
            todo: task._id,
          },
        ],
        { session }
      );

      notification = createdNotification[0];

      // ==========================================
      // STEP 13: PREPARE RESPONSE
      // ==========================================

      updatedMember = {
        user: member.user,
        oldRole,
        newRole: role,
      };
    });

    // ==========================================
    // STEP 14: EMIT TASK ACTIVITY
    // ==========================================

    io.to(`task:${id}`).emit("activity", activity);

    // ==========================================
    // STEP 15: EMIT NOTIFICATION TO MEMBER
    // ==========================================

    io.to(`user:${memberId}`).emit("notification", notification);

    // ==========================================
    // STEP 16: RETURN SUCCESS RESPONSE
    // ==========================================

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          member: updatedMember,
          activity,
          notification,
        },
        "Member role updated successfully",
        true
      )
    );
  } catch (error) {
    // ==========================================
    // KNOWN ERRORS
    // ==========================================

    if (error.message === "TASK_NOT_FOUND") {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "Task not found or you do not have permission",
            false
          )
        );
    }

    if (error.message === "MEMBER_NOT_FOUND") {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Member not found", false));
    }

    if (error.message === "OWNER_ROLE_CANNOT_BE_CHANGED") {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "The owner's role cannot be changed",
            false
          )
        );
    }

    if (error.message === "SAME_ROLE") {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Member already has this role", false)
        );
    }

    // ==========================================
    // UNEXPECTED ERROR
    // ==========================================

    console.error("Update Todo Member Role Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update member role", false));
  } finally {
    // ==========================================
    // END SESSION
    // ==========================================

    await session.endSession();
  }
};