// middlewares/authorizeGroupPermission.js

import mongoose from "mongoose";
import { Todo } from "../models/todo.model.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import { can } from "../utils/todoPermissions.js";

export const authorizeGroupPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;

      // STEP 1: Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid task ID", false));
      }

      // STEP 2: Find Group Todo
      const task = await Todo.findById(id);

      if (!task) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Group task not found", false));
      }

      // STEP 3: Owner has all permissions
      if (task.createdBy.toString() === req.user.userId.toString()) {
        req.groupTask = task;
        req.userRole = "owner";
        return next();
      }

      // STEP 4: Check whether user is a member
      const member = task.participants.find(
        (member) => member.user.toString() === req.user.userId.toString()
      );

      if (!member) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "You are not a member of this group task",
              false
            )
          );
      }

      // STEP 5: Check Permission
      if (!can(member.role, permission)) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              `Role '${member.role}' is not allowed to '${permission}' this task`,
              false
            )
          );
      }

      // STEP 6: Attach task and role
      req.groupTask = task;
      req.userRole = member.role;

      next();
    } catch (error) {
      return res
        .status(500)
        .json(new ApiResponse(500, null, error.message, false));
    }
  };
};
