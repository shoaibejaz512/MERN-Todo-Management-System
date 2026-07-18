import { Router } from "express";
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import { validate } from "../middlewears/validatorsMddleware/validation.middleware.js";
import { single_todo_schema } from "../validations/singleTodo.validations.js";
import {
  createSoloTodo,
  generateAITodo,
  saveAITodo,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTask,
  getAllTasks,
} from "../controllers/soloTodo.controller.js";
import { aiRateLimit } from "../middlewears/rate-limiter-flexible-middlewear/aiRateLimiter.js";

const router = Router();

router
  .route("/create-task")
  .post(verifyJWT, validate(single_todo_schema), createSoloTodo);
router
  .route("/create-task/ai/generate")
  .post(verifyJWT, aiRateLimit, generateAITodo);
router.route("/create-task/ai/save").post(verifyJWT, saveAITodo);

router.route("/update/:id").put(verifyJWT, updateTask);
router.route("/:id/status").patch(verifyJWT, updateTaskStatus);
router.route("/delete-task/:id").delete(verifyJWT, deleteTask);
router.route("/:id").get(verifyJWT, getTask);
router.route("/").get(verifyJWT, getAllTasks);

export default router;
