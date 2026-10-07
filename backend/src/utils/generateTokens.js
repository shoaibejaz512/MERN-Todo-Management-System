import jwt from "jsonwebtoken";

// ----------------------------------------------------------
// JWT Secrets
// ----------------------------------------------------------

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// ----------------------------------------------------------
// Validate JWT secrets at application startup
// ----------------------------------------------------------

if (!ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is not configured");
}

if (!REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET is not configured");
}

// ----------------------------------------------------------
// Sign Access Token
// ----------------------------------------------------------
// Lifetime: 15 minutes
//
// Payload:
// {
//   userId,
//   sessionId
// }
// ----------------------------------------------------------

export function signAccessToken(user, sessionId) {
  if (!user?._id) {
    throw new Error("User ID is required to generate access token");
  }

  if (!sessionId) {
    throw new Error("Session ID is required to generate access token");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      sessionId: sessionId.toString(),
    },
    ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
}

// ----------------------------------------------------------
// Sign Refresh Token
// ----------------------------------------------------------
// Lifetime: 7 days
//
// Payload:
// {
//   userId,
//   sessionId
// }
// ----------------------------------------------------------

export function signRefreshToken(user, sessionId) {
  if (!user?._id) {
    throw new Error("User ID is required to generate refresh token");
  }

  if (!sessionId) {
    throw new Error("Session ID is required to generate refresh token");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      sessionId: sessionId.toString(),
    },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
}
