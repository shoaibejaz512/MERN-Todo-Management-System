import mongoose from "mongoose";
import ApiResponse from "../utils/apiResponseHandler.js";
import { Todo } from "../models/todo.model.js";
import { SubTodo } from "../models/subTodo.model.js";
import { User } from "../models/user.model.js";
import todoAIService from "../service/ai.service.js";
import { Message } from "../models/chat.model.js";
import { Invite } from "../models/invite.model.js";
import { io } from "../../server.js";
import { Notification } from "../models/notification.model.js";
import { Comment } from "../models/comment.model.js";
import {TaskActivity} from "../models/taskactivity.model.js";

const createGroupTodo = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      title,
      description,
      source,
      priority,
      estimatedHours,
      deadline,
      tags,
      subTasks,
    } = req.body;

    // STEP 1: Validate Main Task
    if (
      !title ||
      !description ||
      !Array.isArray(subTasks) ||
      subTasks.length === 0
    ) {
      await session.abortTransaction();

      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Title, description and at least one subtask are required.",
            false
          )
        );
    }

    // STEP 2: Validate SubTasks
    for (const task of subTasks) {
      if (!task.title || !task.description) {
        await session.abortTransaction();

        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Every subtask must contain title and description.",
              false
            )
          );
      }
    }

    // STEP 3: Create SubTodos
    const createdSubTodos = await SubTodo.insertMany(
      subTasks.map((task) => ({
        ...task,
        createdBy: req.user.userId,
      })),
      { session }
    );

    const subTodoIds = createdSubTodos.map((todo) => todo._id);

    // STEP 4: Create Group Task
    const createdTodo = await Todo.create(
      [
        {
          title,
          description,
          source,
          priority,
          estimatedHours,
          deadline,
          tags,
          SubTodos: subTodoIds,
          createdBy: req.user.userId,
          source: "manual",
          participants: [
            {
              user: req.user.userId,
              role: "owner",
            },
          ],
        },
      ],
      { session }
    );

    const todo = createdTodo[0];

    // STEP 5: Update SubTodos with Group ID
    await SubTodo.updateMany(
      {
        _id: {
          $in: subTodoIds,
        },
      },
      {
        $set: {
          groupId: todo._id,
        },
      },
      { session }
    );

    // STEP 6: Update User
    await User.findByIdAndUpdate(
      req.user.userId,
      {
        $push: {
          groupTasks: todo._id,
        },
        $inc: {
          totalGroupTasks: 1,
        },
      },
      { session }
    );

    // ========================================== // STEP 7: Create Task Activity // ==========================================  //
    const [activity] = await TaskActivity.create(
      [
        {
          todo: todo._id,
          actor: req.user.userId,
          targetUser: null,
          type: "TASK_CREATED",
          message: "A new group task was created.",
          metadata: {
            extra: {
              title: todo.title,
              subTaskCount: subTodoIds.length,
              source: todo.source,
            },
          },
        },
      ],
      { session }
    );

    // STEP 7: Commit Transaction
    await session.commitTransaction();

    //STEP:8 EMIT SOCKET EVENT FOR TASK CREATED
    const notification = new Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_CREATED",
      title: "Task Created",
      message: "You have created a new task",
      todo: todo._id,
      isRead: false,
    });

    io.to(`user:${req.user.userId.toString()}`).emit(
      "notification",
      notification
    );

    //STEP:9 RETURN SUCCESS MESSAGE

    return res
      .status(201)
      .json(
        new ApiResponse(201, todo, "Group task created successfully.", true)
      );
  } catch (error) {
    // Rollback Everything
    await session.abortTransaction();

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    // End Session
    session.endSession();
  }
};
const generateAIGroupTodo = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    const groupTodo = await todoAIService.generateGroupTodo(prompt);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          groupTodo,
          "Group Todo Generated Successfully",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const saveAIGroupTodo = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      subTasks,
    } = req.body;

    // ==========================================
    // STEP 1: Validate Main Task
    // ==========================================

    if (
      !title ||
      !description ||
      !Array.isArray(subTasks) ||
      subTasks.length === 0
    ) {
      await session.abortTransaction();

      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Title, description and at least one subtask are required.",
            false
          )
        );
    }

    // ==========================================
    // STEP 2: Validate SubTasks
    // ==========================================

    for (const task of subTasks) {
      if (!task.title || !task.description) {
        await session.abortTransaction();

        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Every subtask must contain title and description.",
              false
            )
          );
      }
    }

    // ==========================================
    // STEP 3: Create SubTodos
    // ==========================================

    const createdSubTodos = await SubTodo.insertMany(
      subTasks.map((task) => ({
        ...task,
        createdBy: req.user.userId,
      })),
      { session }
    );

    const subTodoIds = createdSubTodos.map((todo) => todo._id);

    // ==========================================
    // STEP 4: Create AI Group Task
    // ==========================================

    const createdTodo = await Todo.create(
      [
        {
          title,
          description,
          source: "ai",
          priority,
          estimatedHours,
          deadline,
          tags,
          SubTodos: subTodoIds,
          createdBy: req.user.userId,

          participants: [
            {
              user: req.user.userId,
              role: "owner",
            },
          ],
        },
      ],
      { session }
    );

    const todo = createdTodo[0];

    // ==========================================
    // STEP 5: Update SubTodos with Group ID
    // ==========================================

    await SubTodo.updateMany(
      {
        _id: {
          $in: subTodoIds,
        },
      },
      {
        $set: {
          groupId: todo._id,
        },
      },
      { session }
    );

    // ==========================================
    // STEP 6: Update User
    // ==========================================

    await User.findByIdAndUpdate(
      req.user.userId,
      {
        $push: {
          groupTasks: todo._id,
        },
        $inc: {
          totalGroupTasks: 1,
        },
      },
      {
        session,
        new: true,
      }
    );

    // ==========================================
    // STEP 7: Create Task Activity
    // ==========================================

    const [activity] = await TaskActivity.create(
      [
        {
          todo: todo._id,
          actor: req.user.userId,
          targetUser: null,

          type: "TASK_CREATED",

          message: "An AI-generated group task was created.",

          metadata: {
            extra: {
              source: "ai",
              subTaskCount: subTodoIds.length,
            },
          },
        },
      ],
      { session }
    );

    // ==========================================
    // STEP 8: Commit Transaction
    // ==========================================

    await session.commitTransaction();

    // ==========================================
    // STEP 9: Create Notification
    // ==========================================

    const notification = await Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_CREATED",
      title: "AI Task Created",
      message: "Your AI-generated task has been created successfully.",
      todo: todo._id,
      isRead: false,
    });

    // ==========================================
    // STEP 10: Emit Notification
    // ==========================================

    io.to(`user:${req.user.userId.toString()}`).emit(
      "notification",
      notification
    );

    // ==========================================
    // STEP 11: Return Response
    // ==========================================

    return res
      .status(201)
      .json(
        new ApiResponse(201, todo, "AI group task created successfully.", true)
      );
  } catch (error) {
    await session.abortTransaction();

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    await session.endSession();
  }
};
const updateGroupTodo = async (req, res) => {
  const { id } = req.params;

  try {
    const {
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      status,
    } = req.body;

    // ==========================================
    // STEP 1: Validate ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 2: Find Task
    // ==========================================

    const todo = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    if (!todo) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // ==========================================
    // STEP 3: Track Activities
    // ==========================================

    const activities = [];

    // ------------------------------------------
    // TITLE
    // ------------------------------------------

    if (title !== undefined && title !== todo.title) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "TITLE_UPDATED",
        message: "Task title was updated.",
        metadata: {
          oldValue: todo.title,
          newValue: title,
        },
      });

      todo.title = title;
    }

    // ------------------------------------------
    // DESCRIPTION
    // ------------------------------------------

    if (description !== undefined && description !== todo.description) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "DESCRIPTION_UPDATED",
        message: "Task description was updated.",
        metadata: {
          oldValue: todo.description,
          newValue: description,
        },
      });

      todo.description = description;
    }

    // ------------------------------------------
    // PRIORITY
    // ------------------------------------------

    if (priority !== undefined && priority !== todo.priority) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "PRIORITY_UPDATED",
        message: "Task priority was updated.",
        metadata: {
          oldValue: todo.priority,
          newValue: priority,
        },
      });

      todo.priority = priority;
    }

    // ------------------------------------------
    // ESTIMATED HOURS
    // ------------------------------------------

    if (
      estimatedHours !== undefined &&
      estimatedHours !== todo.estimatedHours
    ) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "TASK_UPDATED",
        message: "Estimated hours were updated.",
        metadata: {
          oldValue: todo.estimatedHours,
          newValue: estimatedHours,
        },
      });

      todo.estimatedHours = estimatedHours;
    }

    // ------------------------------------------
    // DEADLINE
    // ------------------------------------------

    if (deadline !== undefined && String(deadline) !== String(todo.deadline)) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "DEADLINE_UPDATED",
        message: "Task deadline was updated.",
        metadata: {
          oldValue: todo.deadline,
          newValue: deadline,
        },
      });

      todo.deadline = deadline;
    }

    // ------------------------------------------
    // TAGS
    // ------------------------------------------

    if (
      tags !== undefined &&
      JSON.stringify(tags) !== JSON.stringify(todo.tags)
    ) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
        type: "TASK_UPDATED",
        message: "Task tags were updated.",
        metadata: {
          oldValue: todo.tags,
          newValue: tags,
        },
      });

      todo.tags = tags;
    }

    // ------------------------------------------
    // STATUS
    // ------------------------------------------

    if (status !== undefined && status !== todo.status) {
      activities.push({
        todo: todo._id,
        actor: req.user.userId,
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
    // STEP 4: Check whether anything changed
    // ==========================================

    if (activities.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, todo, "No changes were made to the task.", true)
        );
    }

    // ==========================================
    // STEP 5: Save Task
    // ==========================================

    await todo.save();

    // ==========================================
    // STEP 6: Save Activities
    // ==========================================

    const createdActivities = await TaskActivity.insertMany(activities);

    // ==========================================
    // STEP 7: Create Notification
    // ==========================================

    const notification = await Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_UPDATED",
      title: "Task Updated",
      message: "Your task was updated successfully.",
      todo: todo._id,
      isRead: false,
    });

    // ==========================================
    // STEP 8: Emit Notification
    // ==========================================

    io.to(`user:${req.user.userId}`).emit("notification", notification);

    // ==========================================
    // STEP 9: Emit Activity to Task Room
    // ==========================================

    for (const activity of createdActivities) {
      io.to(`task:${todo._id}`).emit("task:activity", activity);
    }

    // ==========================================
    // STEP 10: Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Task updated successfully.", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const updateGroupTodoStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // STEP 1: Validate Task ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // STEP 2: Validate Status
    const validStatus = [
      "START",
      "PENDING",
      "ON_GOING",
      "COMPLETED",
      "IN_COMPLETE",
    ];

    if (!status || !validStatus.includes(status)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task status", false));
    }

    // STEP 3: Find Task
    const todo = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    });

    if (!todo) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const userId = req.user.userId.toString();

    // participants contains owner for group tasks
    const isGroupTask = todo.participants?.length > 0;

    // STEP 4: Authorization
    if (!isGroupTask) {
      // ==============================
      // PERSONAL TASK
      // ==============================

      if (todo.createdBy.toString() !== userId) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "You are not authorized to update this task.",
              false
            )
          );
      }
    } else {
      // ==============================
      // GROUP TASK
      // ==============================

      let role = "owner";

      if (todo.createdBy.toString() !== userId) {
        const participant = todo.participants.find(
          (p) => p.user.toString() === userId
        );

        if (!participant) {
          return res
            .status(403)
            .json(
              new ApiResponse(
                403,
                null,
                "You are not a participant of this task.",
                false
              )
            );
        }

        role = participant.role;
      }

      if (!["owner", "editor", "contributor"].includes(role)) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "You don't have permission to update this task.",
              false
            )
          );
      }
    }

    // STEP 5: Prevent duplicate update
    if (todo.status === status) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Task is already marked as ${status}.`,
            false
          )
        );
    }

    const previousStatus = todo.status;

    // STEP 6: Update Status
    todo.status = status;

    await todo.save();

    // ==================================================
    // STEP 7: GROUP TASK ONLY
    // Activity + Notification + Socket
    // ==================================================

    if (isGroupTask) {
      // ------------------------------------------
      // Create Activity
      // ------------------------------------------

      const activity = await TaskActivity.create({
        todo: todo._id,
        actor: req.user.userId,
        targetUser: null,

        type: "STATUS_UPDATED",

        message: `${req.user.name} changed the task status from ${previousStatus} to ${status}.`,

        metadata: {
          oldValue: previousStatus,
          newValue: status,
        },
      });

      // ------------------------------------------
      // Get Other Participants
      // ------------------------------------------

      const recipients = [
        todo.createdBy.toString(),
        ...todo.participants.map((p) => p.user.toString()),
      ];

      const uniqueRecipients = [...new Set(recipients)].filter(
        (id) => id !== userId
      );

      // ------------------------------------------
      // Create Notifications
      // ------------------------------------------

      if (uniqueRecipients.length > 0) {
        const notifications = uniqueRecipients.map((receiverId) => ({
          user: receiverId,
          sender: req.user.userId,
          todo: todo._id,
          type: "TASK_STATUS_UPDATED",
          title: "Task Status Updated",
          message: `${req.user.name} changed the task status from ${previousStatus} to ${status}.`,
          isRead: false,
        }));

        await Notification.insertMany(notifications);
      }

      // ------------------------------------------
      // Realtime Activity
      // ------------------------------------------

      req.io.to(`task:${todo._id}`).emit("task:activity", activity);

      // ------------------------------------------
      // Realtime Status Update
      // ------------------------------------------

      req.io.to(`task:${todo._id}`).emit("task:status-updated", {
        taskId: todo._id,
        previousStatus,
        currentStatus: status,
        updatedBy: {
          _id: req.user.userId,
          name: req.user.name,
        },
      });
    }

    // STEP 8: Response
    return res
      .status(200)
      .json(
        new ApiResponse(200, todo, "Task status updated successfully.", true)
      );
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const deleteGroupTodo = async (req, res) => {
  try {
    const { id } = req.params;

    // ==========================================
    // STEP 1: Validate Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 2: Find Task
    // Only owner can delete
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isArchived: false,
      isDeleted: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 3: Determine Task Type
    // ==========================================

    const isGroupTask = task.participants?.length > 0;

    // ==========================================
    // STEP 4: Soft Delete Task
    // ==========================================

    task.isDeleted = true;
    task.deletedAt = new Date();

    await task.save();

    // ==========================================
    // STEP 5: Personal Task
    // No Activity
    // No Notification
    // No Socket
    // ==========================================

    if (!isGroupTask) {
      return res
        .status(200)
        .json(new ApiResponse(200, task, "Task deleted successfully.", true));
    }

    // ==========================================
    // STEP 6: Create Task Activity
    // Group Task Only
    // ==========================================

    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: null,

      type: "TASK_DELETED",

      message: `${req.user.name} deleted the task.`,

      metadata: {
        extra: {
          action: "DELETE",
        },
      },
    });

    // ==========================================
    // STEP 7: Get All Group Members
    // ==========================================

    const recipients = [
      task.createdBy.toString(),

      ...task.participants.map((participant) => participant.user.toString()),
    ];

    // Remove duplicates
    // Don't notify the person who deleted the task
    const uniqueRecipients = [...new Set(recipients)].filter(
      (receiverId) => receiverId !== userId
    );

    // ==========================================
    // STEP 8: Create Notifications
    // ==========================================

    if (uniqueRecipients.length > 0) {
      const notifications = uniqueRecipients.map((receiverId) => ({
        user: receiverId,
        sender: req.user.userId,
        todo: task._id,

        type: "TASK_REMOVED",

        title: "Task Deleted",

        message: `${req.user.name} deleted the task "${task.title}".`,

        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    // ==========================================
    // STEP 9: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 10: Emit Task Deleted Event
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:deleted", {
      taskId: task._id,
      deletedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 11: Return Success
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task deleted successfully.", true));
  } catch (error) {
    console.error("Delete Todo Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const getAllGroupTodos = async (req, res) => {
  try {
    //STEP:1 GET ALL GROUP TASKS
    const tasks = new Todo.find({
      isDeleted: false,
      isArchived: false,
      createdBy: req.user.userId,
    });

    //STEP:2 CHECK THE TASKS IS GET OR NOT
    if (!tasks) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Tasks not found"));
    }

    //STEP:3 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, tasks, "Tasks get successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const getGroupTodoById = async (req, res) => {
  try {
    //STEP:1 GET THE DOCUMENT ID FROM PARAMS
    const { id } = req.params;

    //STEP:2 VALIDATE TEH ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task ID Invalid", false));
    }

    //STEP:2 FIND THE PARTICULOR ID
    const task = new Todo.findById({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    //STEP:2 CHECK THE TASKS IS GET OR NOT
    if (!tasks) {
      return res.status(404).json(new ApiResponse(404, null, "Task not found"));
    }

    //STEP:3 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task get successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const archiveGroupTodo = async (req, res) => {
  try {
    // ==========================================
    // STEP 1: Get Task ID
    // ==========================================

    const { id } = req.params;

    // ==========================================
    // STEP 2: Validate Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 3: Find Task
    // Only owner can archive
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 4: Determine Task Type
    // ==========================================

    const isGroupTask = task.participants?.length > 0;

    // ==========================================
    // STEP 5: Archive Task
    // ==========================================

    task.isArchived = true;
    task.archivedAt = new Date();

    await task.save();

    // ==========================================
    // STEP 6: Personal Task
    // No activity
    // No notification
    // No socket
    // ==========================================

    if (!isGroupTask) {
      return res
        .status(200)
        .json(new ApiResponse(200, task, "Task archived successfully.", true));
    }

    // ==========================================
    // STEP 7: Create Task Activity
    // Group Task Only
    // ==========================================

    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: null,

      type: "TASK_ARCHIVED",

      message: `${req.user.name} archived the task.`,

      metadata: {
        extra: {
          action: "ARCHIVE",
        },
      },
    });

    // ==========================================
    // STEP 8: Get Group Members
    // ==========================================

    const recipients = [
      task.createdBy.toString(),
      ...task.participants.map((participant) => participant.user.toString()),
    ];

    // Remove duplicates
    // Exclude current user
    const uniqueRecipients = [...new Set(recipients)].filter(
      (receiverId) => receiverId !== userId
    );

    // ==========================================
    // STEP 9: Create Notifications
    // ==========================================

    if (uniqueRecipients.length > 0) {
      const notifications = uniqueRecipients.map((receiverId) => ({
        user: receiverId,
        sender: req.user.userId,
        todo: task._id,

        type: "TASK_ARCHIVED",

        title: "Task Archived",

        message: `${req.user.name} archived the task "${task.title}".`,

        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    // ==========================================
    // STEP 10: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 11: Emit Archive Event
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:archived", {
      taskId: task._id,

      archivedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 12: Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task archived successfully.", true));
  } catch (error) {
    console.error("Archive Todo Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const restoreDeletedGroupTodo = async (req, res) => {
  try {
    // ==========================================
    // STEP 1: Get Task ID
    // ==========================================

    const { id } = req.params;

    // ==========================================
    // STEP 2: Validate Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 3: Find Deleted Task
    // Only owner can restore
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: true,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Deleted task not found", false));
    }

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 4: Determine Task Type
    // ==========================================

    const isGroupTask = task.participants?.length > 0;

    // ==========================================
    // STEP 5: Restore Task
    // ==========================================

    task.isDeleted = false;
    task.deletedAt = null;

    await task.save();

    // ==========================================
    // STEP 6: Personal Task
    // No activity
    // No notification
    // No socket
    // ==========================================

    if (!isGroupTask) {
      return res
        .status(200)
        .json(new ApiResponse(200, task, "Task restored successfully.", true));
    }

    // ==========================================
    // STEP 7: Create Task Activity
    // Group Task Only
    // ==========================================

    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: null,

      type: "TASK_RESTORED",

      message: `${req.user.name} restored the task.`,

      metadata: {
        extra: {
          action: "RESTORE",
        },
      },
    });

    // ==========================================
    // STEP 8: Get Group Members
    // ==========================================

    const recipients = [
      task.createdBy.toString(),

      ...task.participants.map((participant) => participant.user.toString()),
    ];

    // Remove duplicates
    // Exclude current user
    const uniqueRecipients = [...new Set(recipients)].filter(
      (receiverId) => receiverId !== userId
    );

    // ==========================================
    // STEP 9: Create Notifications
    // ==========================================

    if (uniqueRecipients.length > 0) {
      const notifications = uniqueRecipients.map((receiverId) => ({
        user: receiverId,
        sender: req.user.userId,
        todo: task._id,

        type: "TASK_RESTORED",

        title: "Task Restored",

        message: `${req.user.name} restored the task "${task.title}".`,

        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    // ==========================================
    // STEP 10: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 11: Emit Restore Event
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:restored", {
      taskId: task._id,

      restoredBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 12: Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task restored successfully.", true));
  } catch (error) {
    console.error("Restore Todo Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const restoreArchiveGroupTodo = async (req, res) => {
  try {
    // ==========================================
    // STEP 1: Get Task ID
    // ==========================================

    const { id } = req.params;

    // ==========================================
    // STEP 2: Validate Task ID
    // ==========================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 3: Find Archived Task
    // Only owner can restore
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: true,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Archived task not found", false));
    }

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 4: Determine Task Type
    // ==========================================

    const isGroupTask = task.participants?.length > 0;

    // ==========================================
    // STEP 5: Restore Archived Task
    // ==========================================

    task.isArchived = false;
    task.archivedAt = null;

    await task.save();

    // ==========================================
    // STEP 6: Personal Task
    // No Activity
    // No Notification
    // No Socket
    // ==========================================

    if (!isGroupTask) {
      return res
        .status(200)
        .json(new ApiResponse(200, task, "Task restored successfully.", true));
    }

    // ==========================================
    // STEP 7: Create Task Activity
    // Group Task Only
    // ==========================================

    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: null,

      type: "TASK_RESTORED",

      message: `${req.user.name} restored the archived task.`,

      metadata: {
        extra: {
          action: "RESTORE_ARCHIVED_TASK",
        },
      },
    });

    // ==========================================
    // STEP 8: Get Group Members
    // ==========================================

    const recipients = [
      task.createdBy.toString(),

      ...task.participants.map((participant) => participant.user.toString()),
    ];

    // Remove duplicates
    // Exclude current user
    const uniqueRecipients = [...new Set(recipients)].filter(
      (receiverId) => receiverId !== userId
    );

    // ==========================================
    // STEP 9: Create Notifications
    // ==========================================

    if (uniqueRecipients.length > 0) {
      const notifications = uniqueRecipients.map((receiverId) => ({
        user: receiverId,
        sender: req.user.userId,
        todo: task._id,

        type: "TASK_RESTORED",

        title: "Task Restored",

        message: `${req.user.name} restored the task "${task.title}".`,

        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    // ==========================================
    // STEP 10: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 11: Emit Restore Event
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:restored", {
      taskId: task._id,

      restoredBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 12: Response
    // ==========================================

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task restored successfully.", true));
  } catch (error) {
    console.error("Restore Archived Todo Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const shareGroupTodo = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { email, role } = req.body;

    // ==========================================
    // STEP 1: Validate Input
    // ==========================================

    if (!email) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email is required", false));
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // ==========================================
    // STEP 2: Validate Role
    // ==========================================

    const allowedRoles = ["editor", "contributor", "viewer"];

    if (!role || !allowedRoles.includes(role)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid participant role", false));
    }

    // ==========================================
    // STEP 3: Find Task
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    }).populate("participants.user", "name email profileImage");

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // ==========================================
    // STEP 4: Check Owner
    // ==========================================

    const userId = req.user.userId.toString();

    if (task.createdBy.toString() !== userId) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "Only the task owner can invite members.",
            false
          )
        );
    }

    // ==========================================
    // STEP 5: Find Invited User
    // ==========================================

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("_id name email profileImage");

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // ==========================================
    // STEP 6: Prevent Self Invitation
    // ==========================================

    if (user._id.toString() === userId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "You cannot invite yourself.", false));
    }

    // ==========================================
    // STEP 7: Check Friendship
    // ==========================================

    const isFriend = await User.exists({
      _id: req.user.userId,
      friends: user._id,
    });

    if (!isFriend) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, null, "User is not in your friend list.", false)
        );
    }

    // ==========================================
    // STEP 8: Check Existing Member
    // ==========================================

    const alreadyMember = task.participants.some(
      (participant) => participant.user?._id?.toString() === user._id.toString()
    );

    if (alreadyMember) {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            "User is already a member of this task.",
            false
          )
        );
    }

    // ==========================================
    // STEP 9: Check Existing Pending Invite
    // ==========================================

    const pendingInvite = await Invite.findOne({
      todo: task._id,
      invitedUser: user._id,
      status: "PENDING",
    });

    if (pendingInvite) {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            "User already has a pending invitation.",
            false
          )
        );
    }

    // ==========================================
    // STEP 10: Transaction
    // ==========================================

    let invite;
    let notification;
    let activity;
    let message;

    await session.withTransaction(async () => {
      // ------------------------------------------
      // Create Invitation
      // ------------------------------------------

      [invite] = await Invite.create(
        [
          {
            todo: task._id,
            invitedBy: req.user.userId,
            invitedUser: user._id,
            role,
            status: "PENDING",
          },
        ],
        { session }
      );

      // ------------------------------------------
      // Create Notification
      // ------------------------------------------

      [notification] = await Notification.create(
        [
          {
            user: user._id,
            sender: req.user.userId,
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

      // ------------------------------------------
      // Create Task Activity
      // ------------------------------------------

      [activity] = await TaskActivity.create(
        [
          {
            todo: task._id,
            actor: req.user.userId,
            targetUser: user._id,

            type: "MEMBER_INVITED",

            message: `${req.user.name} invited ${user.name} to join the task as ${role}.`,

            metadata: {
              extra: {
                role,
                invitedUserId: user._id,
                inviteId: invite._id,
              },
            },
          },
        ],
        { session }
      );

      // ------------------------------------------
      // Create Chat Message
      // ------------------------------------------

      [message] = await Message.create(
        [
          {
            sender: req.user.userId,
            type: "TASK_INVITE",
            invite: invite._id,
            todo: task._id,
            content: `${req.user.name} invited ${user.name} as ${role}.`,
          },
        ],
        { session }
      );
    });

    // ==========================================
    // STEP 11: Emit Notification to Invited User
    // ==========================================

    req.io.to(`user:${user._id.toString()}`).emit("notification", {
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
    // STEP 12: Emit New Invitation
    // ==========================================

    req.io.to(`user:${user._id.toString()}`).emit("invite:new", {
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
    // STEP 13: Emit Activity to Existing Members
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 14: Emit Task Update
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:updated", {
      action: "MEMBER_INVITED",

      taskId: task._id,

      participant: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role,
      },

      invitedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 15: Emit Chat Message
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
    // STEP 16: Response
    // ==========================================

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          invite,
          notification,
          activity,
        },
        "Invitation sent successfully.",
        true
      )
    );
  } catch (error) {
    console.error("Share Group Todo Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    await session.endSession();
  }
};
const getGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;

    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(429, null, "Task id invalid", false));
    }

    //STEP:2 FIND THE TASK
    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    }).populate({
      path: "participants.user",
      select: "name email profileImage",
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:3 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, task.participants, "Task founded", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const updateMemberRole = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { role } = req.body;

    // ==========================================
    // STEP 1: Validate IDs
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
    // STEP 2: Validate Role
    // ==========================================

    const allowedRoles = ["viewer", "contributor", "editor"];

    if (!role || !allowedRoles.includes(role)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid member role", false));
    }

    // ==========================================
    // STEP 3: Find Task
    // Only Owner Can Change Roles
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // ==========================================
    // STEP 4: Find Member
    // ==========================================

    const member = task.participants.find(
      (participant) => participant.user.toString() === memberId.toString()
    );

    if (!member) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "Member not found in this task", false)
        );
    }

    // ==========================================
    // STEP 5: Prevent Duplicate Role Update
    // ==========================================

    const oldRole = member.role;

    if (oldRole === role) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, `Member is already a ${role}.`, false)
        );
    }

    // ==========================================
    // STEP 6: Update Role
    // ==========================================

    member.role = role;

    await task.save();

    // ==========================================
    // STEP 7: Create Task Activity
    // ==========================================

    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: memberId,

      type: "ROLE_CHANGED",

      message: `${req.user.name} changed ${memberId}'s role from ${oldRole} to ${role}.`,

      metadata: {
        oldValue: oldRole,
        newValue: role,

        extra: {
          memberId,
        },
      },
    });

    // ==========================================
    // STEP 8: Create Notification
    // ==========================================

    const notification = await Notification.create({
      user: memberId,
      sender: req.user.userId,

      type: "TASK_ROLE_CHANGED",

      title: "Task Role Changed",

      message: `Your role on "${task.title}" has been changed from ${oldRole} to ${role}.`,

      todo: task._id,

      isRead: false,
    });

    // ==========================================
    // STEP 9: Emit Notification
    // ==========================================

    req.io.to(`user:${memberId.toString()}`).emit("notification", notification);

    // ==========================================
    // STEP 10: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 11: Emit Task Update
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:member-role-updated", {
      taskId: task._id,

      member: {
        userId: memberId,
        oldRole,
        newRole: role,
      },

      updatedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 12: Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, task, "Member role updated successfully.", true)
      );
  } catch (error) {
    console.error("Update Member Role Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const removeMember = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id, memberId } = req.params;

    // ==========================================
    // STEP 1: Validate IDs
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

    const userId = req.user.userId.toString();

    // ==========================================
    // STEP 2: Find Task
    // Only owner can remove members
    // ==========================================

    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // ==========================================
    // STEP 3: Find Member
    // ==========================================

    const member = task.participants.find(
      (participant) => participant.user.toString() === memberId.toString()
    );

    if (!member) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "User is not a member of this task", false)
        );
    }

    // ==========================================
    // STEP 4: Prevent Owner Removal
    // ==========================================

    if (member.role === "owner") {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "The task owner cannot be removed.", false)
        );
    }

    // ==========================================
    // STEP 5: Prevent Self Removal
    // ==========================================

    if (memberId.toString() === userId) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "You cannot remove yourself. Use leave task instead.",
            false
          )
        );
    }

    // ==========================================
    // STEP 6: Get Old Role
    // ==========================================

    const removedRole = member.role;

    let updatedTask;
    let activity;
    let notification;

    // ==========================================
    // STEP 7: Transaction
    // ==========================================

    await session.withTransaction(async () => {
      // ------------------------------------------
      // Remove Member
      // ------------------------------------------

      updatedTask = await Todo.findOneAndUpdate(
        {
          _id: id,
          createdBy: req.user.userId,
          isDeleted: false,
          isArchived: false,
        },
        {
          $pull: {
            participants: {
              user: memberId,
            },
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!updatedTask) {
        throw new Error("Task could not be updated.");
      }

      // ------------------------------------------
      // Create Task Activity
      // ------------------------------------------

      [activity] = await TaskActivity.create(
        [
          {
            todo: task._id,
            actor: req.user.userId,
            targetUser: memberId,

            type: "MEMBER_REMOVED",

            message: `${req.user.name} removed a member from the task.`,

            metadata: {
              oldValue: removedRole,

              extra: {
                removedUserId: memberId,
                removedRole,
              },
            },
          },
        ],
        { session }
      );

      // ------------------------------------------
      // Create Notification
      // ------------------------------------------

      [notification] = await Notification.create(
        [
          {
            user: memberId,
            sender: req.user.userId,

            type: "MEMBER_REMOVED",

            title: "Removed from task",

            message: `You have been removed from "${task.title}".`,

            todo: task._id,

            isRead: false,
          },
        ],
        { session }
      );
    });

    // ==========================================
    // STEP 8: Notify Removed Member
    // ==========================================

    req.io.to(`user:${memberId.toString()}`).emit("notification", notification);

    // ==========================================
    // STEP 9: Emit Activity
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:activity", activity);

    // ==========================================
    // STEP 10: Emit Member Removed Event
    // ==========================================

    req.io.to(`task:${task._id.toString()}`).emit("task:member-removed", {
      taskId: task._id,

      member: {
        userId: memberId,
        role: removedRole,
      },

      removedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    // ==========================================
    // STEP 11: Response
    // ==========================================

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedTask, "Member removed successfully.", true)
      );
  } catch (error) {
    console.error("Remove Member Error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    await session.endSession();
  }
};
const leaveGroupTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // ==========================================
    // STEP 1: VALIDATE TASK ID
    // ==========================================
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task id", false));
    }

    // ==========================================
    // STEP 2: FIND TASK
    // ==========================================
    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // ==========================================
    // STEP 3: FIND REQUESTING MEMBER
    // ==========================================
    const member = task.participants.find(
      (participant) => participant.user.toString() === userId
    );

    // User is not a participant
    if (!member) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "You are not a participant of this group",
            false
          )
        );
    }

    // ==========================================
    // STEP 4: OWNER CANNOT LEAVE
    // ==========================================
    if (member.role === "owner") {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Task owner cannot leave the group", false)
        );
    }

    // ==========================================
    // STEP 5: GET REMAINING MEMBERS
    // ==========================================
    const remainingMembers = task.participants
      .filter((participant) => participant.user.toString() !== userId)
      .map((participant) => participant.user.toString());

    // ==========================================
    // STEP 6: REMOVE MEMBER
    // ==========================================
    const updatedTask = await Todo.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        isArchived: false,
        participants: {
          $elemMatch: {
            user: userId,
          },
        },
      },
      {
        $pull: {
          participants: {
            user: userId,
          },
        },
      },
      {
        new: true,
      }
    );

    if (!updatedTask) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Member could not be removed", false));
    }

    // ==========================================
    // STEP 7: CREATE NOTIFICATIONS
    // ==========================================
    const notifications = remainingMembers.map((recipientId) => ({
      user: recipientId,
      sender: userId,
      type: "MEMBER_LEFT",
      title: "Member left the task",
      message: `A member has left "${task.title}".`,
      todo: task._id,
      isRead: false,
    }));

    const createdNotifications =
      notifications.length > 0
        ? await Notification.insertMany(notifications)
        : [];

    // ==========================================
    // STEP 8: BROADCAST TO TASK ROOM
    // EXCLUDE THE MEMBER WHO LEFT
    // ==========================================
    if (remainingMembers.length > 0) {
      io.to(`task:${id}`)
        .except(`user:${userId}`)
        .emit("notification", {
          type: "MEMBER_LEFT",
          title: "Member left the task",
          message: `A member has left "${task.title}".`,
          todo: task._id,
          sender: userId,
        });
    }

    // ==========================================
    // STEP 9: RESPONSE
    // ==========================================
    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedTask, "Left the group successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const getPendingGroupInvitation = async (req, res) => {
  try {
    const pending_invitations = await Invite.find({
      invitedUser: req.user.userId,
      status: "PENDING",
    });
    if (pending_invitations.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, [], "No pending invitations found", true));
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { invitations: pending_invitations },
          "Pending invitations",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const getPendingTaskInvitations = async (req, res) => {
  try {
    const { id } = req.params;

    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task id invalid", false));
    }

    //STEP:2 FIDN TASK
    const task = await Todo.findByOne({
      _id:id,
      createdBy:req.user.userId,
      isArchived:false,
      isDeleted:false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const member = task.participants.find(
      (participant) => participant.user.toString() === req.user.userId
    );

    if (!member) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied", false));
    }

    if (member.role !== "owner") {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "Only the owner can view pending invitations",
            false
          )
        );
    }

    //STEP:3 FIND THE PENDING INVITATIONS FROM INVITE MODEL
    const pending_invitation = await Invite.find({
      todo: id,
      status: "PENDING",
    });

    if (pending_invitation.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { invitations: pending_invitation },
            "No Pending invitations you have",
            true
          )
        );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { invitations: pending_invitation },
          "Pending invitations",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const acceptGroupInvitation = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { inviteId } = req.params;
    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(inviteId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid id", false));
    }

    //STEP:8 PUSH REQ USER INSIDE TASK PARTICIPENT ARRAY INSIDE TODO MODEL
    let updatedTask;
    let notification;

    await session.withTransaction(async () => {
      //STEP:2 FIDN THE INVITATION FROM MODEL
      const invite = await Invite.findOne({
        _id: inviteId,
        invitedUser: req.user.userId,
        isInviteAccepted: false,
        status: "PENDING",
      }).session(session);
      //STEP:3 CHECK INVITE IS FOUND OR NOT
      if (!invite) {
        throw new ApiError(404, "invite not found");
      }

      //STEP:3 FIND THE TASK
      const task = await Todo.findById(invite.todo).session(session);

      if (!task) {
        throw new ApiError(404, "Task not found");
      }
      if (task.createdBy.toString() === req.user.userId) {
        throw new ApiError(400, "Owner cannot accept invitation");
      }
      updatedTask = await Todo.findOneAndUpdate(
        {
          _id: task._id,
          isDeleted: false,
          isArchived: false,
          "participants.user": {
            $ne: req.user.userId,
          },
        },
        {
          $push: {
            participants: {
              user: req.user.userId,
              role: invite.role,
            },
          },
        },
        {
          new: true,
          session,
        }
      );
      if (!updatedTask) {
        throw new ApiError(400, "User is already a participant");
      }

      await Invite.findByIdAndUpdate(
        invite._id,
        {
          status: "ACCEPTED",
          isInviteAccepted: true,
        },
        {
          session,
        }
      );
    });

    const user = await User.findById(req.user.userId);

    //SEND NOTIFICATION TO THE OWNER
    notification = await Notification.create({
      user: ownerId, // Receiver (Task Owner)
      sender: req.user.userId, // User who accepted
      type: "TASK_ACCEPTED",
      title: "Invitation Accepted",
      message: `${user.name} accepted your invitation.`,
      todo: updatedTask._id,
      invite: inviteId,
    });

    //EMIT THE NOTIFICATION
    io.to(ownerId).emit("notification", notification);

    //CREATE TASK ACTIVITY DOCUMENT
    const activity = await TaskActivity.create({
      todo: task._id,
      actor: req.user.userId,
      targetUser: req.user.userId,
      type: "MEMBER_JOINED",
      message: `${user.name} joined the task.`,
    });
    io.to(`task:${updatedTask._id}`).emit("task:activity", activity);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedTask,
          "Invitation accepted successfully",
          true
        )
      );
  } catch (error) {
    if (error instanceof ApiError) {
      return res
        .status(error.statusCode)
        .json(new ApiResponse(error.statusCode, null, error.message, false));
    }

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    session.endSession();
  }
};
const rejectGroupInvitation = async (req, res) => {
  try {
    const { inviteId } = req.params;

    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(inviteId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid api", false));
    }

    //STEP:2 FIND THAT USER WHOS REJECT THE INVITATIOS
    const user = await User.findById(req.user.userId);

    //STEP:3 VALIDATE THE USER
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    //STEP:4 FIND THE INVITATION FROM INVITE MODEL
    const invite = await Invite.findOne({
      _id: inviteId,
      invitedUser: req.user.userId,
      status: "PENDING",
      isInviteAccepted: false,
    });

    //STEP:5 VALIDATE THE INVITE
    if (!invite) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Invite not found", false));
    }

    //STEP:6 UPDATE THE INVITE
    ((invite.status = "REJECTED"), await invite.save());

    //STEP:8 CREATE NOTIFICATION
    let ownerId = invite.invitedBy;
    const notification = await Notification.create({
      user: ownerId,
      sender: req.user.userId,
      type: "TASK_REJECTED",
      title: "Invitation Rejected",
      message: `${user.name} reject your invitation.`,
      todo: invite.todo,
      invite: inviteId,
    });

    //STEP:9 EMIT NOTIFIACTION TO THE USER
    io.to(`user:${ownerId}`).emit("notification:new", notification);

    //STEP:7 RETURN SUCCESS RESPONSE
    return res
      .status(200)
      .json(
        new ApiResponse(200, invite, "Invitation rejected successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const cloneGroupTask = async (req, res) => {
  const session = await Mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;

    // STEP 1: Validate Task ID
    if (!Mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();

      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // STEP 2: Find Task
    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    }).session(session);

    if (!task) {
      await session.abortTransaction();

      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const userId = req.user.userId.toString();

    // STEP 3: Authorization
    let allowed = false;

    if (task.createdBy.toString() === userId) {
      allowed = true;
    } else {
      const participant = task.participants.find(
        (p) => p.user.toString() === userId
      );

      if (
        participant &&
        ["owner", "editor", "contributor"].includes(participant.role)
      ) {
        allowed = true;
      }
    }

    if (!allowed) {
      await session.abortTransaction();

      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "You don't have permission to clone this task.",
            false
          )
        );
    }

    // STEP 4: Create cloned task
    const [clonedTask] = await Todo.create(
      [
        {
          title: `${task.title} (Copy)`,
          description: task.description,
          source: task.source,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
          deadline: task.deadline,
          tags: [...task.tags],

          createdBy: req.user.userId,

          // Don't copy collaborators
          participants: [],

          // Don't copy subtasks
          SubTodos: [],

          // Don't copy invitations
          taskInvitations: [],

          // Fresh task
          status: "START",
          isArchived: false,
          isDeleted: false,
          deletedAt: null,
        },
      ],
      { session }
    );

    // STEP 5: Add cloned task to user's account
    await User.findByIdAndUpdate(
      req.user.userId,
      {
        $push: {
          groupTasks: clonedTask._id,
        },
        $inc: {
          totalGroupTasks: 1,
        },
      },
      { session }
    );

    let notification = null;

    // STEP 6: Notify only original owner (if another user cloned it)
    if (task.createdBy.toString() !== userId) {
      [notification] = await Notification.create(
        [
          {
            user: task.createdBy,
            sender: req.user.userId,
            task: task._id,
            type: "TASK_CLONED",
            title: "Task Cloned",
            message: `${req.user.name} cloned your task "${task.title}".`,
            isRead: false,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    // STEP 7: Realtime notification to original owner
    if (notification) {
      req.io.to(`user:${task.createdBy}`).emit("notification", notification);
    }

    return res
      .status(201)
      .json(
        new ApiResponse(201, clonedTask, "Task cloned successfully.", true)
      );
  } catch (error) {
    await session.abortTransaction();

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    session.endSession();
  }
};
const commentGroupTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // STEP 1: Validate task id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task id", false));
    }

    // STEP 2: Validate message
    if (!message || !message.trim()) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Message is required", false));
    }

    // STEP 3: Find task
    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // STEP 4: Authorization
    const userId = req.user.userId;
    // STEP: Create notifications (Only when a participant comments)
    const isOwner = task.createdBy.toString() === userId;

    if (!isOwner) {
      const recipients = [
        task.createdBy.toString(),
        ...task.participants.map((participant) => participant.user.toString()),
      ];

      // Remove duplicates and exclude the commenter
      const uniqueRecipients = [...new Set(recipients)].filter(
        (recipientId) => recipientId !== userId
      );

      if (uniqueRecipients.length) {
        const notifications = uniqueRecipients.map((recipientId) => ({
          user: recipientId,
          sender: req.user.userId,
          todo: task._id,
          type: "TASK_COMMENTED",
          title: "New Task Comment",
          message: `${req.user.name} commented on the task.`,
        }));

        await Notification.insertMany(notifications);
      }
    }
    const isParticipant = task.participants.some(
      (participant) => participant.user.toString() === userId
    );

    if (!isOwner && !isParticipant) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "You are not allowed to comment on this task",
            false
          )
        );
    }

    // STEP 5: Create comment
    const comment = await Comment.create({
      user: userId,
      message: message.trim(),
    });

    // STEP 6: Attach comment to task
    task.comments.push(comment._id);
    await task.save();

    // Optional: Populate the comment author
    await comment.populate("user", "name email profileImage");

    // CREATE NOTIFICATION LIKE SOME OTHER PARTICIPENT COMMENT THEN WE NEED TO SEND NOTIFICATION TO THE OWNER AND PARTICIPENT AND WHEN OWNER COMMENT THEN NOT NEED TO SEND NOTIFICATION
    req.io.to(`task:${task._id}`).emit("task:comment-added", {
      taskId: task._id,
      comment,
    });

    // STEP 7: Success response
    return res
      .status(201)
      .json(new ApiResponse(201, comment, "Comment added successfully", true));
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal Server Error", false));
  }
};
const getCommentsGroupTasks = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    // STEP 1: Validate Task ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task id", false));
    }

    // STEP 2: Find Task & Authorization
    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
      $or: [
        { createdBy: req.user.userId },
        {
          participants: {
            $elemMatch: {
              user: req.user.userId,
            },
          },
        },
      ],
    }).populate({
      path: "comments",
      options: {
        sort: { createdAt: -1 },
        skip,
        limit,
      },
      populate: {
        path: "user",
        select: "name email profileImage",
      },
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // STEP 3: Pagination Metadata
    const totalComments = task.comments.length;

    // Better count using the stored ObjectId array
    const total = await Todo.findById(id).select("comments");

    const totalCount = total.comments.length;
    const totalPages = Math.ceil(totalCount / limit);

    // STEP 4: Success Response
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          comments: task.comments,
          pagination: {
            page,
            limit,
            totalComments: totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
        "Comments fetched successfully",
        true
      )
    );
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const updateCommentsGroupTasks = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // Validate message
    if (!message || !message.trim()) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Message is required", false));
    }

    //VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid id", false));
    }

    //FIND THE COMMENT
    const comment = await Comment.findOne({
      _id: id,
      user: req.user.userId,
    });

    if (!comment) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Comment not found", false));
    }

    //FIND TASK
    const task = await Todo.findOne({
      _id: comment.todo,
      isDeleted: false,
      isArchived: false,
      $or: [
        { createdBy: req.user.userId },
        {
          participants: {
            $elemMatch: {
              user: req.user.userId,
            },
          },
        },
      ],
    });

    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    const isOwner = task.createdBy.toString() === req.user.userId;

    const isParticipant = task.participants.some(
      (p) => p.user.toString() === req.user.userId
    );

    if (!isOwner && !isParticipant) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied", false));
    }

    const updatedComment = await Comment.findByIdAndUpdate(
      id,
      {
        message: message.trim(),
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate("user", "name email profileImage");

    // STEP: Notifications
    if (!isOwner) {
      const recipients = [
        task.createdBy.toString(),
        ...task.participants.map((participant) => participant.user.toString()),
      ];

      const uniqueRecipients = [...new Set(recipients)].filter(
        (recipientId) => recipientId !== req.user.userId
      );

      if (uniqueRecipients.length) {
        const notifications = uniqueRecipients.map((recipientId) => ({
          user: recipientId,
          sender: req.user.userId,
          todo: task._id,
          type: "TASK_UPDATED", // or create COMMENT_UPDATED if you prefer
          title: "Comment Updated",
          message: `${req.user.name} updated a comment on the task.`,
        }));

        await Notification.insertMany(notifications);
      }
    }

    // STEP: Socket Event
    req.io.to(`task:${task._id}`).emit("task:comment-updated", {
      taskId: task._id,
      comment: updatedComment,
      updatedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    //return success message
    return res
      .status(200)
      .json(new ApiResponse(200, updatedComment, "Comment updated", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

export {
  createGroupTodo,
  updateGroupTodo,
  deleteGroupTodo,
  getAllGroupTodos,
  getGroupTodoById,
  generateAIGroupTodo,
  saveAIGroupTodo,
  archiveGroupTodo,
  restoreDeletedGroupTodo,
  updateGroupTodoStatus,
  restoreArchiveGroupTodo,
  shareGroupTodo,
  getGroupMembers,
  updateMemberRole,
  removeMember,
  leaveGroupTodo,
  getPendingGroupInvitation,
  acceptGroupInvitation,
  rejectGroupInvitation,
  cloneGroupTask,
  commentGroupTask,
  getCommentsGroupTasks,
  updateCommentsGroupTasks,
  getPendingTaskInvitations,
};
