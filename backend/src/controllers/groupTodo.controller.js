import mongoose from "mongoose";
import ApiResponse from "../utils/apiResponseHandler.js";
import { Todo } from "../models/todo.model.js";
import { SubTodo } from "../models/subTodo.model.js";
import { User } from "../models/user.model.js";
import todoAIService from "../service/ai.service.js";
import { Message } from "../models/chat.model.js";
import { Invite } from "../models/invite.model.js";
import { io } from "../../server.js";
import { ta } from "zod/v4/locales";
import { Notification } from "../models/notification.model.js";

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
          source: "ai",
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

    //STEP:1 VALIDE THE ID
    if (!Mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }
    //STEP:2 FIND THE TASK
    const todo = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });
    //STEP:3 CHECK THE todo IF FIND OR NOT
    if (!todo) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // STEP 3: Update only provided fields
    if (title !== undefined) todo.title = title;
    if (description !== undefined) todo.description = description;
    if (priority !== undefined) todo.priority = priority;
    if (estimatedHours !== undefined) todo.estimatedHours = estimatedHours;
    if (deadline !== undefined) todo.deadline = deadline;
    if (tags !== undefined) todo.tags = tags;
    if (status !== undefined) todo.status = status;

    // STEP 4: Save
    await todo.save();

    //STEP:5 CREATE NOTIFICATION
    const notification = await Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_UPDATED",
      title: "Task updated",
      message: "task update successfully",
      todo: todo._id,
      isRead: false,
    });

    //STEP:6 EMIT NOTIFICATION
    io.to(`user:${req.user.userId}`).emit("notification", notification);

    // STEP 7: Response
    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Task updated successfully", true));
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
    if (!Mongoose.Types.ObjectId.isValid(id)) {
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
    const isGroupTask = todo.participants.length > 0;

    // STEP 4: Authorization
    if (!isGroupTask) {
      // Personal Task
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
      // Group Task
      let role = "owner";
      const isGroupTask = todo.participants.length > 0;

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

    // STEP 5: Prevent duplicate updates
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

    // STEP 7: Notifications & Socket.IO (Only Group Tasks)
    if (isGroupTask) {
      const recipients = [
        todo.createdBy.toString(),
        ...todo.participants.map((p) => p.user.toString()),
      ];

      // Remove duplicates & exclude current user
      const uniqueRecipients = [...new Set(recipients)].filter(
        (id) => id !== userId
      );

      if (uniqueRecipients.length) {
        const notifications = uniqueRecipients.map((receiverId) => ({
          user: receiverId,
          sender: req.user.userId,
          task: todo._id,
          type: "TASK_STATUS_UPDATED",
          title: "Task Status Updated",
          message: `${req.user.name} changed the task status from ${previousStatus} to ${status}.`,
        }));

        await Notification.insertMany(notifications);
      }

      // Emit realtime event
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

    //STEP:1 VALIDE THE ID
    if (!Mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    //STEP:2 FINT THE GROU_TASK IN DATABASE
    const task = new Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isArchived: false,
      isDeleted: false,
    });

    //STEP:3 CHECK THE TASK IS GET OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:4 ASSIGN THIS TASK AS DELETED
    task.isDeleted = true;
    task.deletedAt = new Date();
    await task.save();

    //STEP:5 CREATE NOTIFICATION
    const notification = await Notification.create({
      user:req.user.userId,
      sender:req.user.userId,
      type:"TASK_REMOVED",
      title:"Task removed",
      message:"Task remove successfully",
      todo:task._id,
      isRead:false,
    })

    //EMIT NOTIFICATION
    req.io.to(`user:${req.user.userId.toString()}`).emit("notification",notification)

    //STEP:5 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task Deleted", true));
  } catch (error) {
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
    //STEP:1 GET THE TASK ID
    const { id } = req.params;
    //STEP:2 VALIDATE TEH ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task ID Invalid", false));
    }
    //STEP:2 FIND THE PARTICULOR ID
    const task = new Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    //STEP:2 CHECK THE TASKS IS GET OR NOT
    if (!tasks) {
      return res.status(404).json(new ApiResponse(404, null, "Task not found"));
    }

    task.isArchived = true;
    await task.save();

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
const restoreDeletedGroupTodo = async (req, res) => {
  try {
    //STEP:1 GET THE ID FROM PARAMS
    const { id } = req.params;

    //STEP:2 VALIDATE TEH ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task ID Invalid", false));
    }

    //STEP:3 FIND THE DELTED TASK
    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: true,
      isArchived: false,
    });

    //STEP:3 CHECK THE TASKS IS GET OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    //STEP:4 UPDATE THE DOCUMENT IN DATABASE
    task.isDeleted = false;
    await task.save();

    //STEP:5 CREATE NOTIFICATION
    const notification = await Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_RESTORE",
      title:"Task restored",
      message:"Task restored successfully",
      todo:task._id,
      isRead:false
    });

    req.io.to(`user:${req.user.userId.toString()}`).emit("notification",notification)

    //STEP:5 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Restore Task Success", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const restoreArchiveGroupTodo = async (req, res) => {
  try {
    //STEP:1 GET THE ID FROM PARAMS
    const { id } = req.params;

    //STEP:2 VALIDATE TEH ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task ID Invalid", false));
    }

    //STEP:3 FIND THE DELTED TASK
    const task = await Todo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: true,
    });

    //STEP:3 CHECK THE TASKS IS GET OR NOT
    if (!task) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }
    task.isArchived = false;
    await task.save();

    //STEP:5 CREATE NOTIFICATION
    const notification = await Notification.create({
      user: req.user.userId,
      sender: req.user.userId,
      type: "TASK_RESTORE",
      title: "Task restored",
      message: "Task restored successfully",
      todo: task._id,
      isRead: false,
    });

    req.io
      .to(`user:${req.user.userId.toString()}`)
      .emit("notification", notification);

    //STEP:5 RETURN SUCCESS MESSAGE
    return res
      .status(200)
      .json(new ApiResponse(200, task, "Restore Task Success", true));
  } catch (error) {
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

    if (!email) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email is required", false));
    }

    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Id is not valid", false));
    }

    //STEP:2 FIND TASK
    const task = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
    }).populate("participants.user", "name email profileImage");

    //STEP:3 CHECK THE TASK IS FOUND OR NOT
    if (!task) {
      return res.status(404).json(404, null, "Task not found", false);
    }

    const participant = task.participants.find(
      (p) => p.user.toString() === req.user.userId.toString()
    );

    if (!participant) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied", false));
    }

    if (participant.role !== "owner") {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied", false));
    }

    //STEP:4 FIND INVITED USERS
    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    //CEHCK SELF INVITED NOT ALLOWED
    if (user._id.equals(req.user.userId)) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Cannot shared yourSelf", false));
    }

    //STEP:4 CEHCK THE INVITED USER IS FREIND OR NOT
    const isFriend = await User.exists({
      _id: req.user.userId,
      friends: user._id,
    });

    if (!isFriend) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User is not in freind list", false));
    }

    //STEP:4 CHECK FREINDS LIST FOR ALREADY MEMBER OF TASK
    const alreadyMember = task.participants.some(
      (p) => p.user.toString() === user._id.toString()
    );

    if (alreadyMember) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "User already member", false));
    }

    //STEP:5 CHECK EXISTING PENDING INVITATION
    const pendingInvite = await Invite.findOne({
      todo: id,
      invitedUser: user._id,
      status: "PENDING",
    });

    if (pendingInvite) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Already Invited", false));
    }

    // ==========================
    // START TRANSACTION
    // ==========================

    let invite;
    let notification;
    let message;

    await session.withTransaction(async () => {
      // all database writes here

      //STEP:6 CREATE INVITATION
      invite = await Invite.create(
        {
          todo: id,
          invitedBy: req.user.userId,
          invitedUser: user._id,
          role,
        },
        { session }
      );

      //STEP:7 CREATE NOTIFICATION
      notification = await Notification.create(
        {
          user: user._id,
          sender: req.user.userId,
          type: "TASK_INVITE",
          title: "Task Invitation",
          message: "send inivitation to joined the task",
          todo: task._id,
          invite: invite._id,
          isRead: false,
        },
        { session }
      );

      //STEP:8 CREATE CHATE MESSAGE
      message = await Message.create(
        {
          sender: req.user.userId,

          type: "TASK_INVITE",

          invite: invite._id,

          todo: id,

          content: `${req.user.name} invited ${user.name} as ${role}`,
        },
        { session }
      );
    });

    // ==========================
    // SOCKET EVENTS
    // Emit AFTER commit
    // ==========================

    //STEP:9 EMIT NOTIFICATION  SOCKET EVENT
    io.to(user._id.toString()).emit("notification", {
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

    //STEP:10 EMIT INVITE SOCKET EVENT
    io.to(user._id.toString()).emit("invite:new", {
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

    //STEP:11 EMIT MEMBAR  ADDED SOCKET EVENT
    io.to(task._id.toString()).emit("task:updated", {
      action: "MEMBER_INVITED",

      taskId: task._id,

      participant: {
        _id: user._id,
        name: user.name,
        email: user.email.trim().toLowerCase(),
        role: role,
      },

      invitedBy: {
        _id: req.user.userId,
        name: req.user.name,
      },
    });

    //STEP:12 EMIT MESSAGE SOCKET EVENT
    io.to(task._id.toString()).emit("message:new", {
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

    //STEP:13 RETURN SUCCESS MESSAGE AND DATA
    return res.status(201).json(
      new ApiResponse(
        201,

        {
          invite,

          notification,
        },

        "Invitation sent successfully",

        true
      )
    );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  } finally {
    session.endSession();
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

//TO BE CONTINUE TO SEND NOTIFICATION FROM HERE
const updateMemberRole = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { role } = req.body;

    //STEP:1 VALIDATE THE IDS
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalide ids", false));
    }

    //STEP:2 FIND THE TASK
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

    const member = task.participants.find(
      (participant) => participant.user.toString() === memberId
    );

    if (!member) {
      // Member not found
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Member not found", false));
    }

    member.role = role;
    await task.save();


    return res
      .status(200)
      .json(new ApiResponse(200, task, "Role updated successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const removeMember = async (req, res) => {
  try {
    const { id, memberId } = req.params;

    //STEP:1 VALIDATE THE IDS
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalide ids", false));
    }

    //STEP:2 FIND TASK AND UPDATE THE TASK PARTICIPENT AND PULL THE USER FORM ARRAY

    //STEP:2 FIND THE TASK
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

    const member = task.participants.find(
      (participant) => participant.user.toString() === memberId
    );

    if (!member) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Not a member of task", false));
    }

    //STEP:3 CHECK OWNER CANNOT REMOVE FROM TASK
    if (member.role == "owner") {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Cannot remove owner from task", false)
        );
    }

    const updatedTask = await Todo.findByIdAndUpdate(
      id,
      {
        $pull: {
          participants: {
            user: memberId,
          },
        },
      },
      {
        new: true,
      }
    );
    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedTask, "Member removed successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const leaveGroupTodo = async (req, res) => {
  try {
    //task id
    const { id } = req.params;

    //STEP:1 VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid id", false));
    }

    //STEP:2 FIND THE TASK
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

    //STEP:2 FIND THE REQUESTED PARTICIPENTS FROM TASK PRTICIPENT

    const member = task.participants.find(
      (participant) => participant.user.toString() === req.user.userId
    );

    //check first the req user is the participent or not
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

    //STEP:3 OWNER CANNOT LEAVE THE GROUP
    if (member.role === "owner") {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Access Denied", false));
    }

    //STEP:4 UPDATE THE TASK AND REMOVE THE MEMBER FROM THE TASK
    const updatedTask = await Todo.findByIdAndUpdate(
      id,
      {
        $pull: {
          participants: {
            user: req.user.userId,
          },
        },
      },
      {
        new: true,
      }
    );

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
    const task = await Todo.findById(id);

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
    const notification = await Notification.create({
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

    const user = await User.findById(req.user.userId);

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
const cloneGroupTask = async (req, res) => {};
const commentGroupTaks = async (req, res) => {};
const getCommentsGroupTasks = async (req, res) => {};
const updateCommentsGroupTasks = async (req, res) => {};

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
  commentGroupTaks,
  getCommentsGroupTasks,
  updateCommentsGroupTasks,
  getPendingTaskInvitations,
};
