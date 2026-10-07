import { bgGreen, green, red, redBright } from "colorette";
import {
  sendPasswordResetOtp,
  sendUpdateEmailOtp,
  sendWelcomeEmail,
} from "../service/nodemailers/emailService.js";
import ApiResponse from "../utils/apiResponseHandler.js";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import { signAccessToken, signRefreshToken } from "../utils/generateTokens.js";
import { setAuthCookies } from "../utils/setAuthCookies.js";
import { uploadToCloudinary } from "../utils/fileupload.js";
import jwt from "jsonwebtoken";
import { clearAuthCookies } from "../utils/clearAuthCookies.js";
import Session from "../models/user.session.model.js";
import {
  getCache,
  setCache,
  deleteCache,
} from "../service/redis/redis.service.js";
import { emailVerificationOtpKey, updateEmailOtp, userKey, userNotificationKey, usersKey } from "../utils/chacheKeys.js";
import { deleteFromCloudinary } from "../service/cloudinary.service.js";
import mongoose from "mongoose";
import crypto from "crypto";

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

// ==========================================================
// LOGIN USER
// ==========================================================

const loginUser = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get login credentials
    // ----------------------------------------------------------

    const { email, password } = req.body;

    // ----------------------------------------------------------
    // 2. Validate input
    // ----------------------------------------------------------

    if (!email || !password) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Email and password are required",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 3. Normalize email
    // ----------------------------------------------------------

    const normalizedEmail = email
      .toLowerCase()
      .trim();

    // ----------------------------------------------------------
    // 4. Find user
    // ----------------------------------------------------------

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res
        .status(401)
        .json(
          new ApiResponse(
            401,
            null,
            "Email or password is incorrect",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 5. Verify password
    // ----------------------------------------------------------

    const isPasswordCorrect =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isPasswordCorrect) {
      return res
        .status(401)
        .json(
          new ApiResponse(
            401,
            null,
            "Email or password is incorrect",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 6. Check user ID
    // ----------------------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(
        user._id
      )
    ) {
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Invalid user account",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 7. Get request/device information
    // ----------------------------------------------------------

    const userAgent =
      req.get("user-agent") || "Unknown";

    const ipAddress =
      req.ip || "Unknown";

    // ----------------------------------------------------------
    // 8. Session expiration
    // ----------------------------------------------------------
    // Refresh token lifetime = 7 days
    // ----------------------------------------------------------

    const expiresAt = new Date(
      Date.now() +
        7 * 24 * 60 * 60 * 1000
    );

    // ----------------------------------------------------------
    // 9. Create Session
    // ----------------------------------------------------------
    // We create the session FIRST because the session._id
    // will be included inside the JWT payload.
    // ----------------------------------------------------------

    const session = new Session({
      user: user._id,

      device: "Unknown Device",

      browser: "Unknown Browser",

      os: "Unknown OS",

      ipAddress,

      userAgent,

      createdAt: new Date(),

      lastActiveAt: new Date(),

      expiresAt,
    });

    // ----------------------------------------------------------
    // 10. Generate Access Token
    // ----------------------------------------------------------
    // Payload:
    //
    // {
    //   userId,
    //   sessionId
    // }
    // ----------------------------------------------------------

    const accessToken =
      signAccessToken(
        user,
        session._id
      );

    // ----------------------------------------------------------
    // 11. Generate Refresh Token
    // ----------------------------------------------------------

    const refreshToken =
      signRefreshToken(
        user,
        session._id
      );

    // ----------------------------------------------------------
    // 12. Hash Refresh Token
    // ----------------------------------------------------------
    // NEVER store the raw refresh token in MongoDB.
    // ----------------------------------------------------------

    const refreshTokenHash =
      crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

    // ----------------------------------------------------------
    // 13. Store refresh token hash inside Session
    // ----------------------------------------------------------

    session.refreshTokenHash =
      refreshTokenHash;

    // ----------------------------------------------------------
    // 14. Save Session
    // ----------------------------------------------------------

    await session.save();

    // ----------------------------------------------------------
    // 15. Get safe user information
    // ----------------------------------------------------------
    // Don't return password or refresh token information.
    // ----------------------------------------------------------

    const loggedInUser =
      await User.findById(user._id)
        .select(
          "-password -refreshTokens"
        )
        .lean();

    // ----------------------------------------------------------
    // 16. Set authentication cookies
    // ----------------------------------------------------------

    setAuthCookies(
      res,
      accessToken,
      refreshToken
    );

    // ----------------------------------------------------------
    // 17. Success response
    // ----------------------------------------------------------

    console.log(
      green(
        `User login successful: ${user._id}`
      )
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          loggedInUser,
          "User login successful",
          true
        )
      );

  } catch (error) {

    // ----------------------------------------------------------
    // Error handling
    // ----------------------------------------------------------

    console.log(
      red(
        `User login failed: ${error.message}`
      )
    );

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Login failed",
          false
        )
      );
  }
};

