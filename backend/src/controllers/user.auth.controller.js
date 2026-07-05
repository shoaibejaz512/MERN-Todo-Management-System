import { green } from "colorette";

const registerUser = async (req, res) => {
    return res.status(200).json({
        success:true,
        message:"user created successfully"
    })
};
const loginUser = async (req, res) => {};
const logoutUser = async (req, res) => {};

export { registerUser, loginUser, logoutUser };
