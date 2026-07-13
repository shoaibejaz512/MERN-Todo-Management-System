// middleware/checkTodoPermission.js
import { Todo } from "../models/todo.model.js";
import { can } from "../permissions/todoPermissions.js";

export function requireTodoPermission(action) {
  return async (req, res, next) => {
    const todo = await Todo.findById(req.params.todoId);
    if (!todo) return res.status(404).json({ message: "Todo not found" });

    const participant = todo.participants.find(
      (p) => p.user.toString() === req.user._id.toString()
    );

    if (!participant) {
      return res.status(403).json({ message: "You are not part of this task" });
    }

    if (!can(participant.role, action)) {
      return res.status(403).json({
        message: `Role '${participant.role}' cannot '${action}' this task`,
      });
    }

    req.todo = todo;
    req.todoRole = participant.role;
    next();
  };
}

// Reusable for socket.io handlers too — no Express req/res needed
export async function checkTodoPermissionRaw(todoId, userId, action) {
  const todo = await Todo.findById(todoId);
  if (!todo) return { allowed: false, reason: "not_found" };

  const participant = todo.participants.find(
    (p) => p.user.toString() === userId.toString()
  );
  if (!participant) return { allowed: false, reason: "not_participant" };
  if (!can(participant.role, action))
    return { allowed: false, reason: "forbidden" };

  return { allowed: true, todo, role: participant.role };
}
