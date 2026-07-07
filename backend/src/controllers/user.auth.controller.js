import { green } from "colorette";
import { sendWelcomeEmail } from "../service/nodemailers/emailService.js";

const registerUser = async (req, res) => {
    return res.status(200).json({
        success:true,
        message:"user created successfully"
    })
    await sendWelcomeEmail("shoaib");
};
const loginUser = async (req, res) => {};
const logoutUser = async (req, res) => {};

export { registerUser, loginUser, logoutUser };
