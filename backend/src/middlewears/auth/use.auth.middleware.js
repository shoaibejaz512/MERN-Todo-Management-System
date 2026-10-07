import jwt from "jsonwebtoken";

import ApiResponse from "../../utils/apiResponseHandler.js";

export const verifyJWT = (req, res, next) => {
  try {
    // ----------------------------------------------------------
    // 1. Get access token from HTTP-only cookie
    // ----------------------------------------------------------

    const token = req.cookies?.accessToken;

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Access token is required", false));
    }

    // ----------------------------------------------------------
    // 2. Verify access token
    // ----------------------------------------------------------

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // ----------------------------------------------------------
    // 3. Validate required JWT payload
    // ----------------------------------------------------------

    if (!decoded?.userId) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "Invalid access token payload", false)
        );
    }

    // ----------------------------------------------------------
    // 4. Attach authenticated user to request
    //
    // Expected payload:
    //
    // {
    //   userId: "...",
    //   sessionId: "..."
    // }
    //
    // sessionId will exist after you update your login
    // and token-generation flow.
    // ----------------------------------------------------------

    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };

    // ----------------------------------------------------------
    // 5. Continue to controller
    // ----------------------------------------------------------

    next();
  } catch (error) {
    // ----------------------------------------------------------
    // JWT expired
    // ----------------------------------------------------------

    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Access token expired", false));
    }

    // ----------------------------------------------------------
    // Invalid JWT
    // ----------------------------------------------------------

    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid access token", false));
    }

    // ----------------------------------------------------------
    // Other authentication errors
    // ----------------------------------------------------------

    console.error("JWT verification error:", error);

    return res
      .status(401)
      .json(new ApiResponse(401, null, "Authentication failed", false));
  }
};
