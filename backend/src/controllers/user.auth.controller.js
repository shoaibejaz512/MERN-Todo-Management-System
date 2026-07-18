import { bgGreen, green, red, redBright } from "colorette";
import {
  sendPasswordResetOtp,
  sendWelcomeEmail,
} from "../service/nodemailers/emailService.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import { signAccessToken, signRefreshToken } from "../utils/generateTokens.js";
import { setAuthCookies } from "../utils/setAuthCookies.js";
import { uploadToCloudinary } from "../utils/fileupload.js";
import jwt from "jsonwebtoken";

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
    user.refreshTokens.push({
      token: refres_token,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
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
    user.refreshTokens.push({
      token: refres_token,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
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
    await User.findByIdAndUpdate(req.user.userId, {
      new: true,
    });

    user.refreshTokens = user.refreshTokens.filter(
      (session) => session.token !== req.cookies.refreshToken
    );

    await user.save();

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
const sendPasswordResetOTP = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email)
      return res
        .status(400)
        .json(new ApiResponse(403, null, "email is required", false));
    //STEP:1 FIND USER
    const user = await User.findOne({ email });
    //STEP:2 VALIDATE USER
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    //STEP:3 GENERATE OTP
    const passwordResetOTP = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const hashedPasswordResetOTP = await bcrypt.hash(passwordResetOTP, 10);
    user.passwordResetToken = hashedPasswordResetOTP;
    user.passwordResetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    //STEP:4 SEND OTP TO THE USER EMAIL
    sendPasswordResetOtp(user, passwordResetOTP);

    //STEP:5 SEND DATA TO THE USER JSON
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          user.name,
          "Password reset OTP SEND ON EMAIL",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const verifyPasswordResetOtp = async (req, res) => {
  const { email, otp } = req.body;
  try {
    //STEP:1 OTP IS GIVEN
    if (!otp || !email) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "both OTP and email is required", false)
        );
    }
    //STEP:2 FIND USER
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    //STEP:3 CHECK IS OTP IN THE DATABASE OR NOT
    if (!user.passwordResetToken) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No password reset OTP found", false));
    }

    //CHECK THE EXPIRATION DATE OF PASSWORD REST OTP
    if (
      !user.passwordResetTokenExpires ||
      user.passwordResetTokenExpires < Date.now()
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "OTP has expired", false));
    }

    //STEP:4 DECODE THE HASHED OTP FROM DATABASE
    const checkOtp = await bcrypt.compare(otp, user.passwordResetToken);
    if (!checkOtp) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid OTP", false));
    }

    //STEP5:CLEAR THE PASSWORD RESET OTP FROM DATABASE
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    user.isPasswordResetOtpVerified = true;
    await user.save();

    // OTP verified...
    const resetToken = jwt.sign(
      {
        userId: user._id,
        purpose: "password-reset",
      },
      process.env.RESET_PASSWORD_SECRET,
      {
        expiresIn: "10m",
      }
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          resetToken,
        },
        "OTP verified successfully",
        true
      )
    );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const forgotPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;

  try {
    // STEP 1
    if (!resetToken || !newPassword) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Reset token and new password are required",
            false
          )
        );
    }

    // STEP 2
    let decoded;

    try {
      decoded = jwt.verify(resetToken, process.env.RESET_PASSWORD_SECRET);
    } catch (error) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "Reset token expired or invalid", false)
        );
    }

    // STEP 3
    if (decoded.purpose !== "password-reset") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid reset token", false));
    }

    // STEP 4
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // STEP 5
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;

    // Optional: invalidate all logged-in sessions
    user.refreshToken = [];

    await user.save();

    // STEP 6
    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully", true));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    // STEP 1: Validate input
    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Old password and new password are required",
            false
          )
        );
    }

    // STEP 2: Find logged-in user
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // STEP 3: Verify old password
    const isOldPasswordCorrect = await bcrypt.compare(
      oldPassword,
      user.password
    );

    if (!isOldPasswordCorrect) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "Current password is incorrect", false)
        );
    }

    // STEP 4: Prevent same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "New password must be different from current password",
            false
          )
        );
    }

    // STEP 5: Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;

    // STEP 6: Logout all devices
    user.refreshToken = [];

    await user.save();

    // STEP 7: Success response
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Password changed successfully. Please login again.",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};
const refreshAccessToken = async (req, res) => {
  try {
    // STEP 1: Get refresh token from cookies
    const incomingRefreshToken = req.cookies?.refreshToken;

    if (!incomingRefreshToken) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Refresh token is required", false));
    }

    // STEP 2: Verify JWT
    const decoded = jwt.verify(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    // STEP 3: Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // STEP 4: Find session
    const session = user.refreshTokens.find(
      (session) => session.token === incomingRefreshToken
    );

    if (!session) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid refresh token", false));
    }

    // STEP 5: Check database expiry
    if (session.expiresAt < new Date()) {
      user.refreshTokens = user.refreshTokens.filter(
        (s) => s.token !== incomingRefreshToken
      );

      await user.save();

      return res
        .status(401)
        .json(new ApiResponse(401, null, "Refresh token expired", false));
    }

    // STEP 6: Generate new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // STEP 7: Rotate refresh token
    session.token = newRefreshToken;
    session.createdAt = new Date();
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await user.save();

    // STEP 8: Set cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    // STEP 9: Response
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          accessToken: newAccessToken,
        },
        "Access token refreshed successfully",
        true
      )
    );
  } catch (error) {
    console.error(error);

    return res
      .status(401)
      .json(
        new ApiResponse(401, null, "Refresh token expired or invalid", false)
      );
  }
};