// ==========================================================
// LOGOUT USER
// ==========================================================

const logoutUser = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user information
    // ----------------------------------------------------------

    const userId = req.user?.userId;
    const sessionId = req.user?.sessionId;

    // ----------------------------------------------------------
    // 2. Validate authentication data
    // ----------------------------------------------------------

    if (!userId || !sessionId) {
      return res
        .status(401)
        .json(
          new ApiResponse(
            401,
            null,
            "Authentication session is required",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 3. Validate MongoDB ObjectIds
    // ----------------------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(sessionId)
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Invalid authentication session", false)
        );
    }

    // ----------------------------------------------------------
    // 4. Revoke current session
    // ----------------------------------------------------------
    // We use both user + session ID so a user cannot revoke
    // another user's session.
    // ----------------------------------------------------------

    const revokedSession = await Session.findOneAndUpdate(
      {
        _id: sessionId,
        user: userId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      },
      {
        new: true,
      }
    );

    // ----------------------------------------------------------
    // 5. Clear authentication cookies
    // ----------------------------------------------------------
    // Cookie options should match the options used when
    // creating the cookies.
    // ----------------------------------------------------------

    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    // ----------------------------------------------------------
    // 6. Session already revoked / expired
    // ----------------------------------------------------------
    // Even if the session doesn't exist, clearing the cookies
    // makes the client logged out.
    // ----------------------------------------------------------

    if (!revokedSession) {
      console.log(
        green(`Logout completed — session already inactive: ${sessionId}`)
      );

      return res
        .status(200)
        .json(new ApiResponse(200, null, "User logged out successfully", true));
    }

    // ----------------------------------------------------------
    // 7. Successful logout
    // ----------------------------------------------------------

    console.log(green(`User logged out successfully: ${userId}`));

    return res
      .status(200)
      .json(new ApiResponse(200, null, "User logged out successfully", true));
  } catch (error) {
    // ----------------------------------------------------------
    // 8. Error handling
    // ----------------------------------------------------------

    console.error(red(`Logout failed: ${error.message}`));

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to logout user", false));
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
  try {
    // STEP 1: Get data from request
    const { name, email, bio } = req.body;
    const { id } = req.params;

    //VALIDATE THE ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid id", false));
    }

    // STEP 2: Validate required fields
    if (!name?.trim() || !email?.trim()) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Name and email are required", false));
    }

    // STEP 3: Normalize input
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedBio = bio?.trim() || "";

    // STEP 4: Find user
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // STEP 5: Check duplicate email
    const duplicateEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: id },
    });

    if (duplicateEmail) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Email already exists", false));
    }

    // Keep old image information
    const oldProfileImage = existingUser.profileImage;

    // STEP 6: Upload new profile image if provided
    let newProfileImage = existingUser.profileImage;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      newProfileImage = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    // STEP 7: Update user
    existingUser.name = normalizedName;
    existingUser.email = normalizedEmail;
    existingUser.bio = normalizedBio;
    existingUser.profileImage = newProfileImage;

    const user = await existingUser.save();

    // STEP 8: Remove sensitive fields from response
    user.password = undefined;
    user.refreshTokens = undefined;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;

    // STEP 9: Invalidate user profile cache
    const cacheKey = userKey(id);

    await deleteCache(cacheKey);

    // STEP 10: Delete old Cloudinary image
    // Only delete if a new image was uploaded
    // and an old image actually existed.
    if (
      req.file &&
      oldProfileImage?.publicId &&
      oldProfileImage.publicId !== newProfileImage.publicId
    ) {
      try {
        await deleteFromCloudinary(oldProfileImage.publicId);
      } catch (cloudinaryError) {
        console.error(
          `Old profile image deletion failed: ${cloudinaryError.message}`
        );
      }
    }

    // STEP 11: Return success response
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Profile updated successfully", true));
  } catch (error) {
    console.error(`Profile update error: ${error.message}`);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update profile", false));
  }
};

