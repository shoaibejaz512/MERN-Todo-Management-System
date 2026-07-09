import { bgGreen, green, redBright } from "colorette";
import { sendWelcomeEmail } from "../service/nodemailers/emailService.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
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
      bio,
    });

    if (!user) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "User not created", false));
    }

    //generate access and refresh token
    const access_token = signAccessToken(user);
    const refres_token = signRefreshToken(user);
    user.refreshToken = refres_token;
    await user.save();

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
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    //validate the input exist or not
    if (!email || !password) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "all fields are required", false));
    }

    //STEP:1 EMAIL VERIFICATION
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "Email or password is incorrect", false)
        );
    }

    //STEP:2 PASSWORD VERIFICATION
    let checkPassword = await bcrypt.compare(password, user.password);
    if (!checkPassword) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "Email or password is incorrect", false)
        );
    }

    //STEP:3 GENERATE TOKENS
    const access_token = signAccessToken(user);
    const refres_token = signRefreshToken(user);
    user.refreshToken = refres_token;
    await user.save();

    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    //set tokens to cookie
    setAuthCookies(res, access_token, refres_token);

    //send successfull response to the user ✅✅
    console.log(green("User Login successfully"));
    return res
      .status(200)
      .json(
        new ApiResponse(200, loggedInUser, "User Login successfully", true)
      );
  } catch (error) {
    console.log(red(`User Login failed: ${error.message}`));
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const logoutUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.user.userId,
      {
        $unset: {
          refreshToken: 1,
        },
      },
      {
        new: true,
      }
    );
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    });

    return res
      .status(200)
      .json(new ApiResponse(200, null, "User logged out successfully", true));
  } catch (error) {
    console.error(red(`Logout failed: ${error.message}`));

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal server error", false));
  }
};

export { registerUser, loginUser, logoutUser };
