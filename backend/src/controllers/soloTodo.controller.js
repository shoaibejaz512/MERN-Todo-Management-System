import { SingleTodo } from "../models/singleTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import todoAIService from "../service/ai.service.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Notification } from "../models/notification.model.js";
import { TaskActivity } from "../models/taskactivity.model.js";

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
      // STEP 3: Find Single Todo
      // ==========================================

      todo = await SingleTodo.findOne({
        _id: id,

        // Task must not be deleted
        isDeleted: false,

        // Task must not be archived
        isArchived: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 4: Find Current User's Participant Role
      // ==========================================

      const participant = todo.participants.find(
        (participant) => participant.user.toString() === userId.toString()
      );

      // ==========================================
      // IMPORTANT:
      //
      // If the task creator is not present in the
      // participants array, treat them as owner.
      // ==========================================

      let userRole = null;

      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      } else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 5: Check Authorization
      // ==========================================

      if (!userRole) {
        throw new Error("You are not a participant of this task");
      }

      // Viewer cannot update anything
      if (userRole === "viewer") {
        throw new Error("You do not have permission to update this task");
      }

      // ==========================================
      // STEP 6: Prepare Activity Array
      // ==========================================

      const activities = [];

      // ==========================================
      // TITLE
      // Owner + Editor can update
      // ==========================================

      if (title !== undefined && title !== todo.title) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor can update
      // ==========================================

      if (description !== undefined && description !== todo.description) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor can update
      // ==========================================

      if (priority !== undefined && priority !== todo.priority) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor can update
      // ==========================================

      if (
        estimatedHours !== undefined &&
        estimatedHours !== todo.estimatedHours
      ) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor can update
      // ==========================================

      if (
        deadline !== undefined &&
        String(deadline) !== String(todo.deadline)
      ) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor can update
      // ==========================================

      if (
        tags !== undefined &&
        JSON.stringify(tags) !== JSON.stringify(todo.tags)
      ) {
        if (userRole !== "owner" && userRole !== "editor") {
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
      // Owner + Editor + Contributor
      // can update task status.
      // ==========================================

      if (status !== undefined && status !== todo.status) {
        if (
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
      // STEP 7: Check Whether Anything Changed
      // ==========================================

      if (activities.length === 0) {
        return;
      }

      // ==========================================
      // STEP 8: Save Updated Task
      // ==========================================

      await todo.save({ session });

      // ==========================================
      // STEP 9: Create Task Activities
      // ==========================================

      createdActivities = await TaskActivity.insertMany(activities, {
        session,
      });

      // ==========================================
      // STEP 10: Get Users Who Should Receive
      // Notification
      //
      // We notify all participants except the
      // person who performed the update.
      // ==========================================

      const participantIds = todo.participants
        .map((participant) => participant.user)
        .filter(
          (participantId) => participantId.toString() !== userId.toString()
        );

      // ==========================================
      // Include owner if owner is not inside
      // participants array.
      // ==========================================

      if (
        todo.createdBy.toString() !== userId.toString() &&
        !participantIds.some(
          (participantId) =>
            participantId.toString() === todo.createdBy.toString()
        )
      ) {
        participantIds.push(todo.createdBy);
      }

      // ==========================================
      // STEP 11: Create Notifications
      // ==========================================

      if (participantIds.length > 0) {
        notifications = await Notification.insertMany(
          participantIds.map((participantId) => ({
            user: participantId,
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
    });

    // ==========================================
    // STEP 12: No Changes Made
    // ==========================================

    if (createdActivities.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, todo, "No changes were made to the task.", true)
        );
    }

    // ==========================================
    // STEP 13: Emit Notifications
    //
    // IMPORTANT:
    // Emit only after transaction commits.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 14: Emit Activities
    //
    // All users connected to this task room
    // can receive the activity.
    // ==========================================

    for (const activity of createdActivities) {
      io.to(`task:${todo._id.toString()}`).emit("task:activity", activity);
    }

    // ==========================================
    // STEP 15: Success Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Task updated successfully.", true));
  } catch (error) {
    console.error("updateTask Error:", error);

    // ==========================================
    // Handle Authorization / Not Found Errors
    // ==========================================

    if (
      error.message === "Task not found" ||
      error.message === "You are not a participant of this task"
    ) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, error.message, false));
    }

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
          error.message || "Failed to update task",
          false
        )
      );
  } finally {
    // Always close MongoDB session
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
    let createdActivity = null;
    let notifications = [];

    // ==========================================
    // STEP 3: Start MongoDB Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ==========================================
      // STEP 4: Find Group Todo
      // ==========================================

      todo = await GroupTodo.findOne({
        _id: id,

        // Task must not be deleted
        isDeleted: false,

        // Task must not be archived
        isArchived: false,
      }).session(session);

      if (!todo) {
        throw new Error("Task not found");
      }

      // ==========================================
      // STEP 5: Find Current User's Participant
      // ==========================================

      const participant = todo.participants.find(
        (participant) => participant.user.toString() === userId.toString()
      );

      // ==========================================
      // IMPORTANT:
      //
      // If creator is not inside participants,
      // treat creator as owner.
      // ==========================================

      let userRole = null;

      if (todo.createdBy.toString() === userId.toString()) {
        userRole = "owner";
      } else if (participant) {
        userRole = participant.role;
      }

      // ==========================================
      // STEP 6: Check Authorization
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
      // STEP 7: Check Whether Status Changed
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
      // STEP 9: Create Task Activity
      // ==========================================

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

      const activities = await TaskActivity.insertMany([activity], { session });

      createdActivity = activities[0];

      // ==========================================
      // STEP 10: Get Notification Recipients
      //
      // Notify all participants except the actor.
      // ==========================================

      const participantIds = todo.participants
        .map((participant) => participant.user)
        .filter(
          (participantId) => participantId.toString() !== userId.toString()
        );

      // ==========================================
      // Include owner if owner is not already
      // inside participants array.
      // ==========================================

      if (
        todo.createdBy.toString() !== userId.toString() &&
        !participantIds.some(
          (participantId) =>
            participantId.toString() === todo.createdBy.toString()
        )
      ) {
        participantIds.push(todo.createdBy);
      }

      // ==========================================
      // STEP 11: Create Notifications
      // ==========================================

      if (participantIds.length > 0) {
        notifications = await Notification.insertMany(
          participantIds.map((participantId) => ({
            // Notification receiver
            user: participantId,

            // Person who changed the status
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
    });

    // ==========================================
    // STEP 12: No Status Change
    // ==========================================

    if (!createdActivity) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, todo, "Task status is already up to date.", true)
        );
    }

    // ==========================================
    // STEP 13: Emit Notifications
    //
    // IMPORTANT:
    // Emit only AFTER transaction commits.
    // ==========================================

    for (const notification of notifications) {
      io.to(`user:${notification.user.toString()}`).emit(
        "notification",
        notification
      );
    }

    // ==========================================
    // STEP 14: Emit Task Activity
    //
    // Everyone inside the task room receives it.
    // ==========================================

    io.to(`task:${todo._id.toString()}`).emit("task:activity", createdActivity);

    // ==========================================
    // STEP 15: Success Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, todo, "Task status updated successfully.", true)
      );
  } catch (error) {
    console.error("updateTaskStatus Error:", error);

    // ==========================================
    // Handle Not Found / Authorization Errors
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
    // Always close MongoDB session
    // ==========================================

    await session.endSession();
  }
};
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    // STEP 1: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // STEP 2: Find and delete the task
    const deletedTask = await SingleTodo.findOne({
      _id: id,
      createdBy: req.user.userId,
    });

    // STEP 3: Task not found
    if (!deletedTask) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    deletedTask.isDeleted = true;
    deletedTask.deletedAt = new Date();
    await deletedTask.save();

    // STEP 4: Success response
    return res
      .status(200)
      .json(
        new ApiResponse(200, deletedTask, "Task deleted successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
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
      isArchived: true,
      isDeleted: false,
    });

    //STEP:3 CHECK THE TASK IS FOUND OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:5 RESTORE THAT TASK
    task.isArchived = false;
    await task.save();

    //STEP:6 RETURN SUCCESS MESSAGE TO THE USER
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task restored successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

export const restoreDeletedTask = async (req, res) => {
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
      isDeleted: true,
    });

    //STEP:3 CHECK THE TASK IS FOUND OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    task.isDeleted = false;
    task.deletedAt = null;
    await task.save();

    //STEP:6 RETURN SUCCESS MESSAGE TO THE USER
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Deleted Task Restore ", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

export const archiveTask = async (req, res) => {
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
      isArchived: false,
      isDeleted: false,
    });

    //STEP:3 CHECK THE TASK IS FOUND OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:5 RESTORE THAT TASK
    task.isArchived = true;
    await task.save();

    //STEP:6 RETURN SUCCESS MESSAGE TO THE USER
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task archive successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