// other users profile
const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user ID", false));
    }

    const cacheKey = userKey(id);

    // Check Redis cache first
    const cachedUser = await getCache(cacheKey);

    if (cachedUser) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            cachedUser,
            "User profile fetched successfully",
            true
          )
        );
    }

    // Cache miss → fetch from MongoDB
    const user = await User.findById(id)
      .select(
        "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
      )
      .lean();

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // Store user in Redis
    await setCache(cacheKey, user, 300);

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
    const search = req.query.search?.trim() || "";

    const skip = (page - 1) * limit;

    // Create unique cache key for pagination + search
    const cacheKey = usersKey(page, limit, search);

    // Check Redis cache first
    const cachedUsers = await getCache(cacheKey);

    if (cachedUsers) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, cachedUsers, "Users fetched successfully", true)
        );
    }

    // Build search query
    const searchQuery = search
      ? {
          $or: [
            {
              name: {
                $regex: search,
                $options: "i",
              },
            },
            {
              email: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        }
      : {};

    // Fetch users and total count
    const [users, total] = await Promise.all([
      User.find(searchQuery)
        .select(
          "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
        )
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(searchQuery),
    ]);

    // Prepare response data
    const responseData = {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Store complete response in Redis
    await setCache(cacheKey, responseData, 300);

    return res
      .status(200)
      .json(
        new ApiResponse(200, responseData, "Users fetched successfully", true)
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message, false));
  }
};

//requested user profile
const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    let cacheKey = userKey(userId);
    let cachedUser = await getCache(cacheKey);
    if (cachedUser) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            cachedUser,
            "Get current user profile successfully",
            true
          )
        );
    }
    //STEP:1 FIND USER BY ID
    const user = await User.findById(userId)
      .select(
        "-password -refreshToken -passwordResetToken -passwordResetTokenExpires"
      )
      .lean();
    //STEP:2 VALIDATE THE USER EXIST OR NOT
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    await setCache(cacheKey, user, 300); // Cache the user data for 5 minutes

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

  if (!user) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User not found", false));
  }

  clearAuthCookies(res);

  let cacheKey = userKey(req.user.userId);
  await deleteCache(cacheKey);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Account deleted successfully", true));
};
const searchUser = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q?.trim()) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Search query is required", false));
    }

    const userQuery = q.trim().toLowerCase();

    // Redis cache key
    const cacheKey = `user:search:${userQuery}`;

    // 1. Check Redis first
    const cachedUsers = await getCache(cacheKey);

    if (cachedUsers) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            cachedUsers,
            "Users retrieved successfully",
            true
          )
        );
    }

    // 2. Cache miss → search MongoDB
    const users = await User.find({
      name: {
        $regex: userQuery,
        $options: "i",
      },
    })
      .select("name email profileImage bio")
      .limit(10)
      .lean();

    // 3. No users found
    if (!users.length) {
      return res
        .status(404)
        .json(new ApiResponse(404, [], "No users found", false));
    }

    // 4. Store result in Redis for 5 minutes
    await setCache(cacheKey, users, 300);

    // 5. Return users
    return res
      .status(200)
      .json(new ApiResponse(200, users, "Users retrieved successfully", true));
  } catch (error) {
    console.error("Search users error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal server error", false));
  }
};


