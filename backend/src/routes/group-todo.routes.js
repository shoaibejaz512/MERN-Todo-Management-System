import {Router} from "express"
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import {
  generateAIGroupTodo,
  getGroupTodoById,
  getAllGroupTodos,
  createGroupTodo,
  deleteGroupTodo,
  archiveGroupTodo,
  restoreGroupTodo,
  saveAIGroupTodo,
  updateGroupTodo,
  updateGroupTodoStatus,
} from "../controllers/groupTodo.controller.js";

const router = Router();

router.route("/").post(verifyJWT,createGroupTodo);
router.route("/ai/generate").post(verifyJWT,generateAIGroupTodo);
router.route("/ai/save").post(verifyJWT,saveAIGroupTodo);
router.route("/").get(verifyJWT,getAllGroupTodos);
router.route("/:id").get(verifyJWT,getGroupTodoById);
router.route("/:id").delete(verifyJWT,deleteGroupTodo);
router.route("/:id").put(verifyJWT, updateGroupTodo);
router.route("/groups:id/status").patch(verifyJWT, updateGroupTodoStatus);
router.route("/:id/archive").patch(verifyJWT,archiveGroupTodo);
router.route("/:id/restore").patch(verifyJWT,restoreGroupTodo);

// router.route("/:id").delete(verifyJWT, deletSubTask);
// router.route("/:id").put(verifyJWT, updateSubTask);
// router.route("/subtasks/:id/status").patch(verifyJWT, updateSubTaskStatus);




export default router;