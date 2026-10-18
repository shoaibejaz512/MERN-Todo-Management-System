// middleware/accountDeletionReAuthentication.js
const bcrypt = require("bcrypt");
const User = require("../models/User");
const ApiResponse = require("../utils/ApiResponse");

export const accountDeletionReAuthentication = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Password is required", false));
    }

    const user = await User.findById(req.user.userId).select("+password");

    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Incorrect password", false));
    }

    next();
  } catch (err) {
    next(err);
  }
};