//save otp inside redis not db 
const generateEmailVerificationOtp = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user id", false));
    }

    const user = await User.findById(id).select("email isVerified");

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    if (user.isVerified) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Email is already verified", false));
    }

    const cacheKey = emailVerificationOtpKey(id);

    // Check if OTP already exists
    const existingOtp = await getCache(cacheKey);

    if (existingOtp) {
      return res.status(429).json(
        new ApiResponse(
          429,
          null,
          "OTP already sent. Please wait before requesting another OTP.",
          false
        )
      );
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store OTP in Redis for 5 minutes
    await setCache(cacheKey, otp, 300);

    await sendEmail({
      to: user.email,
      subject: "Verify your FlowDo email",
      text: `Your FlowDo verification OTP is ${otp}. It expires in 10 minutes.`,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        null,
        "Verification OTP sent successfully",
        true
      )
    );
  } catch (error) {
    console.error(`Generate email OTP failed: ${error.message}`);

    return res.status(error.statusCode || 500).json(
      new ApiResponse(
        error.statusCode || 500,
        null,
        error.message || "Internal server error",
        false
      )
    );
  }
};

const verifyEmail = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user id", false));
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "OTP must be a valid 6-digit code", false)
        );
    }

    const cacheKey = emailVerificationOtpKey(id);

    // Get OTP from Redis
    const storedOtp = await getCache(cacheKey);

    if (!storedOtp) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Verification OTP has expired or was not found",
            false
          )
        );
    }

    // Compare OTP
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    if (hashedOtp !== storedOtp) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid verification OTP", false));
    }

    let user;
    let notification;

    await session.withTransaction(async () => {
      user = await User.findById(id)
        .select("name profileImage bio isVerified")
        .session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (user.isVerified) {
        const error = new Error("Email is already verified");
        error.statusCode = 409;
        throw error;
      }

      // Verify email
      user.isVerified = true;

      await user.save({ session });

      // Create notification
      [notification] = await Notification.create(
        [
          {
            user: user._id,
            sender: user._id,
            type: "EMAIL_VERIFIED",
            title: "Email Verified",
            message: `${user.name}, your email has been verified.`,
          },
        ],
        { session }
      );
    });

    // Delete OTP only after successful MongoDB transaction
    await deleteCache(cacheKey);

    // Emit only after transaction succeeds
    io.to(`user:${id}`).emit("notification", notification);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          id: user._id,
          name: user.name,
          profileImage: user.profileImage,
          bio: user.bio,
          isVerified: user.isVerified,
        },
        "Email verified successfully",
        true
      )
    );
  } catch (error) {
    console.error(`Email verification failed: ${error.message}`);

    const statusCode = error.statusCode || 500;

    return res
      .status(statusCode)
      .json(
        new ApiResponse(
          statusCode,
          null,
          error.message || "Internal server error",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};
// ============================================================
// Generate OTP for Email Update
// ============================================================


const generateUpdateEmailOtp = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user ID
    // ----------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(
          new ApiResponse(
            401,
            null,
            "Unauthorized",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 2. Validate MongoDB ObjectId
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid user id",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 3. Redis keys
    // ----------------------------------------------------------

    const otpKey = updateEmailOtp(userId);

    const cooldownKey = `update-email-otp:cooldown:${userId}`;

    // ----------------------------------------------------------
    // 4. Check resend cooldown
    //
    // User must wait 60 seconds before requesting
    // another OTP.
    // ----------------------------------------------------------

    const cooldownExists = await getCache(cooldownKey);

    if (cooldownExists) {
      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "Please wait before requesting another OTP",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 5. Check if an active OTP already exists
    //
    // OTP remains valid for 5 minutes.
    // ----------------------------------------------------------

    const existingOtp = await getCache(otpKey);

    if (existingOtp) {
      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "An OTP has already been sent. Please check your email.",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 6. Find authenticated user
    // ----------------------------------------------------------

    const user = await User.findById(userId)
      .select("_id name email")
      .lean();

    if (!user) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "User not found",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 7. Generate cryptographically secure 6-digit OTP
    // ----------------------------------------------------------

    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    // ----------------------------------------------------------
    // 8. Hash OTP before storing it in Redis
    //
    // Raw OTP is only used for sending the email.
    // Redis stores only the SHA-256 hash.
    // ----------------------------------------------------------

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // ----------------------------------------------------------
    // 9. Store hashed OTP in Redis
    //
    // TTL = 300 seconds = 5 minutes
    // ----------------------------------------------------------

    await setCache(
      otpKey,
      hashedOtp,
      300
    );

    // ----------------------------------------------------------
    // 10. Set resend cooldown
    //
    // TTL = 60 seconds
    // ----------------------------------------------------------

    await setCache(
      cooldownKey,
      "1",
      60
    );

    // ----------------------------------------------------------
    // 11. Send OTP through email
    // ----------------------------------------------------------

    try {
      await sendUpdateEmailOtp(user, otp);
    } catch (emailError) {
      // Email failed, so invalidate the OTP and cooldown.
      await Promise.allSettled([
        deleteCache(otpKey),
        deleteCache(cooldownKey),
      ]);

      console.error(
        "Update email OTP email error:",
        emailError.message
      );

      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Failed to send OTP",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 12. Success response
    //
    // NEVER return the OTP.
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "OTP sent successfully. Please check your email.",
          true
        )
      );
  } catch (error) {
    console.error(
      "Generate update email OTP error:",
      error.message
    );

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to generate OTP",
          false
        )
      );
  }
};


