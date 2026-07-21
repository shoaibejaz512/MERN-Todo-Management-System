import mongoose from "mongoose";
import ApiResponse from "../utils/apiResponseHandler.js";
import Todo from "../models/todo.model.js";
import { SubTodo } from "../models/subTodo.model.js";
import { User } from "../models/user.model.js";
import todoAIService from "../service/ai.service.js";

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

    if (!status) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Status is required", false));
    }

    const todo = await Todo.findOneAndUpdate(
      {
        _id: id,
        createdBy: req.user.userId,
        isDeleted: false,
        isArchived: false,
      },
      {
        status,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!todo) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Task not found", false));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, todo, "Status updated successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const deleteGroupTodo = async (req, res) => {};
const getAllGroupTodos = async (req, res) => {};
const getGroupTodoById = async (req, res) => {};
const archiveGroupTodo = async (req, res) => {};
const restoreGroupTodo = async (req, res) => {};

export {
  createGroupTodo,
  updateGroupTodo,
  deleteGroupTodo,
  getAllGroupTodos,
  getGroupTodoById,
  generateAIGroupTodo,
  saveAIGroupTodo,
  archiveGroupTodo,
  restoreGroupTodo,
  updateGroupTodoStatus,
};
