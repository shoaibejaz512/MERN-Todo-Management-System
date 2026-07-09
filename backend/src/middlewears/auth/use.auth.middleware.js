import jwt from "jsonwebtoken";
import ApiResponse from "../../utils/apiResponseHandler.js";
// import ApiResponse from "../utils/apiResponseHandler.js";

export const verifyJWT = (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    console.log("cookies token",token)

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    req.user = decoded; // { userId: "..." }

    next();
  } catch (error) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid token", false));
  }
};
