// utils/setAuthCookies.js

export const setAuthCookies = (res, accessToken, refreshToken) => {
//   const isProduction = process.env.NODE_ENV === "production";

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};


// utils/clearAuthCookies.js
export const clearAuthCookies = (res) => {
//   const isProduction = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
  };

  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);
};