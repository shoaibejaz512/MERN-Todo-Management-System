const DEFAULT_MAX_AGE_SECONDS = 5 * 60;

export function requireRecentAuth({
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
} = {}) {
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > 15 * 60
  ) {
    throw new Error("Invalid recent-authentication age");
  }

  return function recentAuthMiddleware(req, res, next) {
    const user = req.user;

    if (!user?.userId) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      return next(error);
    }

    // authTime must be explicitly set by trusted authentication
    // middleware from a verified token claim or server-side session.
    const authTime = user.authTime;

    if (!Number.isSafeInteger(authTime) || authTime <= 0) {
      const error = new Error("Recent authentication required");
      error.statusCode = 403;
      return next(error);
    }

    const now = Math.floor(Date.now() / 1000);
    const age = now - authTime;

    if (age < 0 || age > maxAgeSeconds) {
      const error = new Error("Recent authentication required");
      error.statusCode = 403;
      return next(error);
    }

    return next();
  };
}