const updateUserProfile = async (req, res) => {
  //STEP:1 TAKE DATA FROM THE USER
  const { name, email, bio } = req.body;
  try {
    //STEP:2 VALIDATE FILEDS
    if (!name || !email || !bio) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "All fields are required", false));
    }

    //SETUP PROFILE IMAGE UPDATE LOGIC
    let profileImage;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      profileImage = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    //CHECK USER ALREADY EXIST JUST FOR DUPLICATE EMAIL
    const existingUser = await User.findOne({
      email,
      _id: { $ne: req.user.userId },
    });

    if (existingUser) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Email already exists", false));
    }

    //STEP:3 FIND USER
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        name,
        email,
        bio,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password -refreshToken");
    //STEP:4 CHECK USER IS EXIST OR NO T
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    //UPDATE THE PROFILE IMAGE IF IS EXIST
    if (profileImage) {
      user.profileImage = profileImage;
      await user.save();
    }

    //STEP:6 RETURN SUCCESS RESPONSE TO THE USER
    return res
      .status(201)
      .json(new ApiResponse(201, user, "Profile update successfully", true));
  } catch (error) {
    console.log(red(`Profile update error : ${error.message}`));
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select(
      "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
    );

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, user, "User profile fetched successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    // SEARCH KA QUERY BANANA
    // agar search text diya gaya hai to name ya email mein dhoondo
    const searchQuery = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const users = await User.find(searchQuery)
      .select(
        "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
      )
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(searchQuery);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          users,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
        "Users fetched successfully",
        true
      )
    );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    //STEP:1 FIND USER BY ID
    const user = await User.findById(userId).select(
      "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
    );
    //STEP:2 VALIDATE THE USER EXIST OR NOT
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }
    //STEP:3 RETURN SUCCESS RESPONSE TO THE USER
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          user,
          "Get current user profile successfully",
          true
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

const deleteMyAccount = async (req, res) => {
  const user = await User.findByIdAndDelete(req.user.userId);

  clearAuthCookies(res);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Account deleted successfully", true));
};

export {
  registerUser,
  loginUser,
  logoutUser,
  sendPasswordResetOTP,
  verifyPasswordResetOtp,
  forgotPassword,
  refreshAccessToken,
  updateUserProfile,
  getAllUsers,
  getUserProfile,
  getCurrentUser,
  changePassword,
  deleteMyAccount,
};
