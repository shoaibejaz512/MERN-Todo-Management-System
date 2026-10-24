import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("JWT access/refresh secrets must be configured");
}

const JWT_ALGORITHM = "HS256";

export function signAccessToken(user, sessionId) {
  if (!user?._id || !sessionId) {
    throw new Error("User ID and session ID are required");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      sessionId: sessionId.toString(),
    },
    ACCESS_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: "15m",
    }
  );
}


export function signRefreshToken(user, sessionId) {
  if (!user?._id || !sessionId) {
    throw new Error("User ID and session ID are required");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      sessionId: sessionId.toString(),
      jti: crypto.randomUUID(),
    },
    REFRESH_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "7d",
    }
  );
}


export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });
}

export function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function getRefreshTokenExpiry(token) {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded.exp !== "number") {
    throw new Error("Refresh token has no valid expiry");
  }

  return new Date(decoded.exp * 1000);
}
