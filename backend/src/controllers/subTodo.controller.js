import { Mongoose } from "mongoose";
import { SubTodo } from "../models/subTodo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";

const getSubTaskById = async (req, res) => {};
const updateSubTask = async (req, res) => {
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
    const task = await SubTodo.findOne({
      _id: id,
      createdBy: req.user.userId,
      isDeleted: false,
      isArchived: false,
    });

    //STEP:3 CHECK THE TASK IF FIND OR NOT
    if (!task) {
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
const updateSubTaskStatus = async (req, res) => {};
const archiveSubTask = async (req, res) => {};
const restoreSubTask = async (req, res) => {};
const deleteSubTask = async (req, res) => {};

export {
  getSubTaskById,
  updateSubTask,
  updateSubTaskStatus,
  archiveSubTask,
  restoreSubTask,
  deleteSubTask,
};
