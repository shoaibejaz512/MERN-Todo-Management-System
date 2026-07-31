import { SingleTodo } from "../models/singleTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import todoAIService from "../service/ai.service.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

// controllers/todo.controller.js

export const createSoloTodo = async (req, res) => {
  try {
    const { title, description, priority, estimatedHours, deadline, tags } =
      req.body;

    console.log(req.body);

    if (!title || !description || !deadline) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Title and description and deadline are required",
            false
          )
        );
    }

    const todo = await SingleTodo.create({
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      createdBy: req.user.userId,
      source: "manual", // only if you added this field
    });

    //UPDATE THE THE USER MODEL IN DATABASE WITH THE CREATED TODO ID
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (user) {
      user.singleTasks.push(todo._id);
      await user.save();
    }

    return res
      .status(201)
      .json(new ApiResponse(201, todo, "Todo created successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
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
  try {
    const { title, description, priority, estimatedHours, deadline, tags } =
      req.body;

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

    const todo = await SingleTodo.create({
      title,
      description,
      priority,
      estimatedHours,
      deadline,
      tags,
      createdBy: req.user.userId,
      source: "ai", // only if you added this field
    });

    //UPDATE THE THE USER MODEL IN DATABASE WITH THE CREATED TODO ID
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (user) {
      user.singleTasks.push(todo._id);
      await user.save();
    }

    return res
      .status(201)
      .json(new ApiResponse(201, todo, "AI Todo saved successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

export const updateTask = async (req, res) => {
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

    // STEP 1: Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid task ID", false));
    }

    // STEP 2: Find the task
    const todo = await SingleTodo.findOne({
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
export const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Status is required", false));
    }

    const todo = await SingleTodo.findOneAndUpdate(
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
