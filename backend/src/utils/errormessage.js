export const sendUnauthorized = (res, message) =>
  res.status(401).json(new ApiResponse(401, null, message, false));