const verifyUpdateEmailOtp = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user
    // ----------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(
          new ApiResponse(
            401,
            null,
            "Unauthorized",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 2. Get request data
    // ----------------------------------------------------------

    const { otp, email } = req.body;

    // ----------------------------------------------------------
    // 3. Validate user ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid user id",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 4. Validate OTP
    // ----------------------------------------------------------

    if (!otp || !/^\d{6}$/.test(otp)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "OTP must be a valid 6-digit code",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 5. Validate email
    // ----------------------------------------------------------

    if (!email || typeof email !== "string") {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Email is required",
            false
          )
        );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Please provide a valid email address",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 6. Redis keys
    // ----------------------------------------------------------

    const otpKey = updateEmailOtp(userId);

    const attemptKey =
      `update-email-otp:attempts:${userId}`;

    // ----------------------------------------------------------
    // 7. Get stored hashed OTP
    // ----------------------------------------------------------

    const storedHashedOtp = await getCache(otpKey);

    if (!storedHashedOtp) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "OTP has expired or was not found",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 8. Check OTP attempts
    //
    // Maximum 5 incorrect attempts.
    // ----------------------------------------------------------

    const attempts =
      Number(await getCache(attemptKey)) || 0;

    if (attempts >= 5) {
      await deleteCache(otpKey);
      await deleteCache(attemptKey);

      return res
        .status(429)
        .json(
          new ApiResponse(
            429,
            null,
            "Too many incorrect OTP attempts. Please request a new OTP.",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 9. Hash submitted OTP
    // ----------------------------------------------------------

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // ----------------------------------------------------------
    // 10. Compare OTP securely
    // ----------------------------------------------------------

    const storedBuffer =
      Buffer.from(storedHashedOtp, "hex");

    const providedBuffer =
      Buffer.from(hashedOtp, "hex");

    const isOtpValid =
      storedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(
        storedBuffer,
        providedBuffer
      );

    if (!isOtpValid) {
      const newAttempts = attempts + 1;

      // Keep attempt counter for the remaining OTP lifetime.
      await setCache(
        attemptKey,
        newAttempts.toString(),
        300
      );

      if (newAttempts >= 5) {
        await deleteCache(otpKey);
        await deleteCache(attemptKey);

        return res
          .status(429)
          .json(
            new ApiResponse(
              429,
              null,
              "Too many incorrect OTP attempts. Please request a new OTP.",
              false
            )
          );
      }

      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid OTP",
            false
          )
        );
    }

    // ----------------------------------------------------------
    // 11. Start MongoDB transaction
    // ----------------------------------------------------------

    let updatedUser;
    let notification;

    await session.withTransaction(async () => {
      // --------------------------------------------------------
      // 12. Get current user
      // --------------------------------------------------------

      const user = await User.findById(userId)
        .select("_id name email")
        .session(session);

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      // --------------------------------------------------------
      // 13. Check if new email is same as current email
      // --------------------------------------------------------

      if (
        user.email.toLowerCase() === normalizedEmail
      ) {
        throw new Error("SAME_EMAIL");
      }

      // --------------------------------------------------------
      // 14. Check if email already belongs to another user
      // --------------------------------------------------------

      const existingUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: userId },
      })
        .select("_id")
        .session(session);

      if (existingUser) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }

      // --------------------------------------------------------
      // 15. Update user's email
      // --------------------------------------------------------

      user.email = normalizedEmail;

      await user.save({ session });

      updatedUser = user;

      // --------------------------------------------------------
      // 16. Create notification
      // --------------------------------------------------------

      notification = await Notification.create(
        [
          {
            user: userId,
            type: "EMAIL_UPDATED",
            title: "Email updated successfully",
            message:
              "Your FlowDo account email address has been updated successfully.",
            data: {
              email: normalizedEmail,
            },
          },
        ],
        { session }
      );

      notification = notification[0];
    });

    // ----------------------------------------------------------
    // 17. Delete OTP and attempt counter
    //
    // OTP cannot be reused after successful verification.
    // ----------------------------------------------------------

    await Promise.allSettled([
      deleteCache(otpKey),
      deleteCache(attemptKey),
      deleteCache(
        `update-email-otp:cooldown:${userId}`
      ),
    ]);

    // ----------------------------------------------------------
    // 18. Return success
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            email: updatedUser.email,
          },
          "Email updated successfully",
          true
        )
      );
  } catch (error) {
    // ----------------------------------------------------------
    // Handle known errors
    // ----------------------------------------------------------

    if (error.message === "USER_NOT_FOUND") {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "User not found",
            false
          )
        );
    }

    if (error.message === "SAME_EMAIL") {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "This email is already associated with your account",
            false
          )
        );
    }

    if (error.message === "EMAIL_ALREADY_EXISTS") {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            "This email is already registered",
            false
          )
        );
    }

    console.error(
      "Verify update email OTP error:",
      error.message
    );

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to update email",
          false
        )
      );
  } finally {
    await session.endSession();
  }
};


