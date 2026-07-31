import { Router } from "express";
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import { archiveSubTask, deleteSubTask, getSubTaskById, restoreSubTask } from "../controllers/subTodo.controller.js";
import { updateSubTask, updateSubTaskStatus } from "../controllers/subTodo.controller.js";

const router = Router();

router.route("/:id").get(verifyJWT, getSubTaskById);
router.route("/:id").put(verifyJWT, updateSubTask);
router.route("/:id/status").patch(verifyJWT, updateSubTaskStatus);
router.route("/:id/archive").patch(verifyJWT, archiveSubTask);
router.route("/:id/restore").patch(verifyJWT, restoreSubTask);
router.route("/:id").delete(verifyJWT, deleteSubTask);

export default router;