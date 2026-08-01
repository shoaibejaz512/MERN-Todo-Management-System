import mongoose from "mongoose";
import ApiResponse from "../utils/apiResponseHandler.js";
import { Todo } from "../models/todo.model.js";
import { SubTodo } from "../models/subTodo.model.js";
import { User } from "../models/user.model.js";
import todoAIService from "../service/ai.service.js";
import { Message } from "../models/chat.model.js";
import { Invite } from "../models/invite.model.js";
import { io } from "../../server.js";

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

    // STEP 5: Response
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

    //STEP:1 VALIDE THE ID
    if (!Mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    if (!status) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Status is required", false));
    }
    const todo = await Todo.findOne({
      _id: id,
      isDeleted: false,
      isArchived: false,
      $or: [
        { createdBy: req.user.userId },
        { "participants.user": req.user.userId },
      ],
    });

    if (!todo) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    // By default, if the creator is making the request, they are the owner
    let role = "owner";
    if (todo.createdBy.toString() !== req.user.userId.toString()) {
      const member = todo.participants.find(
        (p) => p.user.toString() === req.user.userId.toString()
      );

      role = member.role;
    }

    // Permission check
    if (!["owner", "editor", "contributor"].includes(role)) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "You don't have permission to update this task",
            false
          )
        );
    }

    todo.status = status;
    await todo.save();
    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Status updated successfully", true));
  } catch (error) {
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
const leaveGroupTodo = async (req, res) => {};
const getPendingGroupInvitation = async (req, res) => {};
const acceptGroupInvitation = async (req, res) => {};
const rejectGroupInvitation = async (req, res) => {};
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
};