const getUserStats = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user ID", false));
    }

    // ----------------------------------------------------------
    // 1. Redis cache key
    // ----------------------------------------------------------

    const cacheKey = userStatsKey(userId);

    // ----------------------------------------------------------
    // 2. Check Redis
    // ----------------------------------------------------------

    const cachedStats = await getCache(cacheKey);

    if (cachedStats) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
           cachedStats,
            "User stats fetched successfully",
            true
          )
        );
    }

    // ----------------------------------------------------------
    // 3. Cache MISS -> MongoDB
    // ----------------------------------------------------------

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [singleTodoStats, groupTodoStats] = await Promise.all([
      SingleTodo.aggregate([
        {
          $match: {
            createdBy: userObjectId,
            isDeleted: false,
            isArchived: false,
          },
        },
        {
          $group: {
            _id: null,

            total: { $sum: 1 },

            completed: {
              $sum: {
                $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
              },
            },

            pending: {
              $sum: {
                $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0],
              },
            },

            ongoing: {
              $sum: {
                $cond: [{ $eq: ["$status", "ON_GOING"] }, 1, 0],
              },
            },

            incomplete: {
              $sum: {
                $cond: [{ $eq: ["$status", "IN_COMPLETE"] }, 1, 0],
              },
            },

            start: {
              $sum: {
                $cond: [{ $eq: ["$status", "START"] }, 1, 0],
              },
            },
          },
        },
      ]),

      Todo.aggregate([
        {
          $match: {
            $or: [
              { createdBy: userObjectId },
              {
                "participants.user": userObjectId,
              },
            ],
            isDeleted: false,
            isArchived: false,
          },
        },
        {
          $group: {
            _id: null,

            total: { $sum: 1 },

            completed: {
              $sum: {
                $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
              },
            },

            pending: {
              $sum: {
                $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0],
              },
            },

            ongoing: {
              $sum: {
                $cond: [{ $eq: ["$status", "ON_GOING"] }, 1, 0],
              },
            },

            incomplete: {
              $sum: {
                $cond: [{ $eq: ["$status", "IN_COMPLETE"] }, 1, 0],
              },
            },

            start: {
              $sum: {
                $cond: [{ $eq: ["$status", "START"] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    // ----------------------------------------------------------
    // 4. Default values
    // ----------------------------------------------------------

    const personal = singleTodoStats[0] || {
      total: 0,
      completed: 0,
      pending: 0,
      ongoing: 0,
      incomplete: 0,
      start: 0,
    };

    const collaborative = groupTodoStats[0] || {
      total: 0,
      completed: 0,
      pending: 0,
      ongoing: 0,
      incomplete: 0,
      start: 0,
    };

    // ----------------------------------------------------------
    // 5. Overall stats
    // ----------------------------------------------------------

    const totalTasks = personal.total + collaborative.total;

    const completedTasks = personal.completed + collaborative.completed;

    const pendingTasks = personal.pending + collaborative.pending;

    const ongoingTasks = personal.ongoing + collaborative.ongoing;

    const incompleteTasks = personal.incomplete + collaborative.incomplete;

    const startTasks = personal.start + collaborative.start;

    const completionPercentage =
      totalTasks === 0
        ? 0
        : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    // ----------------------------------------------------------
    // 6. Prepare stats
    // ----------------------------------------------------------

    const stats = {
      overview: {
        totalTasks,
        completedTasks,
        pendingTasks,
        ongoingTasks,
        incompleteTasks,
        startTasks,
        completionPercentage,
      },

      personal,

      collaborative,
    };

    // ----------------------------------------------------------
    // 7. Store in Redis
    // ----------------------------------------------------------

    await setCache(
      cacheKey,
      stats,
      "EX",
      300 // 5 minutes
    );

    // ----------------------------------------------------------
    // 8. Response
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(200, stats, "User stats fetched successfully", true)
      );
  } catch (error) {
    console.error("getUserStats error:", error);

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch user stats", false));
  }
};


const getUserActivity = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user ID
    // ----------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    // ----------------------------------------------------------
    // 2. Validate user ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user ID", false));
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // ----------------------------------------------------------
    // 3. Pagination
    // ----------------------------------------------------------

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      50
    );

    const skip = (page - 1) * limit;

    // ----------------------------------------------------------
    // 4. Activity type filter
    // ----------------------------------------------------------

    const type = req.query.type || "all";

    // ----------------------------------------------------------
    // 5. Create Redis cache key
    // ----------------------------------------------------------

    const cacheKey = userActivityKey(userId, page, limit, type);

    // ----------------------------------------------------------
    // 6. Check Redis cache
    // ----------------------------------------------------------

    const cachedActivity = await getCache(cacheKey);

    if (cachedActivity) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cachedActivity),
            "User activities fetched successfully",
            true
          )
        );
    }

    // ----------------------------------------------------------
    // 7. Get user's group tasks
    // ----------------------------------------------------------

    const userTasks = await Todo.find({
      $or: [
        {
          createdBy: userObjectId,
        },
        {
          "participants.user": userObjectId,
        },
      ],

      isDeleted: false,
    })
      .select("_id")
      .lean();

    const todoIds = userTasks.map((todo) => todo._id);

    // ----------------------------------------------------------
    // 8. Build activity filter
    // ----------------------------------------------------------

    const activityFilter = {
      todo: {
        $in: todoIds,
      },
    };

    if (type !== "all") {
      activityFilter.type = type;
    }

    // ----------------------------------------------------------
    // 9. Fetch activities + total count
    // ----------------------------------------------------------

    const [activities, total] = await Promise.all([
      TaskActivity.find(activityFilter)
        .populate({
          path: "actor",
          select: "name profileImage",
        })
        .populate({
          path: "targetUser",
          select: "name profileImage",
        })
        .populate({
          path: "todo",
          select: "title",
        })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      TaskActivity.countDocuments(activityFilter),
    ]);

    // ----------------------------------------------------------
    // 10. Pagination
    // ----------------------------------------------------------

    const totalPages = Math.ceil(total / limit);

    const result = {
      activities,

      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    // ----------------------------------------------------------
    // 11. Store result in Redis
    // ----------------------------------------------------------

    await setCache(cacheKey, result, "EX", 30);

    // ----------------------------------------------------------
    // 12. Send response
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "User activities fetched successfully",
          true
        )
      );
  } catch (error) {
    console.error("getUserActivity error:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to fetch user activities", false)
      );
  }
};

