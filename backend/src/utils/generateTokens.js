import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export function signAccessToken(user) {
  return jwt.sign({ userId: user._id.toString() }, ACCESS_SECRET, {
    expiresIn: "15m",
  });
}

export function signRefreshToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
    },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
}
