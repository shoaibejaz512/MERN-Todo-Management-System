import mongoose from "mongoose";
import { Todo } from "../models/todo.model.js";
import { socketAuthMiddleware } from "./middleware/socketAuth.middleware.js";
import { green } from "colorette";

export const initializeSocket = (io) => {
  io.use(socketAuthMiddleware);
  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Join a task room
    socket.on("task:join", async ({ taskId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(taskId)) {
          return socket.emit("socket:error", {
            message: "Invalid task id",
          });
        }
        const task = await Todo.findOne({
          _id: taskId,
          isDeleted: false,
          isArchived: false,
          $or: [
            { createdBy: socket.userId },
            {
              participants: {
                $elemMatch: {
                  user: socket.userId,
                },
              },
            },
          ],
        });

        if (!task) {
          return socket.emit("socket:error", {
            message: "You are not a participant of this task.",
          });
        }

        socket.join(`task:${taskId}`);

        socket.emit("task:joined", {
          taskId,
        });

        console.log(green(`${socket.userId} joined task:${taskId}`));
      } catch (error) {
        socket.emit("socket:error", {
          message: error.message,
        });
      }
    });

    // Leave room
    socket.on("task:leave", ({ taskId }) => {
      socket.leave(`task:${taskId}`);

      console.log(`${socket.id} left task:${taskId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Disconnected: ${socket.id}`);
    });
  });
};