const getUserNotifications = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user ID
    // ----------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    // ----------------------------------------------------------
    // 2. Validate user ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user id", false));
    }

    // ----------------------------------------------------------
    // 3. Parse and validate pagination
    // ----------------------------------------------------------

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      50
    );

    const skip = (page - 1) * limit;

    // ----------------------------------------------------------
    // 4. Generate Redis cache key
    // ----------------------------------------------------------

    const cacheKey = userNotificationKey(userId, page, limit);

    // ----------------------------------------------------------
    // 5. Check Redis cache
    // ----------------------------------------------------------

    let cachedNotifications = null;

    try {
      cachedNotifications = await getCache(cacheKey);
    } catch (redisError) {
      // Redis failure should not break the API.
      console.error(
        "Redis notification cache read failed:",
        redisError.message
      );
    }

    if (cachedNotifications) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            cachedNotifications,
            "Notifications retrieved successfully",
            true
          )
        );
    }

    // ----------------------------------------------------------
    // 6. Fetch notifications and total count in parallel
    // ----------------------------------------------------------

    const [notifications, totalNotifications] = await Promise.all([
      Notification.find({
        user: userId,
      })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments({
        user: userId,
      }),
    ]);

    // ----------------------------------------------------------
    // 7. Calculate pagination metadata
    // ----------------------------------------------------------

    const totalPages = Math.ceil(totalNotifications / limit);

    const data = {
      notifications,

      pagination: {
        currentPage: page,
        limit,
        totalNotifications,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    // ----------------------------------------------------------
    // 8. Store fresh data in Redis
    // ----------------------------------------------------------

    try {
      await setCache(cacheKey, data, 600);
    } catch (redisError) {
      // Redis failure should not affect successful DB response.
      console.error(
        "Redis notification cache write failed:",
        redisError.message
      );
    }

    // ----------------------------------------------------------
    // 9. Send response
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(200, data, "Notifications retrieved successfully", true)
      );
  } catch (error) {
    console.error("Get user notifications error:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to retrieve notifications", false)
      );
  }
};

