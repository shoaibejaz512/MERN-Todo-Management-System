import {Router} from "express"
import { loginUser, logoutUser, registerUser } from "../controllers/user.auth.controller.js";
import { validate } from "../middlewears/validatorsMddleware/validation.middleware.js";
import { registerSchema } from "../validations/user.validation.js";

const router = Router();

router.route("/register").post(validate(registerSchema), registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(logoutUser);

export default router;