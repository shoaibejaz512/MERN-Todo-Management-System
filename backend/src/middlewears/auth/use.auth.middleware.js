import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import Session from "../../models/session.model.js";
import ApiResponse from "../../utils/apiResponseHandler.js";

export const verifyJWT = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json(
        new ApiResponse(
          401,
          null,
          "Access token is required",
          false
        )
      );
    }

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET,
        { algorithms: ["HS256"] }
      );
    } catch (error) {
      const message =
        error.name === "TokenExpiredError"
          ? "Access token expired"
          : "Invalid access token";

      return res.status(401).json(
        new ApiResponse(401, null, message, false)
      );
    }

    if (
      !decoded?.userId ||
      !decoded?.sessionId ||
      !mongoose.Types.ObjectId.isValid(decoded.userId) ||
      !mongoose.Types.ObjectId.isValid(decoded.sessionId)
    ) {
      return res.status(401).json(
        new ApiResponse(
          401,
          null,
          "Invalid access token payload",
          false
        )
      );
    }

    // Ensure this session still belongs to the user and is active.
    const activeSession = await Session.exists({
      _id: decoded.sessionId,
      user: decoded.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!activeSession) {
      res.clearCookie("accessToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      return res.status(401).json(
        new ApiResponse(
          401,
          null,
          "Session expired or revoked. Please log in again.",
          false
        )
      );
    }

    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };

    return next();
  } catch (error) {
    console.error("JWT verification error:", error.message);

    return res.status(500).json(
      new ApiResponse(
        500,
        null,
        "Authentication could not be verified",
        false
      )
    );
  }
};
