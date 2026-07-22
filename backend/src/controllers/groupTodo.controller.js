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
};