const getUserSessions = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user ID
    // ----------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    // ----------------------------------------------------------
    // 2. Validate user ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user id", false));
    }

    // ----------------------------------------------------------
    // 3. Get active sessions
    // ----------------------------------------------------------

    const sessions = await Session.find({
      user: userId,
      expiresAt: { $gt: new Date() },
    })
      .select(
        "_id device browser os ipAddress userAgent createdAt lastActiveAt expiresAt"
      )
      .sort({
        lastActiveAt: -1,
      })
      .lean();

    // ----------------------------------------------------------
    // 4. No active sessions
    // ----------------------------------------------------------

    if (sessions.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], "No active sessions found", true));
    }

    // ----------------------------------------------------------
    // 5. Mark current session
    // ----------------------------------------------------------

    const currentSessionId = req.user?.sessionId;

    const formattedSessions = sessions.map((session) => ({
      id: session._id,
      device: session.device,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      isCurrent:
        currentSessionId && session._id.toString() === currentSessionId,
    }));

    // ----------------------------------------------------------
    // 6. Send response
    // ----------------------------------------------------------

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          formattedSessions,
          "User sessions retrieved successfully",
          true
        )
      );
  } catch (error) {
    console.error("Get user sessions error:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to retrieve user sessions", false)
      );
  }
};
const markNotificationAsRead = async (req, res) => {};
const markAllNotificationsAsRead = async (req, res) => {};
const resendEmailVerificationOTP = async (req, res) => {};

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
  searchUser,
  generateEmailVerificationOtp,
  verifyEmail,
  generateUpdateEmailOtp,
  verifyUpdateEmailOtp,
  getUserStats,
  getUserActivity,
  getUserNotifications,
  getUserSessions,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  resendEmailVerificationOTP,

};

// verifyEmail;✅✅✅✅
// updateEmail;
// getUserStats;
// Total Tasks
// Completed Tasks
// Pending Tasks
// Overdue Tasks
// Collaborative Tasks
// Created Tasks
// getUserActivity;
// getUserNotifications;
// getUserInvitations;
// getUserSessions;
// deactivateMyAccount;
// 2. resendEmailVerificationOTP
// 4. markNotificationAsRead
// 5. markAllNotificationsAsRead
