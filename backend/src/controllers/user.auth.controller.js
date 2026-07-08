import { bgGreen, green, redBright } from "colorette";
import { sendWelcomeEmail } from "../service/nodemailers/emailService.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import bcrypt from "bcryptjs";
import {User} from "../models/user.model.js";
import { signAccessToken, signRefreshToken } from "../utils/generateTokens.js";
import { setAuthCookies } from "../utils/setAuthCookies.js";

const registerUser = async (req, res) => {

  //get all the values
  const { name, email, password, bio } = req.body;
  try {
    //validate the input exist or not
    if (!name || !email || !password || !bio) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "all fields are required", false));
    }

    //check already user exist on our database
    const userIsExist = await User.findOne({ email: email });
    if (userIsExist) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "User already exists", false));
    }

    //hased password
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      bio
    });

    if (!user) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "User not created", false));
    }

    //generate access and refresh token
    const access_token = signAccessToken(user);
    const refres_token = signRefreshToken(user);

    //set tokens to cookie
    setAuthCookies(res, access_token, refres_token);

    //send welcome email
    sendWelcomeEmail(user);

    //send successfull response to the user ✅✅
    console.log(green("User created successfully"));
    return res
      .status(201)
      .json(new ApiResponse(201, user, "User created successfully", true));
  } catch (error) {
    console.log(red(`User not created : ${error.message}`));
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const loginUser = async (req, res) => {};
const logoutUser = async (req, res) => {};

export { registerUser, loginUser, logoutUser };
